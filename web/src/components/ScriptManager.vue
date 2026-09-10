<template>
  <a-modal
    :open="open"
    title="剧本管理"
    width="720px"
    :footer="null"
    @update:open="onUpdateOpen"
  >
    <div class="scripts-mgr">
      <div class="toolbar">
        <a-space>
          <a-button type="primary" @click="openSaveDialog">💾 把当前事件保存为新剧本</a-button>
          <a-upload
            accept=".json,application/json"
            :show-upload-list="false"
            :before-upload="handleImport"
          >
            <a-button>📥 导入 JSON</a-button>
          </a-upload>
        </a-space>
        <span class="hint">共 {{ scriptsStore.scripts.length }} 个已保存剧本</span>
      </div>

      <a-table
        :columns="cols"
        :data-source="scriptsStore.sortedScripts"
        :pagination="false"
        size="small"
        bordered
        row-key="id"
        :scroll="{ y: 320 }"
      >
        <template #emptyText>
          <div style="padding: 24px; color: #999">
            还没有保存的剧本；点击上方按钮保存当前事件，或导入他人分享的 JSON 剧本
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="script-name">{{ record.name }}</div>
            <div class="script-desc" v-if="record.description">{{ record.description }}</div>
          </template>
          <template v-else-if="column.key === 'steps'">
            <a-tag color="blue">{{ record.steps.length }} 条</a-tag>
          </template>
          <template v-else-if="column.key === 'updatedAt'">
            <span class="muted">{{ formatTime(record.updatedAt) }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space size="small">
              <a-button type="link" size="small" @click="loadScript(record)">加载</a-button>
              <a-button type="link" size="small" @click="overwriteScript(record)">覆盖为当前</a-button>
              <a-button type="link" size="small" @click="openRenameDialog(record)">重命名</a-button>
              <a-button type="link" size="small" @click="exportScript(record)">导出</a-button>
              <a-popconfirm title="确认删除该剧本？" @confirm="removeScript(record)">
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>
  </a-modal>

  <!-- 保存为新剧本对话框 -->
  <a-modal
    v-model:open="saveDlg.visible"
    title="保存为新剧本"
    :ok-text="'保存'"
    @ok="doSave"
  >
    <div style="margin-bottom: 8px">
      将当前 <b>{{ evtStore.events.length }}</b> 个事件保存为新剧本
    </div>
    <a-form layout="vertical">
      <a-form-item label="剧本名称" required>
        <a-input v-model:value="saveDlg.name" placeholder="例如：教学 · 完整年度演示" />
      </a-form-item>
      <a-form-item label="备注">
        <a-input v-model:value="saveDlg.description" placeholder="可选" />
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- 重命名对话框 -->
  <a-modal
    v-model:open="renameDlg.visible"
    title="重命名剧本"
    :ok-text="'保存'"
    @ok="doRename"
  >
    <a-form layout="vertical">
      <a-form-item label="剧本名称" required>
        <a-input v-model:value="renameDlg.name" />
      </a-form-item>
      <a-form-item label="备注">
        <a-input v-model:value="renameDlg.description" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Modal, message } from 'ant-design-vue';
import { useScriptsStore, type SavedScript } from '@/stores/scripts';
import { useEventsStore } from '@/stores/events';
import { usePeriodsStore } from '@/stores/periods';
import {
  eventsToSteps,
  runSteps,
  stepsToFileJSON,
  parseScriptFile,
  downloadTextFile
} from '@/engine/scriptSerializer';

const props = defineProps<{ open: boolean; autoSaveOnOpen?: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'update:autoSaveOnOpen', v: boolean): void;
}>();

function onUpdateOpen(v: boolean) {
  emit('update:open', v);
  if (!v) emit('update:autoSaveOnOpen', false);
}

/** 外部可以传 autoSaveOnOpen=true，打开后自动弹出“保存为新剧本”对话框 */
watch(
  () => [props.open, props.autoSaveOnOpen] as const,
  ([open, auto]) => {
    if (open && auto) {
      openSaveDialog();
      emit('update:autoSaveOnOpen', false); // 一次性触发
    }
  },
  { immediate: true }
);

const scriptsStore = useScriptsStore();
const evtStore = useEventsStore();
const perStore = usePeriodsStore();

