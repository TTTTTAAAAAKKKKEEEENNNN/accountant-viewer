/**
 * 会计三表沙盘 · 核心类型定义
 * 详细语义参见 openspec/specs/system-overview.md
 */

/* ------------------------------------------------------------------ */
/* 科目                                                                */
/* ------------------------------------------------------------------ */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountDirection = 'DEBIT' | 'CREDIT';
export type StatementType = 'BS' | 'PL' | 'BOTH';

export interface Account {
  code: string;                    // 唯一主键
  name: string;
  type: AccountType;
  direction: AccountDirection;
  parentCode: string | null;       // 父科目 code；顶层为 null
  isLeaf: boolean;                 // 只有叶子科目才能记账
  statement: StatementType;
  /**
   * 是否为备抵科目（如累计折旧、坏账准备、累计摊销、各类减值准备）。
   * 语义：名义上属于某类（如 ASSET），但正向余额应从所属类别中扣减。
   * 影响：仅报表汇总（reportAggregator）按 -1 处理；期间矩阵/科目树的原始
   *      余额展示不做符号翻转。与 direction 正交。
   */
  isContra?: boolean;
}

/* ------------------------------------------------------------------ */
/* 期间                                                                */
/* ------------------------------------------------------------------ */

export type PeriodStatus = 'OPEN' | 'CLOSED';

/**
 * 期间只以"月"为真源；季度是派生视图（见 engine/quarterView.ts）。
 */
export interface Period {
  id: string;                      // 如 "2025P01"
  name: string;                    // 如 "2025年1月"
  kind: 'MONTH';                   // 预留字段，未来可能扩展
  year: number;                    // 2025
  monthNo: number;                 // 1..12
  quarterNo: 1 | 2 | 3 | 4;        // 派生分组用
  startDate: string;               // "2025-01-01"
  endDate: string;                 // "2025-01-31"
  order: number;                   // 全局序号
  status: PeriodStatus;
}

/**
 * 季度视图（不落库，展示层聚合）。
 */
export interface QuarterView {
  id: string;                      // 如 "2025Q1"
  name: string;                    // 如 "2025年一季度"
  year: number;
  quarterNo: 1 | 2 | 3 | 4;
  monthIds: string[];              // 该季度包含的月度 period id（按顺序）
}

/* ------------------------------------------------------------------ */
/* 分录 / 事件                                                          */
/* ------------------------------------------------------------------ */

export type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING' | 'NONE';

export interface JournalLine {
  accountCode: string;
  debit: number;                   // 借方金额（≥0）
  credit: number;                  // 贷方金额（≥0），且与 debit 必须互斥
  /**
   * 现金流分类：仅当该分录行涉及货币资金（借或贷了 1001/1002）时才有意义。
   * 用于直接法 CF 表归集。非货币资金侧和结转分录一律不填。
   */
  cfCategory?: CashFlowCategory;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  eventId: string;                 // 所属业务事件
  periodId: string;                // 归属月度期间 id
  date: string;                    // "2025-01-15"
  summary: string;                 // 摘要
  lines: JournalLine[];
  isClosing?: boolean;             // 结转分录 → CF 表跳过、UI 特殊高亮
}

export interface BusinessEvent {
  id: string;
  periodId: string;
  templateCode: string;
  params: Record<string, any>;
  description: string;
  createdAt: string;               // ISO 时间
  entryIds: string[];              // 关联的分录 id 列表
}

/* ------------------------------------------------------------------ */
/* 事件模板                                                             */
/* ------------------------------------------------------------------ */

export type EventCategory = '经营' | '投资' | '筹资' | '结转';

export interface EventParamOption {
  label: string;
  value: string | number;
}

export interface EventParamDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'select';
  required?: boolean;
  default?: number | string;
  min?: number;
  placeholder?: string;
  /** type='select' 时的候选项；用户只能从中选一个，防止乱填 */
  options?: EventParamOption[];
}

/**
 * 模板 build 函数的上下文：可访问当前 store 的余额等信息（用于结转类模板）。
 */
