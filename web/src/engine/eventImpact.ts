/**
 * 事件影响分析：给定一个业务事件的所有分录，计算：
 *  1) 桑基图数据（借方科目 → 贷方科目 的资金流向）
 *  2) 各报表节点（BS/PL/CF）的净影响（增↑ / 减↓ / 对冲~）
 *
 * 纯函数，无副作用；供 EventImpactPanel / ReportView 复用。
 *
 * ⚠️ 边界处理：
 *  - 单行借贷同时>0 或同时=0 的非法分录：跳过该行（validators 已在录入时拦截，这里做二次防御）
 *  - 引用了不存在的科目：跳过该行，控制台警告
 *  - 备抵科目：会计余额增加不代表报表增加，需按 isContra 再翻转符号
 *  - 结转分录 isClosing：仍参与 BS/PL 汇总，但**不进入 CF 表**（保持与 cashFlowCalculator 一致）
 */
import type {
  Account,
  EventImpact,
  JournalEntry,
  JournalLine,
  ReportConfig,
  ReportImpactRow,
  ReportNode,
  SankeyEdge
} from '@/types';
import { CASH_CODES } from '@/data/accounts.config';

const EPS = 0.005;

/* ------------------------------------------------------------------ */
/* 报表科目 → 节点路径 索引（一次性构建）                                */
/* ------------------------------------------------------------------ */

interface NodePath {
  reportKey: 'BS' | 'PL' | 'CF';
  nodeKey: string;
  nodeLabel: string;
}

/**
 * 建立 accountCode → 所有引用它的报表节点（叶子 + 所有祖先）的映射。
 * 使得后续对某科目余额变动能快速定位到"该科目影响到哪些报表行"。
 */