const cols = [
  { title: '剧本名', key: 'name' },
  { title: '事件数', key: 'steps', width: 90, align: 'center' },
  { title: '最近更新', key: 'updatedAt', width: 160 },
  { title: '操作', key: 'actions', width: 280 }
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/* ---------------- 保存对话框 ---------------- */
const saveDlg = reactive({ visible: false, name: '', description: '' });
function openSaveDialog() {
  if (evtStore.events.length === 0) {
    message.warning('当前没有任何事件可保存');
    return;
  }
  saveDlg.name = '';
  saveDlg.description = '';
  saveDlg.visible = true;
}
function doSave() {
  const name = saveDlg.name.trim();
  if (!name) {
    message.error('请输入剧本名称');
    return;
  }
  const steps = eventsToSteps(evtStore.events);
  scriptsStore.save(name, steps, saveDlg.description.trim() || undefined);
  saveDlg.visible = false;
  message.success(`剧本「${name}」已保存（${steps.length} 条事件）`);
}

/* ---------------- 重命名对话框 ---------------- */
const renameDlg = reactive({ visible: false, id: '', name: '', description: '' });
function openRenameDialog(s: SavedScript) {
  renameDlg.id = s.id;
  renameDlg.name = s.name;
  renameDlg.description = s.description ?? '';
  renameDlg.visible = true;
}
function doRename() {
  const name = renameDlg.name.trim();
  if (!name) {
    message.error('名称不能为空');
    return;
  }
  scriptsStore.update(renameDlg.id, { name, description: renameDlg.description.trim() || undefined });
  renameDlg.visible = false;
  message.success('已重命名');
}

/* ---------------- 加载已存剧本 ---------------- */
function loadScript(s: SavedScript) {
  Modal.confirm({
    title: `加载剧本「${s.name}」`,
    content: `加载后会先清空当前所有事件，再灌入该剧本的 ${s.steps.length} 条事件。是否继续？`,
    onOk: () => {
      const r = runSteps(s.steps, evtStore, perStore);
      if (r.fail > 0) {
        message.warning(`加载完成：成功 ${r.ok} 条，失败 ${r.fail} 条（详见控制台）`);
        console.warn('[script] 部分事件加载失败：', r.failures);
      } else {
        message.success(`剧本「${s.name}」加载完成（${r.ok} 条）`);
      }
      emit('update:open', false);
    }
  });
}

/* ---------------- 覆盖已存剧本 ---------------- */
function overwriteScript(s: SavedScript) {
  if (evtStore.events.length === 0) {
    message.warning('当前没有任何事件可保存');
    return;
  }
  Modal.confirm({
    title: `覆盖剧本「${s.name}」`,
    content: `将用当前的 ${evtStore.events.length} 条事件覆盖该剧本原有内容，无法撤销。是否继续？`,
    onOk: () => {
      const steps = eventsToSteps(evtStore.events);
      scriptsStore.update(s.id, { steps });
      message.success(`剧本「${s.name}」已更新（${steps.length} 条事件）`);
    }
  });
}

/* ---------------- 导出 JSON ---------------- */
function exportScript(s: SavedScript) {
  const json = stepsToFileJSON(s.name, s.steps, s.description);
  const safeName = s.name.replace(/[\\/:*?"<>|]/g, '_');
  downloadTextFile(`${safeName}.json`, json);
  message.success(`已导出「${s.name}」`);
}

/* ---------------- 从 JSON 导入 ---------------- */
function handleImport(file: File): boolean {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result ?? '');
      const parsed = parseScriptFile(text);
      scriptsStore.save(parsed.name, parsed.steps, parsed.description);
      message.success(`已导入剧本「${parsed.name}」（${parsed.steps.length} 条）`);
    } catch (e: any) {
      message.error(`导入失败：${e?.message ?? e}`);
    }
  };
  reader.onerror = () => message.error('文件读取失败');
  reader.readAsText(file);
  return false; // 阻止 antd Upload 自动上传
}

/* ---------------- 删除 ---------------- */
function removeScript(s: SavedScript) {
  scriptsStore.remove(s.id);
  message.success(`已删除「${s.name}」`);
}
</script>

<style scoped>
.scripts-mgr { display: flex; flex-direction: column; gap: 12px; }
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hint { color: #999; font-size: 12px; }
.script-name { font-weight: 600; }
.script-desc { color: #888; font-size: 12px; margin-top: 2px; }
.muted { color: #999; }
</style>
