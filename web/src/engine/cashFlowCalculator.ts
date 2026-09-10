/**
 * 直接法现金流量表（纯函数）
 *
 * 原理：遍历所有分录，找到涉及货币资金科目（1001/1002）的分录行，
 * 按该分录行上打的 cfCategory 归集：
 *   - 借货币资金 → inflow 加到对应分类
 *   - 贷货币资金 → outflow 加到对应分类
 *   - isClosing=true 的分录跳过（结转不入 CF）
 *
 * 期初/期末现金 = 库存现金 + 银行存款 的期初/期末余额之和（时点数）。
 */
import type { AccountBalance, CashFlowCategory, JournalEntry, Period } from '@/types';
import { CASH_CODES } from '@/data/accounts.config';

export interface CashFlowSection {
  category: CashFlowCategory;   // OPERATING / INVESTING / FINANCING / NONE
  inflow: number;
  outflow: number;
  net: number;                  // inflow - outflow
}

export interface CashFlowReport {
  periodId: string;
  sections: CashFlowSection[];
  operatingNet: number;
  investingNet: number;
  financingNet: number;
  totalNet: number;             // 现金净增加
  openingCash: number;
  endingCash: number;
}

/**
 * 计算某期间的直接法现金流量表
 */
export function calcCashFlow(
  periodId: string,
  entries: JournalEntry[],
  balances: Record<string, Record<string, AccountBalance>>
): CashFlowReport {
  const buckets: Record<CashFlowCategory, { inflow: number; outflow: number }> = {
    OPERATING: { inflow: 0, outflow: 0 },
    INVESTING: { inflow: 0, outflow: 0 },
    FINANCING: { inflow: 0, outflow: 0 },
    NONE: { inflow: 0, outflow: 0 }
  };

  const periodEntries = entries.filter((e) => e.periodId === periodId && !e.isClosing);

  for (const e of periodEntries) {
    for (const line of e.lines) {
      if (!CASH_CODES.includes(line.accountCode)) continue;
      const cat = (line.cfCategory ?? 'NONE') as CashFlowCategory;
      if (line.debit > 0) buckets[cat].inflow += line.debit;    // 借货币资金 → 流入
      if (line.credit > 0) buckets[cat].outflow += line.credit; // 贷货币资金 → 流出
    }
  }

  const sections: CashFlowSection[] = (['OPERATING', 'INVESTING', 'FINANCING', 'NONE'] as CashFlowCategory[]).map(
    (c) => ({
      category: c,
      inflow: buckets[c].inflow,
      outflow: buckets[c].outflow,
      net: buckets[c].inflow - buckets[c].outflow
    })
  );

  const operatingNet = sections[0].net;
  const investingNet = sections[1].net;
  const financingNet = sections[2].net;
  const totalNet = operatingNet + investingNet + financingNet + sections[3].net;

  // 期初 / 期末现金
  const openingCash = CASH_CODES.reduce((s, code) => {
    const b = balances[code]?.[periodId];
    return s + (b ? b.openingDebit - b.openingCredit : 0);
  }, 0);
  const endingCash = CASH_CODES.reduce((s, code) => {
    return s + (balances[code]?.[periodId]?.closingBalance ?? 0);
  }, 0);

  return {
    periodId,
    sections,
    operatingNet,
    investingNet,
    financingNet,
    totalNet,
    openingCash,
    endingCash
  };
}
