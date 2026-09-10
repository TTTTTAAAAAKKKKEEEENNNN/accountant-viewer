<template>
  <div class="event-drawer">
    <div class="section">
      <label class="label">当前期间</label>
      <a-select
        :value="perStore.currentPeriodId ?? undefined"
        style="width: 100%"
        @change="onChangePeriod"
        :options="periodOptions"
      />
      <div v-if="perStore.currentPeriod" class="period-status">
        状态：
        <a-tag :color="perStore.currentPeriod.status === 'OPEN' ? 'green' : 'red'">
          {{ perStore.currentPeriod.status === 'OPEN' ? '未结账' : '已结账' }}
        </a-tag>
      </div>
    </div>

    <a-divider style="margin: 12px 0" />

    <div class="section">
      <label class="label">选择事件模板</label>
      <a-select
        v-model:value="selectedCode"
        style="width: 100%"
        placeholder="选择一个业务事件"
        :options="templateOptions"
        @change="onChangeTemplate"
      />
      <div v-if="selectedTemplate?.description" class="template-desc">
        <a-typography-text type="secondary">{{ selectedTemplate.description }}</a-typography-text>
      </div>
    </div>

    <div v-if="selectedTemplate" class="section">
      <a-form layout="vertical" :model="formState">
        <a-form-item
          v-for="p in selectedTemplate.params"
          :key="p.key"
          :label="p.label"
          :required="p.required"
        >
          <a-input-number
            v-if="p.type === 'number'"
            v-model:value="formState[p.key]"
            :min="p.min ?? 0"
            style="width: 100%"
            :precision="2"
            :placeholder="p.placeholder"
          />
          <a-select
            v-else-if="p.type === 'select'"
            v-model:value="formState[p.key]"
            style="width: 100%"
            :placeholder="p.placeholder ?? '请选择'"
            :options="p.options"
          />
          <a-input
            v-else
            v-model:value="formState[p.key]"
            :placeholder="p.placeholder"
          />
        </a-form-item>
      </a-form>
      <a-space>
        <a-button type="primary" :disabled="!canSubmit" @click="submit">录入</a-button>
        <a-button @click="reset">清空</a-button>
      </a-space>
    </div>

    <a-divider style="margin: 12px 0" />

    <div class="section">
      <div class="list-header">
        <label class="label" style="margin: 0">
          本月已录事件 ({{ periodEvents.length }})
          <a-tag v-if="selectedCount > 0" color="processing" size="small" style="margin-left: 6px">
            已选 {{ selectedCount }}
          </a-tag>
        </label>
        <a-space :size="4">
          <a-tooltip title="选中本月全部事件，合并生成桑基图">
            <a-button size="small" :disabled="periodEvents.length === 0" @click="selectAllInMonth">全选</a-button>
          </a-tooltip>
          <a-tooltip title="清空当前选择">
            <a-button size="small" :disabled="selectedCount === 0" @click="clearSelection">清空</a-button>
          </a-tooltip>
        </a-space>
      </div>
      <a-empty v-if="periodEvents.length === 0" description="暂无事件" />
      <a-list v-else size="small" :data-source="periodEvents">
        <template #renderItem="{ item }">
          <a-list-item
            :class="{ 'evt-selected': uiStore.isEventSelected(item.id) }"
            @click="onClickEvent(item.id)"
            style="cursor: pointer"
          >
            <div class="event-row">
              <div class="event-title">
                <a-checkbox
                  :checked="uiStore.isEventSelected(item.id)"
                  style="margin-right: 6px"
                  @click.stop
                  @change="onCheckChange(item.id)"
                />
                <a-tag :color="tagColor(item.templateCode)">{{ TEMPLATE_MAP[item.templateCode]?.category ?? '' }}</a-tag>
                <span>{{ item.description }}</span>
                <a-tag v-if="uiStore.isEventSelected(item.id)" color="processing" size="small" style="margin-left: 4px">查看中</a-tag>
              </div>
              <div class="event-entries">
                <div v-for="je in evtStore.entriesByEvent(item.id)" :key="je.id" class="je">
                  <div class="je-summary">
                    {{ je.summary }}
                    <a-tag v-if="je.isClosing" color="purple" size="small">结转</a-tag>
                  </div>
                  <table class="je-lines">
                    <tr v-for="(line, i) in je.lines" :key="i">
                      <td class="ac">{{ accStore.accountMap[line.accountCode]?.name ?? line.accountCode }}</td>
                      <td class="dr">{{ line.debit > 0 ? formatMoney(line.debit) : '' }}</td>
                      <td class="cr">{{ line.credit > 0 ? formatMoney(line.credit) : '' }}</td>
                      <td class="cf">
                        <a-tag v-if="line.cfCategory && line.cfCategory !== 'NONE'" size="small" color="blue">
                          {{ cfLabel(line.cfCategory) }}
                        </a-tag>
                      </td>
                    </tr>
                  </table>
                </div>
              </div>
              <a-popconfirm title="确认删除该事件（连同所有分录）？" @confirm.stop="del(item.id)">
                <a-button type="link" danger size="small" @click.stop>删除</a-button>
              </a-popconfirm>
            </div>
          </a-list-item>
        </template>
      </a-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { usePeriodsStore } from '@/stores/periods';
