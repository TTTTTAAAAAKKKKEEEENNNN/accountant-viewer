<template>
  <div v-if="fatalError" class="fatal-box">
    <h2>⚠️ 应用启动异常</h2>
    <p>可能是浏览器 localStorage 中保留了旧版本数据结构，与新代码不兼容。</p>
    <pre>{{ fatalError }}</pre>
    <a-space>
      <a-button type="primary" danger @click="clearAllAndReload">清空本地数据并刷新</a-button>
      <a-button @click="reload">仅刷新</a-button>
    </a-space>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';

const fatalError = ref<string | null>(null);

onErrorCaptured((err) => {
  // eslint-disable-next-line no-console
  console.error('[App] 顶层错误捕获：', err);
  fatalError.value = (err as Error)?.stack || String(err);
  return false; // 阻止继续冒泡
});

function clearAllAndReload() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('av.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* ignore */
  }
  location.reload();
}
function reload() {
  location.reload();
}
</script>

<style scoped>
.fatal-box {
  max-width: 780px;
  margin: 80px auto;
  padding: 24px;
  border: 1px solid #ffccc7;
  background: #fff2f0;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.fatal-box h2 { color: #cf1322; margin: 0 0 12px; }
.fatal-box pre {
  background: #fff;
  border: 1px solid #f0f0f0;
  padding: 10px;
  font-size: 12px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>