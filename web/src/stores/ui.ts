import { defineStore } from 'pinia';

/** UI 层的偏好：折叠 Q、显示模式、选中的事件等 */
interface State {
  quartersExpanded: Record<string, boolean>;  // qid -> 是否展开为 3 个 P
  activeTab: 'MATRIX' | 'BS' | 'PL' | 'CF';
  /** 当前选中的业务事件 id 列表：支持多选，驱动底部桑基图 + 报表行高亮 */
  selectedEventIds: string[];
}

export const useUiStore = defineStore('ui', {
  state: (): State => ({
    quartersExpanded: {},
    activeTab: 'MATRIX',
    selectedEventIds: []
  }),
  getters: {
    /** 兼容旧调用点：单选时返回第一个 id，无选中返回 null */
    selectedEventId(state): string | null {
      return state.selectedEventIds.length > 0 ? state.selectedEventIds[0] : null;
    },
    isEventSelected(state) {
      return (id: string) => state.selectedEventIds.includes(id);
    }
  },
  actions: {
    toggleQuarter(qid: string) {
      this.quartersExpanded[qid] = !this.quartersExpanded[qid];
    },
    expandAllQuarters(qids: string[]) {
      qids.forEach((q) => (this.quartersExpanded[q] = true));
    },
    collapseAllQuarters(qids: string[]) {
      qids.forEach((q) => (this.quartersExpanded[q] = false));
    },
    setTab(tab: State['activeTab']) {
      this.activeTab = tab;
    },
    /** 单选语义（保留兼容旧代码）：传 null 清空；传 id 设为唯一选中 */
    selectEvent(eventId: string | null) {
      this.selectedEventIds = eventId ? [eventId] : [];
    },
    /** 多选：toggle 一个事件的选中状态 */
    toggleEvent(eventId: string) {
      const idx = this.selectedEventIds.indexOf(eventId);
      if (idx >= 0) this.selectedEventIds.splice(idx, 1);
      else this.selectedEventIds.push(eventId);
    },
    /** 批量设置选中（如全选本月） */
    setSelectedEvents(ids: string[]) {
      // 去重
      this.selectedEventIds = Array.from(new Set(ids));
    },
    clearSelectedEvents() {
      this.selectedEventIds = [];
    },
    /** 事件被删除时从选择列表中剔除 */
    removeSelectedEvent(eventId: string) {
      const idx = this.selectedEventIds.indexOf(eventId);
      if (idx >= 0) this.selectedEventIds.splice(idx, 1);
    }
  },
  persist: {
    key: 'av.v2.ui'
  }
});
