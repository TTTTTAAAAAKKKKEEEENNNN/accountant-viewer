/**
 * 报表分组树 → 逐级汇总（简化版）
 *
 * 规则（详见 openspec/specs/system-overview.md §6.3）：
 *  - 叶子节点：leafAmount = Σ ( account.isContra ? -balance : +balance )
 *  - 父节点：所有子节点金额之和（子节点已带符号）
 *
 * 对多个期间同时求值，产出 UI 树形表格所需的 ReportRow[]。
 */
import type { Account, AccountBalance, Period, ReportConfig, ReportNode, ReportRow } from '@/types';
import { getClosingBalance } from './balanceCalculator';

/**
 * 计算某报表在指定 periodIds 上的所有行。
 *
 * @param config      报表配置
 * @param periodIds   要求值的期间 id 列表（如 ["2025P01","2025P02",...]）
 * @param balances    balanceCalculator 计算出的余额矩阵
 * @param accountMap  科目查表
 */
export function evaluateReport(
  config: ReportConfig,
  periodIds: string[],
  balances: Record<string, Record<string, AccountBalance>>,
  accountMap: Record<string, Account>
): ReportRow[] {
  return config.root.map((n) => walk(n, 0, periodIds, balances, accountMap));
}

function walk(
  node: ReportNode,
  depth: number,
  periodIds: string[],
  balances: Record<string, Record<string, AccountBalance>>,
  accountMap: Record<string, Account>
): ReportRow {
  const hasChildren = !!(node.children && node.children.length > 0);
  const isLeaf = !hasChildren;

  const amounts: Record<string, number> = {};

  if (isLeaf) {
    // 叶子：把 accountCodes 里的余额按 isContra 符号相加
    for (const pid of periodIds) {
      let sum = 0;
      for (const code of node.accountCodes ?? []) {
        const acc = accountMap[code];
        const bal = getClosingBalance(balances, code, pid);
        const signed = acc?.isContra ? -bal : bal;
        sum += signed;
      }
      amounts[pid] = sum;
    }
    return {
      key: node.key,
      label: node.label,
      depth,
      hasChildren: false,
      isLeaf: true,
      amounts
    };
  }

  // 父节点：先递归所有子节点，再逐期求和
  const children = node.children!.map((c) => walk(c, depth + 1, periodIds, balances, accountMap));
  for (const pid of periodIds) {
    amounts[pid] = children.reduce((s, c) => s + (c.amounts[pid] ?? 0), 0);
  }
  return {
    key: node.key,
    label: node.label,
    depth,
    hasChildren: true,
    isLeaf: false,
    amounts,
    children
  };
}

/**
 * 计算"资产合计"这种最顶层汇总（用于校验 A = L + E）
 */
export function sumRootRow(rows: ReportRow[], rootKey: string, periodId: string): number {
  const hit = rows.find((r) => r.key === rootKey);
  return hit?.amounts[periodId] ?? 0;
}
