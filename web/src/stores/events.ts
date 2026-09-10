import { defineStore } from 'pinia';
import type { BusinessEvent, DraftEntry, JournalEntry, TemplateBuildContext, ValidationResult } from '@/types';
import { TEMPLATE_MAP } from '@/data/eventTemplates';
import { useAccountsStore } from './accounts';
import { usePeriodsStore } from './periods';
import { useBalancesStore } from './balances';
import {
  validateEntries,
  validateEventParams,
  validatePeriodOpenForDelete,
  validatePeriodOpenForWrite
} from '@/engine/validators';

interface State {
  events: BusinessEvent[];
  entries: JournalEntry[];
  seq: number; // 自增序列
}

function uid(prefix: string, seq: number): string {
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export const useEventsStore = defineStore('events', {
  state: (): State => ({
    events: [],
    entries: [],
    seq: 0
  }),
  getters: {
    eventsByPeriod(state) {
      return (periodId: string): BusinessEvent[] =>
        state.events.filter((e) => e.periodId === periodId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    entriesByPeriod(state) {
      return (periodId: string): JournalEntry[] => state.entries.filter((e) => e.periodId === periodId);
    },
    entriesByEvent(state) {
      return (eventId: string): JournalEntry[] => state.entries.filter((e) => e.eventId === eventId);
    }
  },
  actions: {
    /**
     * 尝试录入一个业务事件。返回 ValidationResult；成功时同步更新 events + entries。
     */
    addEvent(periodId: string, templateCode: string, params: Record<string, any>, description?: string): ValidationResult {
      const accStore = useAccountsStore();
      const perStore = usePeriodsStore();
      const balStore = useBalancesStore();

      const period = perStore.periodMap[periodId];
      const permit = validatePeriodOpenForWrite(period);
      if (!permit.ok) return permit;

      const template = TEMPLATE_MAP[templateCode];
      if (!template) {
        return { ok: false, errors: [{ code: 'TEMPLATE_NOT_FOUND', message: `事件模板 ${templateCode} 不存在` }] };
      }

      const paramCheck = validateEventParams(template, params);
      if (!paramCheck.ok) return paramCheck;

      // 构造 TemplateBuildContext（用当前 balances 快照）
      const ctx: TemplateBuildContext = {
        periodId,
        getBalance: (code) => balStore.getBalance(code, periodId),
        getClosingDebit: (code) => balStore.getClosingDebit(code, periodId),
        getClosingCredit: (code) => balStore.getClosingCredit(code, periodId)
      };

      let drafts: DraftEntry[];
      try {
        drafts = template.build(params, ctx);
      } catch (e: any) {
        return { ok: false, errors: [{ code: 'TEMPLATE_BUILD_ERROR', message: `模板执行失败：${e?.message ?? e}` }] };
      }

      if (!drafts || drafts.length === 0) {
        return { ok: false, errors: [{ code: 'NO_ENTRIES', message: '本次操作没有产生任何分录（可能无余额可结转）' }] };
      }

      const check = validateEntries(drafts, accStore.accountMap);
      if (!check.ok) return check;

      // 落库
      const eventId = uid('EVT', ++this.seq);
      const entryIds: string[] = [];
      const now = new Date().toISOString();
      const entryDate = period?.endDate ?? now.slice(0, 10);
      const newEntries: JournalEntry[] = drafts.map((d) => {
        const id = uid('JE', ++this.seq);
        entryIds.push(id);
        return {
          id,
          eventId,
          periodId,
          date: d.date || entryDate,
          summary: d.summary,
          lines: d.lines,
          isClosing: d.isClosing
        };
      });
      const evt: BusinessEvent = {
        id: eventId,
        periodId,
        templateCode,
        params,
        description: description ?? template.name,
        createdAt: now,
        entryIds
      };
      this.events.push(evt);
      this.entries.push(...newEntries);
      return { ok: true };
    },

    deleteEvent(eventId: string): ValidationResult {
      const evt = this.events.find((e) => e.id === eventId);
      if (!evt) return { ok: false, errors: [{ code: 'EVENT_NOT_FOUND', message: '事件不存在' }] };
      const perStore = usePeriodsStore();
      const period = perStore.periodMap[evt.periodId];
      const permit = validatePeriodOpenForDelete(period);
      if (!permit.ok) return permit;
      this.entries = this.entries.filter((e) => e.eventId !== eventId);
      this.events = this.events.filter((e) => e.id !== eventId);
      return { ok: true };
    },

    reset() {
      this.events = [];
      this.entries = [];
      this.seq = 0;
    }
  },
  persist: {
    key: 'av.v2.events'
  }
});