import { useEventsStore } from '@/stores/events';
import { useAccountsStore } from '@/stores/accounts';
import { useUiStore } from '@/stores/ui';
import { EVENT_TEMPLATES, TEMPLATE_MAP } from '@/data/eventTemplates';
import type { EventTemplate } from '@/types';

const perStore = usePeriodsStore();
const evtStore = useEventsStore();
const accStore = useAccountsStore();
const uiStore = useUiStore();

const periodOptions = computed(() =>
  perStore.sortedPeriods.map((p) => ({
    label: `${p.name} (${p.id}) ${p.status === 'CLOSED' ? '·已结账' : ''}`,
    value: p.id
  }))
);

const templateOptions = computed(() =>
  EVENT_TEMPLATES.map((t) => ({
    label: `[${t.category}] ${t.name}`,
    value: t.code
  }))
);

const selectedCode = ref<string | undefined>(undefined);
const selectedTemplate = computed<EventTemplate | null>(() => (selectedCode.value ? TEMPLATE_MAP[selectedCode.value] : null));

const formState = ref<Record<string, any>>({});

function onChangeTemplate() {
  formState.value = {};
  if (!selectedTemplate.value) return;
  for (const p of selectedTemplate.value.params) {
    if (p.default !== undefined) formState.value[p.key] = p.default;
  }
}

function onChangePeriod(v: string) {
  perStore.setCurrent(v);
}

const canSubmit = computed(() => {
  if (!selectedTemplate.value || !perStore.currentPeriodId) return false;
  if (perStore.currentPeriod?.status === 'CLOSED') return false;
  return true;
});

function submit() {
  if (!selectedTemplate.value || !perStore.currentPeriodId) return;
  const r = evtStore.addEvent(perStore.currentPeriodId, selectedTemplate.value.code, { ...formState.value });
  if (r.ok) {
    message.success(`已录入：${selectedTemplate.value.name}`);
    formState.value = {};
    onChangeTemplate();
  } else {
    for (const e of r.errors) message.error(e.message);
  }
}

function reset() {
  formState.value = {};
}

function del(eventId: string) {
  const r = evtStore.deleteEvent(eventId);
  if (r.ok) {
    // 若删除的事件正好在选择列表中，同步剔除
    uiStore.removeSelectedEvent(eventId);
    message.success('已删除');
  } else for (const e of r.errors) message.error(e.message);
}

/** 点击事件行 → toggle 该事件的选中状态（多选） */
function onClickEvent(id: string) {
  uiStore.toggleEvent(id);
}

/** checkbox change 的处理（与 onClickEvent 同语义，仅为语义显式） */
function onCheckChange(id: string) {
  uiStore.toggleEvent(id);
}

/** 全选本月所有事件（覆盖当前选择，避免和其他月份的选择混淆） */
function selectAllInMonth() {
  uiStore.setSelectedEvents(periodEvents.value.map((e) => e.id));
}

/** 清空当前所有选择 */
function clearSelection() {
  uiStore.clearSelectedEvents();
}

const selectedCount = computed(() => uiStore.selectedEventIds.length);

const periodEvents = computed(() =>
  perStore.currentPeriodId ? evtStore.eventsByPeriod(perStore.currentPeriodId) : []
);

function formatMoney(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cfLabel(c: string) {
  return { OPERATING: '经营', INVESTING: '投资', FINANCING: '筹资' }[c] ?? c;
}
function tagColor(code: string) {
  const cat = TEMPLATE_MAP[code]?.category;
  return { 经营: 'green', 投资: 'geekblue', 筹资: 'orange', 结转: 'purple' }[cat ?? ''] ?? 'default';
}

// 切换期间时重置表单（不主动清空跨期选择：允许用户跨期间选择多个事件对比）
watch(() => perStore.currentPeriodId, () => {
  selectedCode.value = undefined;
  formState.value = {};
});
</script>

<style scoped>
.event-drawer { padding: 12px; height: 100%; overflow: auto; }
.section { margin-bottom: 12px; }
.label { display: block; font-weight: 600; margin-bottom: 6px; color: #333; }
.period-status { margin-top: 6px; font-size: 12px; }
.template-desc { margin-top: 6px; font-size: 12px; }
.event-row { width: 100%; }
.event-title { margin-bottom: 4px; }
.event-entries { margin-left: 4px; }
.je { margin-top: 6px; padding: 6px; background: #fafafa; border-radius: 4px; }
.je-summary { font-size: 12px; color: #555; margin-bottom: 4px; }
.je-lines { width: 100%; font-size: 12px; }
.je-lines td { padding: 2px 6px; }
.je-lines .ac { color: #333; }
.je-lines .dr { text-align: right; color: #096dd9; }
.je-lines .cr { text-align: right; color: #d46b08; }
.je-lines .cf { text-align: right; width: 50px; }
.evt-selected {
  background: #e6f4ff !important;
  border-left: 3px solid #1677ff;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
</style>
