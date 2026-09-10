/**
 * 剧本序列化与执行
 * -----------------------------------------------------------
 * 剧本 = 一串 DemoStep（{periodId, templateCode, params, description}）
 * 原则：剧本只存"输入"，不存分录——加载时由模板重新 build() 生成分录，
 *      这样即使模板逻辑迭代，旧剧本仍能得到最新正确分录。
 */
import type { BusinessEvent } from '@/types';
import type { DemoStep } from '@/data/demoScript';
import type { useEventsStore } from '@/stores/events';
import type { usePeriodsStore } from '@/stores/periods';

/** 导出文件格式版本，未来数据结构升级时用来向前兼容 */
export const SCRIPT_FILE_VERSION = 1;

export interface ScriptFile {
  version: number;
  name: string;
  description?: string;
  exportedAt: string;    // ISO 时间
  steps: DemoStep[];
}

/**
 * 把当前 events store 里的所有事件按创建时间序列化为剧本步骤数组。
 * 注意：只保留输入维度（模板 + 参数 + 期间 + 描述），
 *      不保留分录、事件 id、时间戳等运行时字段。
 */
export function eventsToSteps(events: BusinessEvent[]): DemoStep[] {
  return [...events]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map<DemoStep>((e) => ({
      periodId: e.periodId,
      templateCode: e.templateCode,
      params: JSON.parse(JSON.stringify(e.params ?? {})), // 深拷贝，避免引用泄漏
      description: e.description
    }));
}

/**
 * 批量执行一个剧本：
 *  1) 先清空现有事件（调用方决定是否需要 confirm）
 *  2) 逐条把 periodId 置 OPEN（剧本可能跨到未来期间）
 *  3) 顺序 addEvent，累计成功/失败数
 *  4) 如果剧本第一个 step 的 periodId 存在，则把 current 期间跳到它，方便观察起点
 */
export interface RunScriptResult {
  ok: number;
  fail: number;
  failures: Array<{ step: DemoStep; errors: any }>;
}

export function runSteps(
  steps: DemoStep[],
  evtStore: ReturnType<typeof useEventsStore>,
  perStore: ReturnType<typeof usePeriodsStore>
): RunScriptResult {
  evtStore.reset();
  let ok = 0;
  let fail = 0;
  const failures: RunScriptResult['failures'] = [];
  for (const step of steps) {
    // 剧本可能引用了当前没有的期间（例如 2027 年）；这里做一次弱校验：
    // 若期间存在则强制置 OPEN，否则本条跳过（不 throw，尽力恢复）
    if (!perStore.periodMap[step.periodId]) {
      fail++;
      failures.push({ step, errors: [{ code: 'PERIOD_NOT_FOUND', message: `期间 ${step.periodId} 不存在，请先在配置中生成` }] });
      continue;
    }
    perStore.setStatus(step.periodId, 'OPEN');
    const r = evtStore.addEvent(step.periodId, step.templateCode, step.params, step.description);
    if (r.ok) ok++;
    else {
      fail++;
      failures.push({ step, errors: r.errors });
    }
  }
  if (steps.length > 0 && perStore.periodMap[steps[0].periodId]) {
    perStore.setCurrent(steps[0].periodId);
  }
  return { ok, fail, failures };
}

/**
 * 把剧本包装成可下载的 JSON 文件内容
 */
export function stepsToFileJSON(name: string, steps: DemoStep[], description?: string): string {
  const file: ScriptFile = {
    version: SCRIPT_FILE_VERSION,
    name,
    description,
    exportedAt: new Date().toISOString(),
    steps
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 解析 JSON 文件文本，做严格校验；不合法时抛出人类可读的错误
 */
export function parseScriptFile(text: string): ScriptFile {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`JSON 解析失败：${e?.message ?? e}`);
  }
  if (!obj || typeof obj !== 'object') throw new Error('文件内容不是合法的 JSON 对象');
  if (typeof obj.version !== 'number') throw new Error('缺少 version 字段');
  if (obj.version > SCRIPT_FILE_VERSION) {
    throw new Error(`文件版本 v${obj.version} 高于当前支持的 v${SCRIPT_FILE_VERSION}，请升级应用后再试`);
  }
  if (!Array.isArray(obj.steps)) throw new Error('缺少 steps 数组');
  const steps: DemoStep[] = [];
  obj.steps.forEach((s: any, i: number) => {
    if (!s || typeof s !== 'object') throw new Error(`第 ${i + 1} 条 step 不是对象`);
    if (typeof s.periodId !== 'string' || !s.periodId) throw new Error(`第 ${i + 1} 条 step 缺少 periodId`);
    if (typeof s.templateCode !== 'string' || !s.templateCode) throw new Error(`第 ${i + 1} 条 step 缺少 templateCode`);
    if (s.params && typeof s.params !== 'object') throw new Error(`第 ${i + 1} 条 step 的 params 必须是对象`);
    steps.push({
      periodId: s.periodId,
      templateCode: s.templateCode,
      params: s.params ?? {},
      description: typeof s.description === 'string' ? s.description : ''
    });
  });
  return {
    version: obj.version,
    name: typeof obj.name === 'string' && obj.name ? obj.name : '未命名剧本',
    description: typeof obj.description === 'string' ? obj.description : undefined,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    steps
  };
}

/**
 * 触发浏览器下载
 */
export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