export interface TemplateBuildContext {
  periodId: string;
  /** 取指定科目在当前期间的"按科目方向的期末正向余额"（尚未含本次事件） */
  getBalance: (accountCode: string) => number;
  /** 取指定科目在当前期间的期末借方 / 贷方金额（结转本年利润用） */
  getClosingDebit: (accountCode: string) => number;
  getClosingCredit: (accountCode: string) => number;
}

/** 模板产出的分录（尚未分配 id / eventId / periodId） */
export type DraftEntry = Omit<JournalEntry, 'id' | 'eventId' | 'periodId'>;

export interface EventTemplate {
  code: string;
  name: string;
  category: EventCategory;
  description?: string;
  params: EventParamDef[];
  /**
   * 纯函数：把用户参数 + 上下文翻译成若干条会计分录。
   * 必须保证每条分录 Σdebit === Σcredit（容差 0.005）。
   */
  build: (params: Record<string, any>, ctx: TemplateBuildContext) => DraftEntry[];
}

/* ------------------------------------------------------------------ */
/* 派生数据：余额                                                       */
/* ------------------------------------------------------------------ */

export interface AccountBalance {
  accountCode: string;
  periodId: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;             // 本期借方发生额
  periodCredit: number;            // 本期贷方发生额
  closingDebit: number;
  closingCredit: number;
  /** 按科目方向的期末正向余额（借方科目取借方净额，贷方科目取贷方净额） */
  closingBalance: number;
}

/* ------------------------------------------------------------------ */
/* 报表结构（简化版：仅摆放科目 + 逐级汇总）                              */
/* ------------------------------------------------------------------ */

export interface ReportNode {
  key: string;                     // 全局唯一
  label: string;
  accountCodes?: string[];         // 叶子节点绑定的明细科目 code；分组节点为空
  children?: ReportNode[];         // 子节点；叶子节点为空
  defaultExpanded?: boolean;
}

export interface ReportConfig {
  key: 'BS' | 'PL' | 'CF';
  name: string;
  root: ReportNode[];
}

/** 报表求值结果的一行（用于 UI 树形表格） */
export interface ReportRow {
  key: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  isLeaf: boolean;
  /** 每个期间 id 对应的金额 */
  amounts: Record<string, number>;
  children?: ReportRow[];
}

/* ------------------------------------------------------------------ */
/* 事件影响（点击右侧事件后驱动桑基图 + 报表高亮）                       */
/* ------------------------------------------------------------------ */

/**
 * 事件对**某个报表节点**的净影响。
 * - direction: '↑' 表示该报表项数值增加；'↓' 表示减少；'~' 表示金额为 0（对冲/结转，通常不展示）
 * - delta: 该报表项在应用完本事件后的**带号净变动**（正数 = 增加，负数 = 减少）
 * - contributedAccountCodes: 影响该节点的具体明细科目（供 tooltip 用）
 */
export interface ReportImpactRow {
  reportKey: 'BS' | 'PL' | 'CF';
  nodeKey: string;                  // ReportNode.key
  nodeLabel: string;
  direction: '↑' | '↓' | '~';
  delta: number;
  contributedAccountCodes: string[];
}

/** 桑基图一条边：借方科目 → 贷方科目，value=金额 */
export interface SankeyEdge {
  fromCode: string;                 // 借方科目 code
  fromName: string;
  toCode: string;                   // 贷方科目 code
  toName: string;
  value: number;
}

/** 一个事件的完整影响画像 */
export interface EventImpact {
  eventId: string;
  periodId: string;
  isClosing: boolean;
  /** 桑基图数据：所有借方 → 贷方的资金流向（同对科目已合并） */
  sankey: SankeyEdge[];
  /** 各报表节点受到的净影响；已剔除方向为 '~' 的 */
  reportImpacts: ReportImpactRow[];
  /** 便于 UI 快速查询：按报表分组的 nodeKey → ReportImpactRow */
  impactMapByReport: Record<'BS' | 'PL' | 'CF', Record<string, ReportImpactRow>>;
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

export interface ValidationError {
  code: string;                    // 如 'UNBALANCED_ENTRY'
  message: string;                 // 中文提示
  detail?: Record<string, any>;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };
