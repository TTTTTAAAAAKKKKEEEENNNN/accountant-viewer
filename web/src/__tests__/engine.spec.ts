/**
 * 会计引擎生命线测试（6 条核心断言）
 * 详见 openspec/specs/system-overview.md §13
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAccountsStore } from '@/stores/accounts';
import { usePeriodsStore } from '@/stores/periods';
import { useEventsStore } from '@/stores/events';
import { useBalancesStore } from '@/stores/balances';
import { DEMO_SCRIPT } from '@/data/demoScript';
import { validateEntry } from '@/engine/validators';
import { ACCOUNT_MAP, PL_CLOSING_TARGET } from '@/data/accounts.config';

describe('会计引擎生命线', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('1) 校验：借贷不平衡的分录必须被拒绝', () => {
    const r = validateEntry(
      {
        date: '2025-01-01',
        summary: '故意不平衡',
        lines: [
          { accountCode: '1001', debit: 100, credit: 0 },
          { accountCode: '4001', debit: 0, credit: 90 } // 差 10
        ]
      },
      ACCOUNT_MAP
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === 'UNBALANCED_ENTRY')).toBe(true);
    }
  });

  it('2) 校验：非叶子科目不能记账', () => {
    const r = validateEntry(
      {
        date: '2025-01-01',
        summary: '',
        lines: [
          { accountCode: '1', debit: 100, credit: 0 },  // '1' 是非叶子（资产大类）
          { accountCode: '4001', debit: 0, credit: 100 }
        ]
      },
      ACCOUNT_MAP
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === 'NON_LEAF_ACCOUNT')).toBe(true);
    }
  });

  it('3) 期间已结账时禁止录入', () => {
    const perStore = usePeriodsStore();
    const evtStore = useEventsStore();
    perStore.setStatus('2025P01', 'CLOSED');
    const r = evtStore.addEvent('2025P01', 'CAPITAL_INJECT', { amount: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe('PERIOD_CLOSED');
    }
  });

  it('4) 金额非法参数必须被拒绝（负数、字符串、缺失）', () => {
    const evtStore = useEventsStore();
    expect(evtStore.addEvent('2025P01', 'CAPITAL_INJECT', { amount: -100 }).ok).toBe(false);
    expect(evtStore.addEvent('2025P01', 'CAPITAL_INJECT', { amount: 'abc' }).ok).toBe(false);
    expect(evtStore.addEvent('2025P01', 'CAPITAL_INJECT', {}).ok).toBe(false);
  });

  it('5) 演示剧本：资产 = 负债 + 所有者权益（每期都成立）', () => {
    const perStore = usePeriodsStore();
    const evtStore = useEventsStore();
    const balStore = useBalancesStore();
    for (const step of DEMO_SCRIPT) {
      perStore.setStatus(step.periodId, 'OPEN');
      const r = evtStore.addEvent(step.periodId, step.templateCode, step.params, step.description);
      // NO_ENTRIES 属于合理跳过（例如某月无损益可结转），其它错误应失败
      const okOrEmpty = r.ok || (r as any).errors?.some((e: any) => e.code === 'NO_ENTRIES');
      expect(okOrEmpty, `期间 ${step.periodId} 事件 ${step.templateCode} 应成功或合理跳过`).toBe(true);
    }
    // 校验每期恒等式
    const rows = balStore.bsRows;
    const findAmount = (key: string, pid: string) => rows.find((r) => r.key === key)?.amounts[pid] ?? 0;
    for (const p of perStore.sortedPeriods) {
      const a = findAmount('bs.assets', p.id);
      const l = findAmount('bs.liab', p.id);
      const e = findAmount('bs.equity', p.id);
      expect(Math.abs(a - (l + e)), `期间 ${p.id}：资产 ${a} vs 负债+权益 ${l + e}`).toBeLessThan(0.01);
    }
  });

  it('6) 演示剧本：年末结转后本年利润余额应为 0', () => {
    const perStore = usePeriodsStore();
    const evtStore = useEventsStore();
    const balStore = useBalancesStore();
    for (const step of DEMO_SCRIPT) {
      perStore.setStatus(step.periodId, 'OPEN');
      evtStore.addEvent(step.periodId, step.templateCode, step.params, step.description);
    }
    const bal = balStore.balancesMatrix[PL_CLOSING_TARGET]?.['2025P12'];
    expect(bal, '本年利润在 2025P12 应有余额记录').toBeDefined();
    expect(Math.abs(bal!.closingBalance)).toBeLessThan(0.01);
  });
});
