<template>
  <a-layout class="sandbox">
    <a-layout-header class="header">
      <div class="brand">📊 会计三表沙盘 · Sandbox</div>
      <div class="header-right">
        <a-space>
          <a-dropdown-button type="primary" @click="loadBuiltinDemo">
            📋 剧本
            <template #overlay>
              <a-menu @click="onScriptMenu">
                <a-menu-item key="builtin">📥 加载内置演示剧本</a-menu-item>
                <a-menu-item key="save">💾 把当前事件保存为新剧本</a-menu-item>
                <a-menu-item key="manage">🗂️ 剧本管理（加载 / 导入 / 导出 / 删除）</a-menu-item>
                <a-menu-divider />
                <a-menu-item key="export-current" :disabled="evtStore.events.length === 0">
                  ⬇️ 直接导出当前事件为 JSON
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown-button>
          <a-popconfirm title="确认清空所有数据（保留科目/期间配置）？" @confirm="clearData">
            <a-button danger>清空事件</a-button>
          </a-popconfirm>
          <a-popconfirm title="确认重置全部数据（科目/期间/事件都恢复默认）？" @confirm="resetAll">
            <a-button>重置全部</a-button>
          </a-popconfirm>
        </a-space>
      </div>
    </a-layout-header>

    <a-layout class="body">
      <a-layout-sider width="260" theme="light" class="sider-left">
        <div class="sider-title">会计科目</div>
        <div class="sider-body">
          <AccountTree />
        </div>
      </a-layout-sider>

      <a-layout-content class="content">
        <div class="content-top">
          <a-tabs v-model:activeKey="uiStore.activeTab">
            <a-tab-pane key="MATRIX" tab="期间矩阵">
              <PeriodMatrix />
            </a-tab-pane>
            <a-tab-pane key="BS" tab="资产负债表 (BS)">
              <ReportView report="BS" />
            </a-tab-pane>
            <a-tab-pane key="PL" tab="利润表 (PL)">
              <ReportView report="PL" />
            </a-tab-pane>
            <a-tab-pane key="CF" tab="现金流量表 (CF · 直接法)">
              <CashFlowView />
            </a-tab-pane>
          </a-tabs>
        </div>
        <div class="content-bottom">
          <EventImpactPanel />
        </div>
      </a-layout-content>

      <a-layout-sider width="380" theme="light" class="sider-right">
        <div class="sider-title">业务事件</div>
        <div class="sider-body">
          <EventDrawer />
        </div>
      </a-layout-sider>
    </a-layout>

    <a-layout-footer class="footer">
      <span>会计恒等式实时校验：{{ identityHint }}</span>
    </a-layout-footer>

    <ScriptManager
      v-model:open="scriptMgrOpen"
      v-model:auto-save-on-open="scriptMgrAutoSave"
    />
  </a-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import AccountTree from '@/components/AccountTree.vue';
import PeriodMatrix from '@/components/PeriodMatrix.vue';
import EventDrawer from '@/components/EventDrawer.vue';
import ReportView from '@/components/ReportView.vue';
import CashFlowView from '@/components/CashFlowView.vue';
import EventImpactPanel from '@/components/EventImpactPanel.vue';
import ScriptManager from '@/components/ScriptManager.vue';
import { useAccountsStore } from '@/stores/accounts';
import { usePeriodsStore } from '@/stores/periods';
import { useEventsStore } from '@/stores/events';
import { useBalancesStore } from '@/stores/balances';
import { useUiStore } from '@/stores/ui';
import { useScriptsStore } from '@/stores/scripts';
import { DEMO_SCRIPT } from '@/data/demoScript';
import {
  eventsToSteps,
  runSteps,
  stepsToFileJSON,
  downloadTextFile
} from '@/engine/scriptSerializer';

const accStore = useAccountsStore();
const perStore = usePeriodsStore();
const evtStore = useEventsStore();
const balStore = useBalancesStore();
const uiStore = useUiStore();
const scriptsStore = useScriptsStore();

const scriptMgrOpen = ref(false);
const scriptMgrAutoSave = ref(false);

/* -------------------- 剧本下拉菜单 -------------------- */

function onScriptMenu({ key }: { key: string }) {
  if (key === 'builtin') loadBuiltinDemo();
  else if (key === 'save') saveCurrentAsScript();
  else if (key === 'manage') {
    scriptMgrAutoSave.value = false;
    scriptMgrOpen.value = true;
  }
  else if (key === 'export-current') exportCurrent();
}

