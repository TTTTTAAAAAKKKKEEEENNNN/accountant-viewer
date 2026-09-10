<template>
  <div class="impact-panel">
    <template v-if="!impact">
      <div class="empty">
        <a-empty
          description="👉 点击右侧「已录事件」中的任意一条，查看该事件的资金流向 & 三表影响"
        />
      </div>
    </template>
    <template v-else>
      <div class="impact-header">
        <a-space>
          <a-tag color="processing">已选 {{ selectedEvents.length }} 个事件</a-tag>
          <span class="impact-title">{{ headerText }}</span>
          <a-tag v-if="crossPeriod" color="warning">跨期间</a-tag>
          <a-tag v-if="impact.isClosing" color="purple">均为结转（不进入 CF）</a-tag>
        </a-space>
        <a-button type="text" size="small" @click="clear">✕ 清空选择</a-button>
      </div>
      <div class="impact-body">
        <!-- 左：桑基图 -->
        <div class="pane pane-sankey">
          <div class="pane-title">资金流向（借方 → 贷方）</div>
          <div ref="chartEl" class="chart"></div>
        </div>
        <!-- 右：报表影响清单 -->
        <div class="pane pane-list">
          <div class="pane-title">受影响的报表项</div>
          <a-table
            :columns="cols"
            :data-source="tableRows"
            :pagination="false"
            size="small"
            bordered
            row-key="uid"
            :scroll="{ y: 220 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'report'">
                <a-tag :color="reportColor(record.reportKey)">{{ record.reportKey }}</a-tag>
              </template>
              <template v-else-if="column.key === 'label'">
                <span>{{ record.nodeLabel }}</span>
              </template>
              <template v-else-if="column.key === 'dir'">
                <span :class="record.delta > 0 ? 'up' : 'down'">
                  {{ record.delta > 0 ? '↑ 增加' : '↓ 减少' }}
                </span>
              </template>
              <template v-else-if="column.key === 'delta'">
                <span :class="record.delta > 0 ? 'up' : 'down'">
                  {{ formatMoney(Math.abs(record.delta)) }}
                </span>
              </template>
            </template>
          </a-table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { TooltipComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useBalancesStore } from '@/stores/balances';
import { useUiStore } from '@/stores/ui';
import { useEventsStore } from '@/stores/events';
import { usePeriodsStore } from '@/stores/periods';

echarts.use([SankeyChart, TooltipComponent, TitleComponent, CanvasRenderer]);

const balStore = useBalancesStore();
const uiStore = useUiStore();
const evtStore = useEventsStore();
const perStore = usePeriodsStore();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

