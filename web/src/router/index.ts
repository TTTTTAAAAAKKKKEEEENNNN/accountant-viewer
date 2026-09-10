import { createRouter, createWebHashHistory } from 'vue-router';
import SandboxView from '@/views/SandboxView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: SandboxView, name: 'sandbox' }
  ]
});
