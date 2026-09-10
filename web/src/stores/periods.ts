import { defineStore } from 'pinia';
import type { Period, QuarterView } from '@/types';
import { DEFAULT_PERIODS, buildQuarterViews, pickDefaultPeriodId } from '@/data/periods.config';

interface State {
  periods: Period[];
  currentPeriodId: string | null;
}

export const usePeriodsStore = defineStore('periods', {
  state: (): State => {
    const periods = [...DEFAULT_PERIODS];
    return {
      periods,
      currentPeriodId: pickDefaultPeriodId(periods)
    };
  },
  getters: {
    sortedPeriods(state): Period[] {
      return [...state.periods].sort((a, b) => a.order - b.order);
    },
    periodMap(state): Record<string, Period> {
      return state.periods.reduce((m, p) => ((m[p.id] = p), m), {} as Record<string, Period>);
    },
    quarterViews(state): QuarterView[] {
      const sorted = [...state.periods].sort((a, b) => a.order - b.order);
      return buildQuarterViews(sorted);
    },
    currentPeriod(state): Period | null {
      if (!state.currentPeriodId) return null;
      return state.periods.find((p) => p.id === state.currentPeriodId) ?? null;
    }
  },
  actions: {
    setCurrent(periodId: string) {
      if (this.periodMap[periodId]) this.currentPeriodId = periodId;
    },
    setStatus(periodId: string, status: 'OPEN' | 'CLOSED') {
      const p = this.periods.find((x) => x.id === periodId);
      if (p) p.status = status;
    },
    reset() {
      this.periods = [...DEFAULT_PERIODS];
      this.currentPeriodId = pickDefaultPeriodId(this.periods);
    }
  },
  persist: {
    key: 'av.v2.periods'
  }
});