const impact = computed(() => balStore.selectedEventImpact);
const selectedEvents = computed(() => {
  const ids = uiStore.selectedEventIds ?? [];
  const map = new Map(evtStore.events.map((e) => [e.id, e] as const));
  return ids.map((id) => map.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
});

const crossPeriod = computed(() => {
  const pids = new Set(selectedEvents.value.map((e) => e.periodId));
  return pids.size > 1;
});

const headerText = computed(() => {
  const list = selectedEvents.value;
  if (list.length === 0) return '';
  if (list.length === 1) {
    const e = list[0];
    const p = perStore.periodMap[e.periodId];
    return `${p?.name ?? e.periodId} · ${e.description}`;
  }
  // 多事件：展示“月份X / 事件Y”汇总
  const pids = Array.from(new Set(list.map((e) => e.periodId)));
  if (pids.length === 1) {
    const p = perStore.periodMap[pids[0]];
    return `${p?.name ?? pids[0]} · ${list.length} 个事件合并展示`;
  }
  return `${pids.length} 个期间 · ${list.length} 个事件合并展示`;
});

const cols = [
  { title: '报表', key: 'report', width: 70 },
  { title: '报表项', key: 'label' },
  { title: '方向', key: 'dir', width: 90 },
  { title: '变动金额', key: 'delta', width: 130, align: 'right' }
];

/** 表格数据：把 reportImpacts 展平，加 uid。过滤掉纯汇总父节点（避免和叶子重复读者困惑）——保留全部实际更直观，暂不过滤 */
const tableRows = computed(() => {
  const list = impact.value?.reportImpacts ?? [];
  return list
    .slice()
    .sort((a, b) => {
      // 先按报表排序 BS → PL → CF，再按 delta 绝对值降序
      const order: Record<string, number> = { BS: 0, PL: 1, CF: 2 };
      const oa = order[a.reportKey] ?? 9;
      const ob = order[b.reportKey] ?? 9;
      if (oa !== ob) return oa - ob;
      return Math.abs(b.delta) - Math.abs(a.delta);
    })
    .map((r) => ({ ...r, uid: `${r.reportKey}|${r.nodeKey}` }));
});

function reportColor(k: string) {
  return ({ BS: 'blue', PL: 'green', CF: 'orange' } as Record<string, string>)[k] ?? 'default';
}

function formatMoney(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clear() {
  uiStore.clearSelectedEvents();
}

/* -------------------- 桑基图渲染 -------------------- */

/**
 * 确保 chart 实例存在且绑定到当前 DOM。
 * 如果 DOM 尺寸为 0（tab 切换 / display:none 恢复瞬间），返回 false 让调用方延迟重试。
 */
function ensureChart(): boolean {
  if (!chartEl.value) return false;
  const { clientWidth, clientHeight } = chartEl.value;
  if (clientWidth === 0 || clientHeight === 0) return false;

  if (!chart) {
    chart = echarts.init(chartEl.value);
    ro = new ResizeObserver(() => {
      if (chart && chartEl.value && chartEl.value.clientWidth > 0) chart.resize();
    });
    ro.observe(chartEl.value);
  } else {
    // 已存在实例：主动 resize 一次，防止父容器尺寸变化后画布还停留在旧尺寸
    chart.resize();
  }
  return true;
}

function renderChart() {
  const ok = ensureChart();
  if (!ok) {
    // 容器尺寸暂时为 0，稍后重试（tab 切换 / 抽屉展开动画期间常见）
    setTimeout(() => {
      if (ensureChart()) renderChart();
    }, 120);
    return;
  }
  if (!impact.value || impact.value.sankey.length === 0) {
    chart!.clear();
    return;
  }
  // 构造节点集合（借方后缀 __d，贷方后缀 __c，避免同一科目在借贷都出现时形成环）
  const nodeMap = new Map<string, { name: string; label: string }>();
  const links: any[] = [];
  for (const e of impact.value.sankey) {
    const srcKey = `${e.fromCode}__d`;
    const dstKey = `${e.toCode}__c`;
    if (!nodeMap.has(srcKey)) nodeMap.set(srcKey, { name: srcKey, label: `借:${e.fromName}` });
    if (!nodeMap.has(dstKey)) nodeMap.set(dstKey, { name: dstKey, label: `贷:${e.toName}` });
    links.push({ source: srcKey, target: dstKey, value: Number(e.value.toFixed(2)) });
  }
  const nodes = Array.from(nodeMap.values()).map((n) => ({ name: n.name, label: { formatter: n.label } }));

  chart!.setOption(
    {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (p.dataType === 'edge') {
            const s = nodeMap.get(p.data.source)?.label ?? p.data.source;
            const t = nodeMap.get(p.data.target)?.label ?? p.data.target;
            return `${s} → ${t}<br/>金额：${formatMoney(p.data.value)}`;
          }
          return nodeMap.get(p.data.name)?.label ?? p.data.name;
        }
      },
      series: [
        {
          type: 'sankey',
          left: 20,
          right: 120,
          top: 10,
          bottom: 10,
          nodeAlign: 'justify',
          data: nodes,
          links,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
          label: {
            formatter: (p: any) => nodeMap.get(p.name)?.label ?? p.name,
            fontSize: 12
          }
        }
      ]
    },
    true
  );
}

/**
 * 桑基数据签名：任何一处变化都必须触发重绘。
 * - 选中事件 id 集合变化（多选场景下 eventId 未变但集合变了）
 * - 分录内容变化（同一事件被编辑或删除重录）
 */
const sankeySignature = computed(() => {
  const ids = [...(uiStore.selectedEventIds ?? [])].sort().join(',');
  const edgeCount = impact.value?.sankey.length ?? 0;
  const edgeSum = impact.value?.sankey.reduce((s, e) => s + e.value, 0) ?? 0;
  return `${ids}|${edgeCount}|${edgeSum.toFixed(2)}`;
});

watch(
  sankeySignature,
  async () => {
    await nextTick();
    renderChart();
  },
  { immediate: true }
);

// 抽屉/tab 切换后容器尺寸变化，需要 resize + 重绘（仅 resize 有时不足以让桑基图重新布局）
watch(
  () => uiStore.activeTab,
  async () => {
    await nextTick();
    // 等 antd tab 动画结束
    setTimeout(() => renderChart(), 150);
  }
);

onBeforeUnmount(() => {
  if (ro && chartEl.value) ro.unobserve(chartEl.value);
  ro = null;
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>
.impact-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 13px;
}
.impact-header {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.impact-title { font-weight: 600; font-size: 13px; }
.impact-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
.pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pane-title {
  padding: 6px 12px;
  font-size: 12px;
  color: #666;
  border-bottom: 1px dashed #f0f0f0;
  flex: 0 0 auto;
}
.pane-sankey {
  flex: 1 1 60%;
  border-right: 1px solid #f0f0f0;
}
.pane-list {
  flex: 1 1 40%;
  overflow: hidden;
}
.chart {
  flex: 1 1 auto;
  min-height: 0;
}
.up { color: #389e0d; font-weight: 600; }
.down { color: #cf1322; font-weight: 600; }
</style>
