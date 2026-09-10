/**
 * 季度视图适配器（纯函数）
 *
 * 语义（详见 openspec §4.1.3）：
 *  - BS 时点数：取 Q 内最后一个 P 的余额
 *  - PL / CF 流量数：Q 内 3 个 P 求和
 *  - CF 期初现金：取 Q 首月期初；期末现金：取 Q 末月期末
 *
 * 本文件只做"从 P 结果聚合到 Q"的展示层适配，不改动底层 P 级数据。
 */
import type { AccountBalance, Period, QuarterView, ReportRow } from '@/types';

/**
 * 把一批 ReportRow（在多个 P 上的值）新增一列 Q 汇总。
 * @param mode  'POINT' 时点数（取最后一个 P）| 'FLOW' 流量数（求和）
 */
export function aggregateRowsToQuarter(
  rows: ReportRow[],
  quarter: QuarterView,
  mode: 'POINT' | 'FLOW'
): ReportRow[] {
  const targetPid = mode === 'POINT' ? quarter.monthIds[quarter.monthIds.length - 1] : null;

  const walk = (row: ReportRow): ReportRow => {
    const amounts = { ...row.amounts };
    if (mode === 'POINT') {
      amounts[quarter.id] = row.amounts[targetPid!] ?? 0;
    } else {
      amounts[quarter.id] = quarter.monthIds.reduce((s, pid) => s + (row.amounts[pid] ?? 0), 0);
    }
    return {
      ...row,
      amounts,
      children: row.children ? row.children.map(walk) : undefined
    };
  };

  return rows.map(walk);
}

/**
 * 计算某季度的某个叶子科目的"时点余额"（用于 BS 期间矩阵单元格）
 */
export function pickQuarterPointBalance(
  balances: Record<string, Record<string, AccountBalance>>,
  quarter: QuarterView,
  accountCode: string
): number {
  const lastPid = quarter.monthIds[quarter.monthIds.length - 1];
  return balances[accountCode]?.[lastPid]?.closingBalance ?? 0;
}

/**
 * 计算某季度的某个叶子科目的"发生额之和"（用于 PL 期间矩阵单元格）
 */
export function pickQuarterFlowBalance(
  balances: Record<string, Record<string, AccountBalance>>,
  quarter: QuarterView,
  accountCode: string,
  metric: 'periodDebit' | 'periodCredit' | 'closingBalance'
): number {
  return quarter.monthIds.reduce((s, pid) => s + (balances[accountCode]?.[pid]?.[metric] ?? 0), 0);
}
