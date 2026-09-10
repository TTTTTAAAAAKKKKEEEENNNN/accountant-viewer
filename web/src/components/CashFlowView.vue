<template>
  <div class="cash-flow-view">
    <div class="toolbar">
      <strong>现金流量表（直接法）</strong>
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
        :scroll="{ x: 'max-content', y: tableY }"
      >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.dataIndex === 'label'">
          <span :style="{ paddingLeft: (record.depth * 16) + 'px', fontWeight: record.emphasize ? 700 : 400 }">
            {{ text }}
          </span>
        </template>
        <template v-else>
          <span :class="cellClass(text)">{{ formatMoney(text) }}</span>
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

const balStore = useBalancesStore();
const perStore = usePeriodsStore();

/** 自适应高度（同 ReportView） */
const tableWrapEl = ref<HTMLDivElement | null>(null);
const tableY = ref<number>(300);
let ro: ResizeObserver | null = null;
function recalcY() {
  if (!tableWrapEl.value) return;
  tableY.value = Math.max(120, tableWrapEl.value.clientHeight - 48);
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

const columns = computed(() => {
  const cols: any[] = [
    { title: '项目', dataIndex: 'label', key: 'label', fixed: 'left', width: 320 }
  ];
  for (const p of perStore.sortedPeriods) {
    cols.push({ title: p.id, dataIndex: p.id, key: p.id, align: 'right', width: 110 });
  }
  return cols;
});

interface Row {
  key: string;
  label: string;
  depth: number;
  emphasize?: boolean;
  [pid: string]: any;
}

const rows = computed<Row[]>(() => {
  const cfMap = balStore.cashFlowByPeriod;
  const pids = perStore.sortedPeriods.map((p) => p.id);
  const cell = (extract: (r: any) => number): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const pid of pids) o[pid] = extract(cfMap[pid]);
    return o;
  };
  return [
    { key: 'op_head', label: '一、经营活动产生的现金流量', depth: 0, emphasize: true },
    { key: 'op_in',   label: '  经营活动现金流入', depth: 1, ...cell((c) => c.sections[0].inflow) },
    { key: 'op_out',  label: '  经营活动现金流出', depth: 1, ...cell((c) => c.sections[0].outflow) },
    { key: 'op_net',  label: '  经营活动净流量', depth: 1, emphasize: true, ...cell((c) => c.operatingNet) },

    { key: 'inv_head', label: '二、投资活动产生的现金流量', depth: 0, emphasize: true },
    { key: 'inv_in',   label: '  投资活动现金流入', depth: 1, ...cell((c) => c.sections[1].inflow) },
    { key: 'inv_out',  label: '  投资活动现金流出', depth: 1, ...cell((c) => c.sections[1].outflow) },
    { key: 'inv_net',  label: '  投资活动净流量', depth: 1, emphasize: true, ...cell((c) => c.investingNet) },

    { key: 'fin_head', label: '三、筹资活动产生的现金流量', depth: 0, emphasize: true },
    { key: 'fin_in',   label: '  筹资活动现金流入', depth: 1, ...cell((c) => c.sections[2].inflow) },
    { key: 'fin_out',  label: '  筹资活动现金流出', depth: 1, ...cell((c) => c.sections[2].outflow) },
    { key: 'fin_net',  label: '  筹资活动净流量', depth: 1, emphasize: true, ...cell((c) => c.financingNet) },

    { key: 'net',     label: '四、现金及现金等价物净增加额', depth: 0, emphasize: true, ...cell((c) => c.totalNet) },
    { key: 'opening', label: '五、期初现金余额', depth: 0, ...cell((c) => c.openingCash) },
    { key: 'ending',  label: '六、期末现金余额', depth: 0, emphasize: true, ...cell((c) => c.endingCash) }
  ];
});

function formatMoney(n: any) {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) < 0.005) return '-';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cellClass(v: any) {
  if (typeof v !== 'number' || Math.abs(v) < 0.005) return 'zero';
  return v < 0 ? 'neg' : 'pos';
}

/* -------- 事件影响（仅在事件所属期间列 & 净额行显示） -------- */

const impact = computed(() => balStore.selectedEventImpact);

/** UI row.key → EventImpact 里的 nodeKey */
const ROW_TO_NODE: Record<string, string> = {
  op_net: 'cf.op',
  inv_net: 'cf.inv',
  fin_net: 'cf.fin',
  net: 'cf.net',
  ending: 'cf.ending'
};

function impactDelta(rowKey: string): number {
  const nk = ROW_TO_NODE[rowKey];
  if (!nk || !impact.value) return 0;
  return impact.value.impactMapByReport.CF[nk]?.delta ?? 0;
}
function isImpactCell(rowKey: string, colKey: any): boolean {
  if (!impact.value) return false;
  if (colKey !== impact.value.periodId) return false;
  return Math.abs(impactDelta(rowKey)) >= 0.005;
}
function impactTooltip(rowKey: string): string {
  const nk = ROW_TO_NODE[rowKey];
  const row = nk ? impact.value?.impactMapByReport.CF[nk] : null;
  if (!row) return '';
  const dir = row.delta > 0 ? '↑ 增加' : '↓ 减少';
  return `${row.nodeLabel} ${dir} ${formatMoney(Math.abs(row.delta))}（来自当前选中事件）`;
}

const impactHint = computed(() => {
  if (!impact.value) return '';
  const count = impact.value.reportImpacts.filter((r) => r.reportKey === 'CF').length;
  if (impact.value.isClosing) return '· 当前事件为结转分录，不进入现金流量表';
  if (count === 0) return '· 当前选中事件不影响现金流量表';
  return `· 当前选中事件影响本表 ${count} 项`;
});
</script>

<style scoped>
.cash-flow-view {
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
  overflow: hidden;
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
