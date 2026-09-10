<template>
  <div class="period-matrix">
    <div class="toolbar">
      <a-space>
        <span class="tip">
          <strong>期间矩阵</strong>
          纵向：科目 · 横向：期间（月度 P，可折叠为季度 Q）
        </span>
        <a-button size="small" @click="expandAll">全部展开季度</a-button>
        <a-button size="small" @click="collapseAll">全部折叠季度</a-button>
      </a-space>
    </div>
    <a-table
      :data-source="tableData"
      :columns="columns"
      :pagination="false"
      size="small"
      bordered
      :scroll="{ x: 'max-content', y: 500 }"
      :default-expand-all-rows="true"
      row-key="code"
      class="matrix-table"
    >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.dataIndex === 'name'">
          <span :class="{ 'is-contra-row': record.isContra }">
            <span class="acc-code">{{ record.code }}</span>
            <span>{{ record.name }}</span>
            <a-tag v-if="record.isContra" color="orange" size="small" style="margin-left: 4px">备抵</a-tag>
          </span>
        </template>
        <template v-else-if="column.periodType">
          <a-tooltip v-if="text?.detail" :title="text.detail">
            <span :class="cellClass(text.value, record)">{{ formatMoney(text.value) }}</span>
          </a-tooltip>
          <span v-else :class="cellClass(text?.value, record)">{{ formatMoney(text?.value ?? 0) }}</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { useAccountsStore } from '@/stores/accounts';
import { usePeriodsStore } from '@/stores/periods';
import { useBalancesStore } from '@/stores/balances';
import { useUiStore } from '@/stores/ui';
import { pickQuarterPointBalance } from '@/engine/quarterView';
import type { Account } from '@/types';

const accStore = useAccountsStore();
const perStore = usePeriodsStore();
const balStore = useBalancesStore();
const uiStore = useUiStore();

/* ------------ 列（期间）：两级表头 Q → P ------------ */
const columns = computed(() => {
  const cols: any[] = [
    {
      title: '科目',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 200
    }
  ];
  for (const q of perStore.quarterViews) {
    const expanded = uiStore.quartersExpanded[q.id] ?? true;
    if (expanded) {
      cols.push({
        title: () => {
          return h('span', { class: 'q-header', onClick: () => uiStore.toggleQuarter(q.id) }, [
            h('span', { style: 'cursor:pointer;user-select:none' }, `${q.name} ▾`)
          ]);
        },
        children: q.monthIds.map((pid) => {
          const p = perStore.periodMap[pid];
          return {
            title: p?.name?.replace(/^\d+年/, '') ?? pid,
            dataIndex: pid,
            key: pid,
            align: 'right',
            width: 100,
            periodType: 'MONTH'
          };
        })
      });
    } else {
      cols.push({
        title: () => h('span', { onClick: () => uiStore.toggleQuarter(q.id), style: 'cursor:pointer;user-select:none' }, `${q.name} ▸`),
        dataIndex: q.id,
        key: q.id,
        align: 'right',
        width: 120,
        periodType: 'QUARTER'
      });
    }
  }
  return cols;
});

/* ------------ 行（科目）：按父子层级构建 tree data ------------ */
interface Row {
  key: string;
  code: string;
  name: string;
  isContra?: boolean;
  isLeaf: boolean;
  children?: Row[];
  [pid: string]: any; // { value, detail }
}

const balancesMatrix = computed(() => balStore.balancesMatrix);

function buildAmountCell(acc: Account, pid: string) {
  const b = balancesMatrix.value[acc.code]?.[pid];
  if (!b) return { value: 0, detail: '' };
  const detail = [
    `期初借 ${b.openingDebit.toFixed(2)} / 期初贷 ${b.openingCredit.toFixed(2)}`,
    `本期借 ${b.periodDebit.toFixed(2)} / 本期贷 ${b.periodCredit.toFixed(2)}`,
    `期末借 ${b.closingDebit.toFixed(2)} / 期末贷 ${b.closingCredit.toFixed(2)}`
  ].join(' ｜ ');
  return { value: b.closingBalance, detail };
}

function buildQuarterCell(acc: Account, qid: string) {
  const q = perStore.quarterViews.find((x) => x.id === qid);
  if (!q) return { value: 0, detail: '' };
  // BS 视角：时点数取季末月余额；PL/CF 类科目也用时点值展示（试算表定位）
  const v = pickQuarterPointBalance(balancesMatrix.value, q, acc.code);
  return { value: v, detail: `${q.name} 末余额（取自 ${q.monthIds[q.monthIds.length - 1]}）` };
}

function buildRow(acc: Account): Row {
  const row: Row = {
    key: acc.code,
    code: acc.code,
    name: acc.name,
    isContra: acc.isContra,
    isLeaf: acc.isLeaf
  };
  for (const q of perStore.quarterViews) {
    const expanded = uiStore.quartersExpanded[q.id] ?? true;
    if (expanded) {
      for (const pid of q.monthIds) row[pid] = buildAmountCell(acc, pid);
    } else {
      row[q.id] = buildQuarterCell(acc, q.id);
    }
  }
  const children = accStore.accounts.filter((a) => a.parentCode === acc.code).map(buildRow);
  if (children.length) row.children = children;
  return row;
}

const tableData = computed<Row[]>(() => accStore.accounts.filter((a) => a.parentCode === null).map(buildRow));

/* ------------ helpers ------------ */

function formatMoney(n: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '-';
  if (Math.abs(n) < 0.005) return '-';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cellClass(v: number | undefined, row: Row) {
  if (!v || Math.abs(v) < 0.005) return 'cell-zero';
  return v < 0 ? 'cell-neg' : 'cell-pos';
}

function expandAll() {
  uiStore.expandAllQuarters(perStore.quarterViews.map((q) => q.id));
}
function collapseAll() {
  uiStore.collapseAllQuarters(perStore.quarterViews.map((q) => q.id));
}
</script>

<style scoped>
.period-matrix { height: 100%; display: flex; flex-direction: column; }
.toolbar { padding: 8px; border-bottom: 1px solid #f0f0f0; background: #fafafa; }
.tip { color: #666; font-size: 13px; }
.matrix-table { flex: 1; overflow: hidden; }
.acc-code { color: #999; margin-right: 6px; font-family: monospace; font-size: 12px; }
.is-contra-row { color: #d46b08; }
.cell-pos { color: #262626; }
.cell-neg { color: #cf1322; }
.cell-zero { color: #bfbfbf; }
:deep(.q-header) { color: #1677ff; font-weight: 600; }
</style>