/** 从顶部下拉入口保存：打开剧本管理弹窗并自动弹出保存对话框 */
function saveCurrentAsScript() {
  if (evtStore.events.length === 0) {
    message.warning('当前没有任何事件可保存');
    return;
  }
  scriptMgrAutoSave.value = true;
  scriptMgrOpen.value = true;
}

/** 快捷：直接把当前 events 导出为 JSON 文件 */
function exportCurrent() {
  if (evtStore.events.length === 0) {
    message.warning('当前没有任何事件可导出');
    return;
  }
  const steps = eventsToSteps(evtStore.events);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `sandbox-events-${stamp}`;
  downloadTextFile(`${name}.json`, stepsToFileJSON(name, steps));
  message.success(`已导出 ${steps.length} 条事件为 ${name}.json`);
}

/* -------------------- 内置演示剧本 -------------------- */

function loadBuiltinDemo() {
  if (evtStore.events.length > 0) {
    Modal.confirm({
      title: '已有事件数据',
      content: '加载内置演示剧本会先清空现有事件，是否继续？',
      onOk: () => doLoadBuiltinDemo()
    });
  } else {
    doLoadBuiltinDemo();
  }
}

function doLoadBuiltinDemo() {
  const r = runSteps(DEMO_SCRIPT, evtStore, perStore);
  if (r.fail > 0) {
    message.warning(`演示剧本加载完成：成功 ${r.ok} 条，失败 ${r.fail} 条（见控制台）`);
    console.warn('[demo] 部分事件失败：', r.failures);
  } else {
    message.success(`演示剧本加载完成：${r.ok} 条事件`);
  }
}

function clearData() {
  evtStore.reset();
  message.success('已清空所有事件');
}

function resetAll() {
  evtStore.reset();
  perStore.reset();
  accStore.reset();
  message.success('已重置为默认数据');
}

/** BS 恒等式实时校验：资产 = 负债 + 权益（用当前期间） */
const identityHint = computed(() => {
  const pid = perStore.currentPeriodId;
  if (!pid) return '未选择期间';
  const rows = balStore.bsRows;
  const findAmount = (key: string) => rows.find((r) => r.key === key)?.amounts[pid] ?? 0;
  const a = findAmount('bs.assets');
  const l = findAmount('bs.liab');
  const e = findAmount('bs.equity');
  const diff = a - (l + e);
  const fmt = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(diff) < 0.005) {
    return `${perStore.currentPeriod?.name} 资产 ${fmt(a)} = 负债 ${fmt(l)} + 权益 ${fmt(e)} ✅`;
  }
  return `${perStore.currentPeriod?.name} 资产 ${fmt(a)} ≠ 负债+权益 ${fmt(l + e)}（差额 ${fmt(diff)}）❌`;
});
</script>

<style scoped>
.sandbox { height: 100vh; }
.header {
  background: linear-gradient(90deg, #1677ff, #4096ff);
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
}
.brand { font-size: 16px; font-weight: 600; }
.body { height: calc(100vh - 64px - 36px); }
.sider-left, .sider-right {
  background: #fff;
  border-right: 1px solid #f0f0f0;
  overflow: hidden;
}
.sider-right { border-right: none; border-left: 1px solid #f0f0f0; }

/* 让 antd 的 sider 内部子容器变成 flex 纵向，方便 .sider-body 撑满剩余高度 */
.sider-left :deep(.ant-layout-sider-children),
.sider-right :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sider-title {
  padding: 12px;
  font-weight: 600;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  flex: 0 0 auto;
}
.sider-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;   /* 真正的滚动交给内部子组件 (AccountTree / EventDrawer) */
}
.content {
  background: #fff;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.content-top {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;      /* 由内部 Tab / 报表自己负责滚动，避免与 a-table 的 scroll.y 冲突产生双滚动条 */
  display: flex;
  flex-direction: column;
}
/* 让 antd Tabs 内容区撑满剩余高度，方便里面的报表自适应 */
.content-top :deep(.ant-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.content-top :deep(.ant-tabs-content-holder) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.content-top :deep(.ant-tabs-content) {
  height: 100%;
}
.content-top :deep(.ant-tabs-tabpane) {
  height: 100%;
}
.content-bottom {
  flex: 0 0 340px;
  border-top: 2px solid #e6f4ff;
  background: #fff;
  min-height: 0;
  overflow: hidden;
}
.footer {
  height: 36px;
  padding: 0 24px;
  line-height: 36px;
  background: #fafafa;
  color: #555;
  font-size: 13px;
  border-top: 1px solid #f0f0f0;
}
</style>
