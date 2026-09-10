import { defineStore } from 'pinia';
import type { DemoStep } from '@/data/demoScript';

/**
 * 保存到 localStorage 的自定义剧本
 * 与内置的 DEMO_SCRIPT 结构相同（DemoStep[]），加上元数据（name、时间戳）
 */
export interface SavedScript {
  id: string;                // 唯一 id
  name: string;              // 用户命名
  description?: string;      // 备注
  steps: DemoStep[];
  createdAt: string;         // ISO 时间
  updatedAt: string;
}

interface State {
  scripts: SavedScript[];
  seq: number;
}

function uid(seq: number): string {
  return `SCR_${Date.now().toString(36)}_${seq}`;
}

export const useScriptsStore = defineStore('scripts', {
  state: (): State => ({
    scripts: [],
    seq: 0
  }),
  getters: {
    sortedScripts(state): SavedScript[] {
      return [...state.scripts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    scriptMap(state): Record<string, SavedScript> {
      return state.scripts.reduce((m, s) => ((m[s.id] = s), m), {} as Record<string, SavedScript>);
    }
  },
  actions: {
    /**
     * 保存一份剧本（新建）。返回新剧本 id。
     * 允许重名（用不同 id 区分）；如果用户想覆盖，请调用 update。
     */
    save(name: string, steps: DemoStep[], description?: string): string {
      const now = new Date().toISOString();
      const id = uid(++this.seq);
      this.scripts.push({
        id,
        name: name.trim() || `剧本 ${this.scripts.length + 1}`,
        description,
        steps,
        createdAt: now,
        updatedAt: now
      });
      return id;
    },

    /**
     * 覆盖已有剧本的内容（steps + 元数据）
     */
    update(id: string, patch: Partial<Pick<SavedScript, 'name' | 'description' | 'steps'>>): boolean {
      const s = this.scripts.find((x) => x.id === id);
      if (!s) return false;
      if (typeof patch.name === 'string') s.name = patch.name.trim() || s.name;
      if (typeof patch.description === 'string') s.description = patch.description;
      if (Array.isArray(patch.steps)) s.steps = patch.steps;
      s.updatedAt = new Date().toISOString();
      return true;
    },

    remove(id: string): boolean {
      const before = this.scripts.length;
      this.scripts = this.scripts.filter((s) => s.id !== id);
      return this.scripts.length < before;
    },

    reset() {
      this.scripts = [];
      this.seq = 0;
    }
  },
  persist: {
    key: 'av.v2.scripts'
  }
});
