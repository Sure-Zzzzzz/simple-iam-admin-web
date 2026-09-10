<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { adminState, ensureAdminUser } from './adminState';
import { visibleNavItems } from './adminPermissions';

const standalone = computed(() => !adminState.bridge);
const navItems = computed(() => visibleNavItems(adminState.currentUser));

onMounted(() => {
  ensureAdminUser();
});
</script>

<template>
  <section class="iam-admin-app">
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
    <p v-else-if="adminState.authError" class="admin-message error" role="alert">{{ adminState.authError }}</p>
    <RouterView v-else />
  </section>
</template>
