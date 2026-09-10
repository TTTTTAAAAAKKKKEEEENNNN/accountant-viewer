/**
 * balances store：完全派生数据
 *  - 余额矩阵：由 accounts + periods + entries 通过 balanceCalculator 计算
 *  - 报表：由余额 + reportTree 通过 reportAggregator 计算
 *  - CF：由分录 + 余额 通过 cashFlowCalculator 计算
 *
 * 不持久化。所有 getter 由 Pinia 自动做响应式依赖追踪。
 */
import { defineStore } from 'pinia';
import type { AccountBalance, EventImpact, ReportRow } from '@/types';
import { REPORT_MAP, REPORT_CONFIGS } from '@/data/reportTree.config';
import { calcAllBalances } from '@/engine/balanceCalculator';
import { evaluateReport } from '@/engine/reportAggregator';
import { calcCashFlow, type CashFlowReport } from '@/engine/cashFlowCalculator';
import { computeEventImpact } from '@/engine/eventImpact';
import { useAccountsStore } from './accounts';
import { usePeriodsStore } from './periods';
import { useEventsStore } from './events';
import { useUiStore } from './ui';

export const useBalancesStore = defineStore('balances', {
  state: () => ({}),
  getters: {
    /** 全量余额矩阵 accountCode → periodId → AccountBalance */
    balancesMatrix(): Record<string, Record<string, AccountBalance>> {
      const acc = useAccountsStore();
      const per = usePeriodsStore();
      const evt = useEventsStore();
      return calcAllBalances(per.sortedPeriods, acc.accounts, evt.entries);
    },

    /** BS 表 rows（多个期间） */
    bsRows(): ReportRow[] {
      const per = usePeriodsStore();
      const acc = useAccountsStore();
      const pids = per.sortedPeriods.map((p) => p.id);
      return evaluateReport(REPORT_MAP.BS, pids, this.balancesMatrix, acc.accountMap);
    },

    /** PL 表 rows（多个期间） */
    plRows(): ReportRow[] {
      const per = usePeriodsStore();
      const acc = useAccountsStore();
      const pids = per.sortedPeriods.map((p) => p.id);
      return evaluateReport(REPORT_MAP.PL, pids, this.balancesMatrix, acc.accountMap);
    },

    /** CF 表 per period */
    cashFlowByPeriod(): Record<string, CashFlowReport> {
      const per = usePeriodsStore();
      const evt = useEventsStore();
      const balances = this.balancesMatrix;
      const map: Record<string, CashFlowReport> = {};
      for (const p of per.sortedPeriods) {
        map[p.id] = calcCashFlow(p.id, evt.entries, balances);
      }
      return map;
    },

    /**
     * 当前选中事件（可多选）的合并影响画像。
     * - 无选中 / 全部已被删除 → 返回 null
     * - 多选时：把所有选中事件的分录合并送入 computeEventImpact 汇总（桑基边合并、报表行 delta 累加）
     */
    selectedEventImpact(): EventImpact | null {
      const ui = useUiStore();
      const evt = useEventsStore();
      const acc = useAccountsStore();
      if (!ui.selectedEventIds || ui.selectedEventIds.length === 0) return null;
      const allEntries = ui.selectedEventIds.flatMap((id) => evt.entriesByEvent(id));
      if (allEntries.length === 0) return null;
      return computeEventImpact(allEntries, acc.accountMap, REPORT_CONFIGS);
    }
  },
  actions: {
    /** 便捷方法：读某科目在某期间的期末正向余额（供模板 ctx 用） */
    getBalance(accountCode: string, periodId: string): number {
      return this.balancesMatrix[accountCode]?.[periodId]?.closingBalance ?? 0;
    },
    getClosingDebit(accountCode: string, periodId: string): number {
      return this.balancesMatrix[accountCode]?.[periodId]?.closingDebit ?? 0;
    },
    getClosingCredit(accountCode: string, periodId: string): number {
      return this.balancesMatrix[accountCode]?.[periodId]?.closingCredit ?? 0;
    }
  }
});
