<template>
  <div class="report-view">
    <div class="toolbar">
      <strong>{{ reportName }}</strong>
      <a-radio-group v-model:value="displayMode" size="small" style="margin-left: 12px">
        <a-radio-button value="MONTH">月度明细</a-radio-button>
        <a-radio-button value="QUARTER">季度汇总</a-radio-button>
      </a-radio-group>
      <span v-if="impactHint" class="impact-hint">{{ impactHint }}</span>
    </div>
    <div class="table-wrap" ref="tableWrapEl">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        size="small"
        bordered
        row-key="key"
        :default-expand-all-rows="true"
        :scroll="{ x: 'max-content', y: tableY }"
      >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.dataIndex === 'label'">
          <span :style="{ paddingLeft: (record.depth * 16) + 'px', fontWeight: record.hasChildren ? 600 : 400 }">
            {{ text }}
          </span>
        </template>
        <template v-else>
          <span :class="cellClass(text)">{{ formatMoney(text) }}</span>
          <!-- 事件影响徽章：仅在事件所属期间列 + 命中该报表节点时显示 -->
          <template v-if="isImpactCell(record.key, column.dataIndex)">
            <span
              class="impact-badge"
              :class="{ up: impactDelta(record.key) > 0, down: impactDelta(record.key) < 0 }"
              :title="impactTooltip(record.key)"
            >
              {{ impactDelta(record.key) > 0 ? '↑' : '↓' }}
              {{ formatMoney(Math.abs(impactDelta(record.key))) }}
            </span>
          </template>
        </template>
      </template>
    </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBalancesStore } from '@/stores/balances';
import { usePeriodsStore } from '@/stores/periods';
import { REPORT_MAP } from '@/data/reportTree.config';
import type { ReportRow } from '@/types';

const props = defineProps<{ report: 'BS' | 'PL' }>();

const balStore = useBalancesStore();
const perStore = usePeriodsStore();

const displayMode = ref<'MONTH' | 'QUARTER'>('MONTH');
const reportName = computed(() => REPORT_MAP[props.report].name);

/** 自适应表格高度：根据 wrap 容器实时计算 scroll.y，避免写死 500 导致双滚动条 */
const tableWrapEl = ref<HTMLDivElement | null>(null);
const tableY = ref<number>(300);
let ro: ResizeObserver | null = null;

function recalcY() {
  if (!tableWrapEl.value) return;
  const h = tableWrapEl.value.clientHeight;
  // 预留表头高度（antd small 尺寸 header 约 40px）+ 边框
  const y = Math.max(120, h - 48);
  tableY.value = y;
}
onMounted(() => {
  recalcY();
  if (tableWrapEl.value) {
    ro = new ResizeObserver(() => recalcY());
    ro.observe(tableWrapEl.value);
  }
});
onBeforeUnmount(() => {
  if (ro && tableWrapEl.value) ro.unobserve(tableWrapEl.value);
  ro = null;
});

/** 原始 rows（每期一列） */
const baseRows = computed<ReportRow[]>(() => (props.report === 'BS' ? balStore.bsRows : balStore.plRows));

/** 扁平化 rows 供 a-table 展开显示（把 children 展平并带上 depth） */
function flatten(rows: ReportRow[]): any[] {
  const result: any[] = [];
  const walk = (r: ReportRow) => {
    result.push({
      key: r.key,
      label: r.label,
      depth: r.depth,
      hasChildren: r.hasChildren,
      ...r.amounts
    });
    if (r.children) r.children.forEach(walk);
  };
  rows.forEach(walk);
  return result;
}

const rows = computed(() => {
  const raw = baseRows.value;
  if (displayMode.value === 'MONTH') {
    return flatten(raw);
  }
  // 季度汇总：按 quarterView 规则聚合
  const isPoint = props.report === 'BS'; // BS 是时点数，PL 是流量数
  const result: any[] = [];
  const walk = (r: ReportRow, depth: number) => {
    const row: any = { key: r.key, label: r.label, depth, hasChildren: r.hasChildren };
    for (const q of perStore.quarterViews) {
      if (isPoint) {
        row[q.id] = r.amounts[q.monthIds[q.monthIds.length - 1]] ?? 0;
      } else {
        row[q.id] = q.monthIds.reduce((s, pid) => s + (r.amounts[pid] ?? 0), 0);
      }
    }
    result.push(row);
    if (r.children) r.children.forEach((c) => walk(c, depth + 1));
  };
  raw.forEach((r) => walk(r, 0));
  return result;
});

const columns = computed(() => {
  const cols: any[] = [
    { title: '项目', dataIndex: 'label', key: 'label', fixed: 'left', width: 260 }
  ];
  if (displayMode.value === 'MONTH') {
    for (const p of perStore.sortedPeriods) {
      cols.push({ title: p.id, dataIndex: p.id, key: p.id, align: 'right', width: 100 });
    }
  } else {
    for (const q of perStore.quarterViews) {
      cols.push({ title: q.id, dataIndex: q.id, key: q.id, align: 'right', width: 110 });
    }
  }
  return cols;
});

function formatMoney(n: any) {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) < 0.005) return '-';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cellClass(v: any) {
  if (typeof v !== 'number' || Math.abs(v) < 0.005) return 'zero';
  return v < 0 ? 'neg' : 'pos';
}

/* -------- 事件影响：在事件所属期间列显示 ↑↓ 徽章 -------- */

const impact = computed(() => balStore.selectedEventImpact);

/** 事件所在期间 id → 若在 MONTH 模式直接匹配；在 QUARTER 模式则匹配所属季度 id */
const impactColKey = computed<string | null>(() => {
  if (!impact.value) return null;
  const pid = impact.value.periodId;
  if (displayMode.value === 'MONTH') return pid;
  // 找 pid 所属的季度 id
  const q = perStore.quarterViews.find((qv) => qv.monthIds.includes(pid));
  return q ? q.id : null;
});

/** 当前 record.key 是否有影响 */
function impactDelta(nodeKey: string): number {
  if (!impact.value) return 0;
  return impact.value.impactMapByReport[props.report][nodeKey]?.delta ?? 0;
}
function isImpactCell(nodeKey: string, colKey: any): boolean {
  if (!impact.value || !impactColKey.value) return false;
  if (colKey !== impactColKey.value) return false;
  return Math.abs(impactDelta(nodeKey)) >= 0.005;
}
function impactTooltip(nodeKey: string): string {
  const row = impact.value?.impactMapByReport[props.report][nodeKey];
  if (!row) return '';
  const dir = row.delta > 0 ? '↑ 增加' : '↓ 减少';
  return `${row.nodeLabel} ${dir} ${formatMoney(Math.abs(row.delta))}（来自当前选中事件）`;
}

const impactHint = computed(() => {
  if (!impact.value) return '';
  const count = impact.value.reportImpacts.filter((r) => r.reportKey === props.report).length;
  if (count === 0) return '';
  return `· 当前选中事件影响本表 ${count} 项`;
});
</script>

<style scoped>
.report-view {
  padding: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.toolbar { margin-bottom: 8px; flex: 0 0 auto; }
.table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;   /* 只保留 a-table 内部一个滚动条 */
}
.impact-hint {
  margin-left: 12px;
  color: #1677ff;
  font-size: 12px;
}
.pos { color: #262626; }
.neg { color: #cf1322; }
.zero { color: #bfbfbf; }
.impact-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}
.impact-badge.up { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.impact-badge.down { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
</style>
