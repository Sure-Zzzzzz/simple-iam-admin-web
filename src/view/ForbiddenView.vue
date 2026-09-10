<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import { adminState } from '../adminState';
import { firstPermittedRoute } from '../adminPermissions';

const route = useRoute();
const router = useRouter();

const fromPath = computed(() => {
  const from = route.query.from;
  return typeof from === 'string' && from ? from : '';
});

const fallbackRoute = computed(() => firstPermittedRoute(adminState.currentUser));

const description = computed(() =>
  fromPath.value
    ? `当前账号没有访问 ${fromPath.value} 的页面权限，可联系管理员在角色管理中分配对应权限后重新登录。`
    : '当前账号没有该页面的访问权限，可联系管理员在角色管理中分配对应权限后重新登录。'
);

function backToPermitted() {
  router.push(fallbackRoute.value);
}
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="无权访问该页面"
      :description="description"
      :primary-label="fallbackRoute !== '/403' ? '返回可用页面' : undefined"
      @primary="backToPermitted"
    />
    <p class="admin-message error" role="alert">权限不足（403）</p>
  </section>
</template>
