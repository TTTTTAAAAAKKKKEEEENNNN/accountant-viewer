<template>
  <div class="account-tree">
    <a-tree
      :tree-data="treeData"
      :default-expand-all="true"
      :show-line="{ showLeafIcon: false }"
      block-node
    >
      <template #title="node">
        <span :class="{ 'is-contra': node.dataRef?.isContra }">
          <span class="acc-code">{{ node.dataRef?.code }}</span>
          <span class="acc-name">{{ node.title }}</span>
          <a-tag v-if="node.dataRef?.isContra" color="orange" size="small" style="margin-left: 4px">备抵</a-tag>
        </span>
      </template>
    </a-tree>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAccountsStore } from '@/stores/accounts';
import type { Account } from '@/types';

const accStore = useAccountsStore();

interface TreeNode {
  key: string;
  title: string;
  dataRef: Account;
  children?: TreeNode[];
}

function buildTree(parentCode: string | null): TreeNode[] {
  return accStore.accounts
    .filter((a) => a.parentCode === parentCode)
    .map((a) => {
      const children = buildTree(a.code);
      return {
        key: a.code,
        title: a.name,
        dataRef: a,
        children: children.length ? children : undefined
      };
    });
}

const treeData = computed(() => buildTree(null));
</script>

<style scoped>
.account-tree {
  height: 100%;
  overflow: auto;
  padding: 8px;
  box-sizing: border-box;
}
.acc-code {
  color: #999;
  margin-right: 8px;
  font-family: 'JetBrains Mono', 'Menlo', monospace;
  font-size: 12px;
}
.acc-name {
  color: #222;
}
.is-contra .acc-name {
  color: #d46b08;
}
</style>