function buildAccountToNodePaths(
  reports: ReportConfig[]
): Record<string, NodePath[]> {
  const map: Record<string, NodePath[]> = {};

  const walk = (node: ReportNode, reportKey: 'BS' | 'PL' | 'CF', ancestors: NodePath[]) => {
    const self: NodePath = { reportKey, nodeKey: node.key, nodeLabel: node.label };
    const chain = [...ancestors, self];
    if (node.accountCodes && node.accountCodes.length > 0) {
      for (const code of node.accountCodes) {
        if (!map[code]) map[code] = [];
        // 该叶子 + 所有祖先都受影响
        for (const p of chain) {
          if (!map[code].some((x) => x.reportKey === p.reportKey && x.nodeKey === p.nodeKey)) {
            map[code].push(p);
          }
        }
      }
    }
    if (node.children) {
      for (const c of node.children) walk(c, reportKey, chain);
    }
  };

  for (const r of reports) {
    for (const root of r.root) walk(root, r.key, []);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* 桑基边生成                                                          */
/* ------------------------------------------------------------------ */

/**
 * 一条分录内，把 N 借 → M 贷 展开成边。
 * - 常规二线分录：直接一条边
 * - 多借一贷 / 一借多贷：直接把每一"非唯一侧"配到"唯一侧"
 * - 多借多贷（罕见）：按贷方金额比例把每一借行分摊到各贷行
 */
function expandEntryToEdges(entry: JournalEntry, accountMap: Record<string, Account>): SankeyEdge[] {
  const debits = entry.lines.filter((l) => l.debit > EPS && l.credit < EPS);
  const credits = entry.lines.filter((l) => l.credit > EPS && l.debit < EPS);
  if (debits.length === 0 || credits.length === 0) return [];

  const totalCredit = credits.reduce((s, l) => s + l.credit, 0);
  if (totalCredit < EPS) return [];

  const edges: SankeyEdge[] = [];
  for (const d of debits) {
    for (const c of credits) {
      const value = d.debit * (c.credit / totalCredit);
      if (value < EPS) continue;
      const fromAcc = accountMap[d.accountCode];
      const toAcc = accountMap[c.accountCode];
      if (!fromAcc || !toAcc) continue;
      edges.push({
        fromCode: d.accountCode,
        fromName: fromAcc.name,
        toCode: c.accountCode,
        toName: toAcc.name,
        value
      });
    }
  }
  return edges;
}

/** 合并同源同目的边 */
function mergeEdges(edges: SankeyEdge[]): SankeyEdge[] {
  const map = new Map<string, SankeyEdge>();
  for (const e of edges) {
    const k = `${e.fromCode}->${e.toCode}`;
    const cur = map.get(k);
    if (cur) cur.value += e.value;
    else map.set(k, { ...e });
  }
  return Array.from(map.values()).filter((e) => e.value > EPS);
}

/* ------------------------------------------------------------------ */
/* 报表影响计算                                                        */
/* ------------------------------------------------------------------ */

/**
 * 计算某分录行对"该科目所属 BS/PL 报表节点"的带号变动。
 *  - 借方科目（direction=DEBIT）：借+ 贷-
 *  - 贷方科目（direction=CREDIT）：贷+ 借-
 *  - 备抵科目（isContra=true）：本科目余额↑=报表汇总↓，符号再翻转一次
 */
function accountDeltaForReport(line: JournalLine, acc: Account): number {
  const raw = acc.direction === 'DEBIT' ? line.debit - line.credit : line.credit - line.debit;
  return acc.isContra ? -raw : raw;
}

/** 主入口 */
export function computeEventImpact(
  entries: JournalEntry[],
  accountMap: Record<string, Account>,
  reports: ReportConfig[]
): EventImpact | null {
  if (!entries || entries.length === 0) return null;

  const isClosing = entries.every((e) => !!e.isClosing);
  const eventId = entries[0].eventId;
  const periodId = entries[0].periodId;

  const nodePathMap = buildAccountToNodePaths(reports);

  /** BS/PL 报表节点 nodeKey → 累计带号 delta */
  const deltaByNode: Record<string, ReportImpactRow> = {};
  /** CF 分类累计（不区分节点，只累计经营/投资/筹资净额） */
  const cfDelta = { op: 0, inv: 0, fin: 0, cashInflow: 0, cashOutflow: 0 };

  const allEdges: SankeyEdge[] = [];

  for (const entry of entries) {
    // 桑基边
    allEdges.push(...expandEntryToEdges(entry, accountMap));

    // 报表节点影响：逐行汇总
    for (const line of entry.lines) {
      const acc = accountMap[line.accountCode];
      if (!acc) {
        // 引用不存在的科目：跳过 + 警告
        // eslint-disable-next-line no-console
        console.warn(`[eventImpact] 分录引用了未知科目 ${line.accountCode}`);
        continue;
      }
      if ((line.debit > EPS && line.credit > EPS) || (line.debit < EPS && line.credit < EPS)) {
        continue; // 非法行
      }

      const delta = accountDeltaForReport(line, acc);
      const paths = nodePathMap[line.accountCode] ?? [];
      for (const p of paths) {
        const k = `${p.reportKey}|${p.nodeKey}`;
        if (!deltaByNode[k]) {
          deltaByNode[k] = {
            reportKey: p.reportKey,
            nodeKey: p.nodeKey,
            nodeLabel: p.nodeLabel,
            direction: '~',
            delta: 0,
            contributedAccountCodes: []
          };
        }
        deltaByNode[k].delta += delta;
        if (!deltaByNode[k].contributedAccountCodes.includes(line.accountCode)) {
          deltaByNode[k].contributedAccountCodes.push(line.accountCode);
        }
      }

      // CF 影响：结转分录跳过；仅"借/贷货币资金"的行携带 cfCategory
      if (!entry.isClosing && line.cfCategory && line.cfCategory !== 'NONE') {
        const isCashLine = CASH_CODES.includes(line.accountCode);
        if (isCashLine) {
          // 借货币资金 = 流入；贷货币资金 = 流出
          const signed = line.debit - line.credit;
          if (line.cfCategory === 'OPERATING') cfDelta.op += signed;
          else if (line.cfCategory === 'INVESTING') cfDelta.inv += signed;
          else if (line.cfCategory === 'FINANCING') cfDelta.fin += signed;
          if (signed > 0) cfDelta.cashInflow += signed;
          else cfDelta.cashOutflow += -signed;
        }
      }
    }
  }

  // 收集 CF 节点影响（如果 reportTree.CF 有对应节点 key，则挂上）
  const pushCf = (nodeKey: string, nodeLabel: string, delta: number) => {
    if (Math.abs(delta) < EPS) return;
    const k = `CF|${nodeKey}`;
    deltaByNode[k] = {
      reportKey: 'CF',
      nodeKey,
      nodeLabel,
      direction: delta > 0 ? '↑' : '↓',
      delta,
      contributedAccountCodes: []
    };
  };
  pushCf('cf.op', '经营活动净额', cfDelta.op);
  pushCf('cf.inv', '投资活动净额', cfDelta.inv);
  pushCf('cf.fin', '筹资活动净额', cfDelta.fin);
  pushCf('cf.net', '现金净增加额', cfDelta.op + cfDelta.inv + cfDelta.fin);
  pushCf('cf.ending', '期末现金余额', cfDelta.op + cfDelta.inv + cfDelta.fin);

  // 定 direction
  const reportImpacts: ReportImpactRow[] = [];
  const impactMapByReport: EventImpact['impactMapByReport'] = { BS: {}, PL: {}, CF: {} };
  for (const key of Object.keys(deltaByNode)) {
    const row = deltaByNode[key];
    if (Math.abs(row.delta) < EPS) {
      row.direction = '~';
      continue; // 对冲项不展示
    }
    row.direction = row.delta > 0 ? '↑' : '↓';
    reportImpacts.push(row);
    impactMapByReport[row.reportKey][row.nodeKey] = row;
  }

  return {
    eventId,
    periodId,
    isClosing,
    sankey: mergeEdges(allEdges),
    reportImpacts,
    impactMapByReport
  };
}
