<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ShieldAlert } from 'lucide-vue-next';
import { adminState, ensureAdminUser } from './adminState';
import { logoutCurrentSession } from './api/iamAuth';
import { canEnterAdminConsole, visibleNavItems } from './adminPermissions';

const standalone = computed(() => !adminState.bridge);
const navItems = computed(() => visibleNavItems(adminState.currentUser));
// 无权限（有用户但控制台页面权限一项都没有）与读取失败是两种形态：
// 前者是确定态给出路，后者可重试
const noPermission = computed(() =>
  adminState.currentUser !== null && !canEnterAdminConsole(adminState.currentUser));
const loggingOut = ref(false);

async function submitLogout() {
  if (loggingOut.value) {
    return;
  }
  loggingOut.value = true;
  await logoutCurrentSession();
  window.location.assign('/login');
}

function backToPortal() {
  window.location.assign('/app/');
}

async function retryLoad() {
  adminState.currentUser = null;
  await ensureAdminUser();
}

onMounted(() => {
  ensureAdminUser();
});
</script>

<template>
  <section class="iam-admin-app" :class="{ 'iam-admin-app--embedded': !standalone }">
    <header v-if="standalone" class="iam-admin-header">
      <div>
        <span>身份与访问控制</span>
        <h1>统一身份与访问管理</h1>
      </div>
      <nav class="iam-module-nav" aria-label="统一身份与访问管理模块导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">{{ item.label }}</RouterLink>
      </nav>
    </header>
    <p v-if="adminState.authLoading" class="admin-message">正在校验统一身份与访问管理权限...</p>
    <section v-else-if="noPermission" class="admin-blocked" role="alert" aria-live="polite">
      <span class="admin-blocked-icon" aria-hidden="true"><ShieldAlert :size="30" :stroke-width="1.75" /></span>
      <h1>当前账号没有统一身份与访问管理权限</h1>
      <p class="admin-blocked-detail">
        当前账号未获得管理控制台的任何页面权限。如需使用，请联系平台管理员为你的角色开通相应页面权限。
      </p>
      <div class="admin-blocked-actions">
        <button v-if="!standalone" type="button" class="admin-blocked-secondary" @click="backToPortal">返回门户</button>
        <button type="button" class="admin-blocked-danger" :disabled="loggingOut" @click="submitLogout">
          {{ loggingOut ? '退出中...' : '退出登录' }}
        </button>
      </div>
    </section>
    <section v-else-if="adminState.authError" class="admin-message error" role="alert">
      <p>{{ adminState.authError }}</p>
      <div class="admin-blocked-actions">
        <button type="button" class="admin-blocked-secondary" @click="retryLoad">重新加载</button>
        <button type="button" class="admin-blocked-danger" :disabled="loggingOut" @click="submitLogout">
          {{ loggingOut ? '退出中...' : '退出登录' }}
        </button>
      </div>
    </section>
    <RouterView v-else />
  </section>
</template>
