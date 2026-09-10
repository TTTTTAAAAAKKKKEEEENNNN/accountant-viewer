/**
 * 分录 → 科目余额 计算引擎（纯函数）
 *
 * 规则：
 *  - 期初余额 = 上期期末余额（第一个期间为 0）
 *  - 本期借 / 本期贷 = 本期所有分录的 debit / credit 累加
 *  - 期末借 / 期末贷 = 期初借 + 本期借 / 期初贷 + 本期贷
 *  - closingBalance（正向余额）：按科目 direction 取
 *      DEBIT  科目：closingDebit - closingCredit
 *      CREDIT 科目：closingCredit - closingDebit
 *
 * 父科目余额 = 所有子科目 closingBalance 之和（isContra 不参与翻转，
 * 因为期间矩阵定位是"试算平衡表"，累计折旧原样正数展示）。
 */
import type { Account, AccountBalance, JournalEntry, Period } from '@/types';

/**
 * 计算全量余额矩阵：accountCode × periodId → AccountBalance
 *
 * @param periods    已按 order 升序
 * @param accounts   所有科目（含非叶子）
 * @param entries    所有分录
 */
export function calcAllBalances(
  periods: Period[],
  accounts: Account[],
  entries: JournalEntry[]
): Record<string, Record<string, AccountBalance>> {
  const sortedPeriods = [...periods].sort((a, b) => a.order - b.order);
  const leafAccounts = accounts.filter((a) => a.isLeaf);
  const parentAccounts = accounts.filter((a) => !a.isLeaf);

  // 分录按 periodId 分桶
  const entriesByPeriod = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    if (!entriesByPeriod.has(e.periodId)) entriesByPeriod.set(e.periodId, []);
    entriesByPeriod.get(e.periodId)!.push(e);
  }

  // 结果：accountCode -> periodId -> balance
  const result: Record<string, Record<string, AccountBalance>> = {};
  for (const a of accounts) result[a.code] = {};

  // 逐期滚动
  for (let i = 0; i < sortedPeriods.length; i++) {
    const p = sortedPeriods[i];
    const prev = i > 0 ? sortedPeriods[i - 1] : null;
    const periodEntries = entriesByPeriod.get(p.id) ?? [];

    // 汇总本期各叶子科目发生额
    const periodDebitMap = new Map<string, number>();
    const periodCreditMap = new Map<string, number>();
    for (const e of periodEntries) {
      for (const line of e.lines) {
        periodDebitMap.set(line.accountCode, (periodDebitMap.get(line.accountCode) ?? 0) + line.debit);
        periodCreditMap.set(line.accountCode, (periodCreditMap.get(line.accountCode) ?? 0) + line.credit);
      }
    }

    // 计算叶子科目
    for (const acc of leafAccounts) {
      const prevBal = prev ? result[acc.code][prev.id] : undefined;
      const openingDebit = prevBal?.closingDebit ?? 0;
      const openingCredit = prevBal?.closingCredit ?? 0;
      const periodDebit = periodDebitMap.get(acc.code) ?? 0;
      const periodCredit = periodCreditMap.get(acc.code) ?? 0;
      const closingDebit = openingDebit + periodDebit;
      const closingCredit = openingCredit + periodCredit;
      const closingBalance =
        acc.direction === 'DEBIT' ? closingDebit - closingCredit : closingCredit - closingDebit;

      result[acc.code][p.id] = {
        accountCode: acc.code,
        periodId: p.id,
        openingDebit,
        openingCredit,
        periodDebit,
        periodCredit,
        closingDebit,
        closingCredit,
        closingBalance
      };
    }

    // 计算父科目 = 子科目递归求和（不翻转 isContra）
    // 子 → 父 拓扑序：先按科目 code 长度深到浅，或按 parentCode 依赖顺序
    // 这里用简单 fixed-point：直到所有 parent 都填上
    const pending = new Set(parentAccounts.map((a) => a.code));
    while (pending.size > 0) {
      let progressed = false;
      for (const code of Array.from(pending)) {
        const children = accounts.filter((a) => a.parentCode === code);
        // 所有子都已计算才能算父
        if (children.every((c) => result[c.code][p.id] !== undefined)) {
          const parent = accounts.find((a) => a.code === code)!;
          let od = 0, oc = 0, pd = 0, pc = 0, cd = 0, cc = 0, cb = 0;
          for (const c of children) {
            const b = result[c.code][p.id];
            od += b.openingDebit;
            oc += b.openingCredit;
            pd += b.periodDebit;
            pc += b.periodCredit;
            cd += b.closingDebit;
            cc += b.closingCredit;
            cb += b.closingBalance;
          }
          result[parent.code][p.id] = {
            accountCode: parent.code,
            periodId: p.id,
            openingDebit: od,
            openingCredit: oc,
            periodDebit: pd,
            periodCredit: pc,
            closingDebit: cd,
            closingCredit: cc,
            closingBalance: cb
          };
          pending.delete(code);
          progressed = true;
        }
      }
      if (!progressed) break; // 环或数据异常，退出防止死循环
    }
  }

  return result;
}

/**
 * 便捷取值：期末正向余额
 */
export function getClosingBalance(
  balances: Record<string, Record<string, AccountBalance>>,
  accountCode: string,
  periodId: string
): number {
  return balances[accountCode]?.[periodId]?.closingBalance ?? 0;
}
