# 会计三表沙盘 (Web)

前端工程 —— 详见根目录 [`openspec/specs/system-overview.md`](../openspec/specs/system-overview.md)。

## 启动

```bash
npm install
npm run dev       # http://localhost:5173
npm run test      # 会计引擎单元测试
```

首次打开点右上角 **"加载演示剧本"** 按钮即可看到完整三表联动。

## 技术栈

Vue 3 + TypeScript + Vite + Ant Design Vue 4 + Pinia (localStorage 持久化) + Vitest。

## 目录

| 路径 | 说明 |
|---|---|
| `src/types/` | 核心类型（Account, Period, JournalEntry ...） |
| `src/data/` | ★ 可配置区：科目/期间/报表/事件模板 |
| `src/engine/` | 纯函数引擎：校验 / 余额 / 报表汇总 / Q 视图 / CF |
| `src/stores/` | Pinia + persist |
| `src/components/` | 科目树 / 期间矩阵 / 事件抽屉 / 三表视图 |
| `src/views/` | 页面 |
| `src/__tests__/` | 会计恒等式生命线测试 |
