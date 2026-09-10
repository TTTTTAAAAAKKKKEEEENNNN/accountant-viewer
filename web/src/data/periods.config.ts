/**
 * 默认期间生成器
 * 期间以"月"为真源；季度是派生视图（见 engine/quarterView.ts）。
 * 默认生成 2025P01 ~ 2026P03（15 个月），覆盖完整年度 + 跨年分红演示。
 */
import type { Period, QuarterView } from '@/types';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildPeriodId(year: number, month: number): string {
  return `${year}P${pad2(month)}`;
}

export function buildQuarterId(year: number, quarterNo: 1 | 2 | 3 | 4): string {
  return `${year}Q${quarterNo}`;
}

/**
 * 生成 [fromYear.fromMonth, toYear.toMonth] 闭区间内所有月度期间。
 * 全部初始为 OPEN 状态。
 */
export function generatePeriods(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): Period[] {
  const list: Period[] = [];
  let order = 1;
  let y = fromYear;
  let m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    const q = (Math.ceil(m / 3)) as 1 | 2 | 3 | 4;
    const last = daysInMonth(y, m);
    list.push({
      id: buildPeriodId(y, m),
      name: `${y}年${m}月`,
      kind: 'MONTH',
      year: y,
      monthNo: m,
      quarterNo: q,
      startDate: `${y}-${pad2(m)}-01`,
      endDate: `${y}-${pad2(m)}-${pad2(last)}`,
      order: order++,
      status: 'OPEN'
    });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return list;
}

/** 默认期间：2025P01 ~ 2026P03 */
export const DEFAULT_PERIODS: Period[] = generatePeriods(2025, 1, 2026, 3);

/**
 * 按 (year, quarterNo) 聚合期间为季度视图。
 * 仅在展示层使用，不落库。
 */
export function buildQuarterViews(periods: Period[]): QuarterView[] {
  const map = new Map<string, QuarterView>();
  for (const p of [...periods].sort((a, b) => a.order - b.order)) {
    const qid = buildQuarterId(p.year, p.quarterNo);
    let qv = map.get(qid);
    if (!qv) {
      qv = {
        id: qid,
        name: `${p.year}年${['一', '二', '三', '四'][p.quarterNo - 1]}季度`,
        year: p.year,
        quarterNo: p.quarterNo,
        monthIds: []
      };
      map.set(qid, qv);
    }
    qv.monthIds.push(p.id);
  }
  return Array.from(map.values());
}

/**
 * 找出打开应用时应默认选中的期间 id：
 *  1. 系统当前月对应的期间（若已生成）
 *  2. 否则回退到最近的 OPEN 期间
 *  3. 否则任何期间（第一个）
 */
export function pickDefaultPeriodId(periods: Period[], now: Date = new Date()): string | null {
  if (periods.length === 0) return null;
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const currentId = buildPeriodId(y, m);
  const hit = periods.find((p) => p.id === currentId);
  if (hit) return hit.id;
  const open = periods.find((p) => p.status === 'OPEN');
  return (open ?? periods[0]).id;
}
