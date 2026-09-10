<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminState } from '../adminState';
import {
  fetchAdminDashboard,
  fetchActiveSessions,
  fetchDashboardRecentLogins,
  revokeUserSessions,
  type AdminDashboard,
  type AdminDashboardRecentLogin,
  type AdminSession
} from '../api/iamAuth';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import DashboardIcon from '../components/DashboardIcon.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';

const recentPageSize = ref(10);
const sessionPageSize = ref(10);

const dashboard = ref<AdminDashboard | null>(null);
const loading = ref(false);
const error = ref('');
const recentLogins = ref<AdminDashboardRecentLogin[]>([]);
const loginPage = ref(1);
const loginTotalPages = ref(1);
const loginTotal = ref(0);
const loginPending = ref(false);

const sessionsDrawerOpen = ref(false);
const sessions = ref<AdminSession[]>([]);
const sessionPage = ref(1);
const sessionTotalPages = ref(1);
const sessionTotal = ref(0);
const sessionPending = ref(false);
const sessionError = ref('');
const revokeTarget = ref<AdminSession | null>(null);
const revokePending = ref(false);

const currentUser = computed(() => adminState.currentUser);

const roleNames = computed(() =>
  (currentUser.value?.authorities ?? []).filter(a => a.startsWith('ROLE_')).map(a => a.slice(5))
);
const permissionCount = computed(() =>
  (currentUser.value?.authorities ?? []).filter(a => !a.startsWith('ROLE_')).length
);
const lockedUsers = computed(() => dashboard.value?.stats.lockedUsers ?? 0);
const disabledUsers = computed(() => dashboard.value?.stats.disabledUsers ?? 0);
const usersWithoutDepartment = computed(() => dashboard.value?.stats.usersWithoutDepartment ?? 0);

type MetricIcon = 'user' | 'department' | 'user-group' | 'role' | 'trusted-app';

const metrics = computed<Array<{ label: string; value: number | undefined; to: string; icon: MetricIcon; hint: string }>>(() => [
  { label: '用户', value: dashboard.value?.counts.user, to: '/users', icon: 'user', hint: '组织成员与账号全量' },
  { label: '部门', value: dashboard.value?.counts.department, to: '/organizations', icon: 'department', hint: '部门树与直属组织' },
  { label: '协作组', value: dashboard.value?.counts.userGroup, to: '/user-groups', icon: 'user-group', hint: '跨部门协作成员组' },
  { label: '角色', value: dashboard.value?.counts.role, to: '/roles', icon: 'role', hint: '职责与权限集合' },
  { label: '可信应用', value: dashboard.value?.counts.trustedApplication, to: '/trusted-applications', icon: 'trusted-app', hint: '接入应用与门户展示' }
]);

const loginPlaceholderCount = computed(() =>
  recentLogins.value.length > 0 ? Math.max(0, Math.min(recentPageSize.value, 5) - recentLogins.value.length) : 0
);

function formatDateTime(datetime: string | null | undefined): string {
  return datetime ? new Date(datetime).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function displayValue(value: number | undefined): string {
  return loading.value || value === undefined ? '—' : String(value);
}

async function loadDashboard() {
  loading.value = true;
  error.value = '';
  loginPending.value = true;
  try {
    const [overview, logins] = await Promise.all([
      fetchAdminDashboard(),
      fetchDashboardRecentLogins({ page: 1, size: recentPageSize.value })
    ]);
    dashboard.value = overview;
    recentLogins.value = logins.content;
    loginPage.value = logins.page;
    loginTotalPages.value = logins.totalPages;
    loginTotal.value = logins.totalElements;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载管理台失败';
  } finally {
    loading.value = false;
    loginPending.value = false;
  }
}

async function loadLogins(page: number) {
  loginPending.value = true;
  try {
    const logins = await fetchDashboardRecentLogins({ page, size: recentPageSize.value });
    recentLogins.value = logins.content;
    loginPage.value = logins.page;
    loginTotalPages.value = logins.totalPages;
    loginTotal.value = logins.totalElements;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载最近登录失败';
  } finally {
    loginPending.value = false;
  }
}

function changeLoginPage(page: number) {
  if (page < 1 || page > loginTotalPages.value || page === loginPage.value || loginPending.value) {
    return;
  }
  void loadLogins(page);
}

function changeLoginPageSize(size: number) {
  if (size < 1 || size === recentPageSize.value || loginPending.value) {
    return;
  }
  recentPageSize.value = size;
  void loadLogins(1);
}

async function loadSessions(page = 1) {
  sessionPending.value = true;
  sessionError.value = '';
  try {
    const result = await fetchActiveSessions({ page, size: sessionPageSize.value });
    sessions.value = result.content;
    sessionPage.value = result.page;
    sessionTotalPages.value = result.totalPages;
    sessionTotal.value = result.totalElements;
  } catch (e) {
    sessionError.value = e instanceof Error ? e.message : '加载在线会话失败';
  } finally {
    sessionPending.value = false;
  }
}

function openSessionsDrawer() {
  sessionsDrawerOpen.value = true;
  void loadSessions(1);
}

function changeSessionPage(page: number) {
  if (page < 1 || page > sessionTotalPages.value || page === sessionPage.value || sessionPending.value) {
    return;
  }
  void loadSessions(page);
}

function changeSessionPageSize(size: number) {
  if (size < 1 || size === sessionPageSize.value || sessionPending.value) {
    return;
  }
  sessionPageSize.value = size;
  void loadSessions(1);
}

function requestRevoke(session: AdminSession) {
  revokeTarget.value = session;
}

async function confirmRevoke() {
  const target = revokeTarget.value;
  if (!target) {
    return;
  }
  revokePending.value = true;
  try {
    await revokeUserSessions(target.userId);
    revokeTarget.value = null;
    const nextPage = sessions.value.every(s => s.userId === target.userId) ? Math.max(sessionPage.value - 1, 1) : sessionPage.value;
    await Promise.all([
      loadSessions(nextPage),
      fetchAdminDashboard().then(overview => { dashboard.value = overview; })
    ]);
  } catch (e) {
    sessionError.value = e instanceof Error ? e.message : '强制下线失败';
  } finally {
    revokePending.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="统一身份与访问管理"
      description="总览数量规模、运行状态与最近登录。数据仅反映当前身份与访问管理实例的真实配置。"
    />

    <section v-if="error" class="admin-message error dashboard-error" role="alert">
      <p>{{ error }}</p>
      <button class="button-secondary" type="button" :disabled="loading" @click="loadDashboard">重试读取概览</button>
    </section>

    <h2 class="dashboard-section-heading">运行状态</h2>
    <section class="dashboard-runtime" aria-label="运行状态" :aria-busy="loading">
      <button class="dashboard-card" type="button" @click="openSessionsDrawer">
        <span class="metric-label"><DashboardIcon name="session" /> 在线会话</span>
        <strong>{{ displayValue(dashboard?.stats.activeSessions) }}</strong>
        <p>点击查看全部在线会话，可强制下线</p>
      </button>
      <router-link
        class="dashboard-card"
        :to="{ path: '/users', query: { lastLogin: 'today' } }"
        aria-label="今日登录用户，进入用户管理筛选视图"
      >
        <span class="metric-label"><DashboardIcon name="today-login" /> 今日登录用户</span>
        <strong>{{ displayValue(dashboard?.stats.todayLoggedInUsers) }}</strong>
        <p>点击查看今日登录过的用户</p>
      </router-link>
      <router-link
        :class="['dashboard-card', { warning: lockedUsers > 0 }]"
        :to="{ path: '/users', query: { locked: '1' } }"
        aria-label="锁定账号，进入用户管理筛选视图"
      >
        <span class="metric-label"><DashboardIcon name="lock" /> 锁定账号</span>
        <strong>{{ displayValue(dashboard?.stats.lockedUsers) }}</strong>
        <p v-if="lockedUsers > 0">存在锁定中的账号，点击前往处理</p>
        <p v-else>暂无锁定账号</p>
      </router-link>
      <router-link
        :class="['dashboard-card', { warning: disabledUsers > 0 }]"
        :to="{ path: '/users', query: { status: '0' } }"
        aria-label="禁用账号，进入用户管理筛选视图"
      >
        <span class="metric-label"><DashboardIcon name="user" /> 禁用账号</span>
        <strong>{{ displayValue(dashboard?.stats.disabledUsers) }}</strong>
        <p v-if="disabledUsers > 0">存在被禁用的账号，点击前往处理</p>
        <p v-else>暂无禁用账号</p>
      </router-link>
      <router-link
        :class="['dashboard-card', { warning: usersWithoutDepartment > 0 }]"
        :to="{ path: '/users', query: { noDepartment: '1' } }"
        aria-label="未挂部门，进入用户管理筛选视图"
      >
        <span class="metric-label"><DashboardIcon name="department" /> 未挂部门</span>
        <strong>{{ displayValue(dashboard?.stats.usersWithoutDepartment) }}</strong>
        <p v-if="usersWithoutDepartment > 0">有账号尚未归属部门，点击前往处理</p>
        <p v-else>全部账号已挂部门</p>
      </router-link>
    </section>

    <h2 class="dashboard-section-heading">数量总览</h2>
    <section class="dashboard-metrics" aria-label="身份治理概览" :aria-busy="loading">
      <router-link v-for="metric in metrics" :key="metric.label" class="dashboard-card" :to="metric.to">
        <span class="metric-label"><DashboardIcon :name="metric.icon" /> {{ metric.label }}</span>
        <strong>{{ displayValue(metric.value) }}</strong>
        <p>{{ metric.hint }}</p>
      </router-link>
    </section>

    <section class="dashboard-split">
      <div class="dashboard-panel">
        <div class="dashboard-panel-heading">
          <span class="metric-label">最近登录</span>
          <h2>最近登录的用户</h2>
        </div>
        <ul v-if="recentLogins.length" class="dashboard-login-list">
          <li v-for="login in recentLogins" :key="login.userId">
            <div class="dashboard-login-user">
              <strong>{{ login.displayName || login.username }}</strong>
              <span>{{ login.username }}<template v-if="login.departmentName"> · {{ login.departmentName }}</template></span>
            </div>
            <time :datetime="login.lastLoginAt">{{ formatDateTime(login.lastLoginAt) }}</time>
          </li>
          <li
            v-for="placeholder in loginPlaceholderCount"
            :key="`recent-login-placeholder-${placeholder}`"
            class="dashboard-login-placeholder"
            aria-hidden="true"
          >
            <div class="dashboard-login-user"><strong> </strong><span> </span></div>
          </li>
        </ul>
        <p v-else-if="!loginPending" class="dashboard-login-empty">还没有用户登录过。</p>
        <Pagination
          v-if="loginTotal > 0"
          :current="loginPage"
          :total="loginTotal"
          :page-size="recentPageSize"
          @update:current="changeLoginPage"
          @update:page-size="changeLoginPageSize"
        />
      </div>
      <div class="dashboard-panel">
        <div class="dashboard-panel-heading">
          <span class="metric-label">当前管理员</span>
          <h2>{{ currentUser?.displayName || currentUser?.username || '—' }}</h2>
        </div>
        <dl v-if="currentUser" class="dashboard-identity">
          <div><dt>用户名</dt><dd>{{ currentUser.username }}</dd></div>
          <div><dt>角色</dt><dd>{{ roleNames.length ? roleNames.join('、') : '—' }}</dd></div>
          <div><dt>持有权限</dt><dd>{{ permissionCount }} 项</dd></div>
        </dl>
        <p v-else class="dashboard-login-empty">正在读取当前身份...</p>
      </div>
    </section>

    <section v-if="!loading && dashboard?.counts.user === 0" class="admin-empty-state">
      <DashboardIcon name="department" />
      <h2>身份管理数据尚未初始化</h2>
      <p>先在组织工作区创建部门和成员，再按职责建立角色与权限。</p>
    </section>

    <EntityDrawer
      :open="sessionsDrawerOpen"
      :pending="sessionPending"
      title="在线会话"
      description="当前实例的全部活跃会话，按最近活跃倒序；强制下线会撤销该用户全部会话。"
      @close="!sessionPending && (sessionsDrawerOpen = false)"
    >
      <p v-if="sessionError" class="admin-message error" role="alert">{{ sessionError }}</p>
      <h3 class="drawer-section-title">在线会话（{{ sessionTotal }}）</h3>
      <div class="responsive-table">
        <table>
          <thead>
            <tr><th>用户</th><th>客户端</th><th>来源 IP</th><th>最近活跃</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-if="sessions.length === 0 && !sessionPending"><td colspan="5" class="table-empty">当前没有在线会话。</td></tr>
            <tr v-for="session in sessions" :key="session.sessionId">
              <td>{{ session.username }}</td>
              <td>{{ session.clientId || '—' }}</td>
              <td>{{ session.remoteIp || '—' }}</td>
              <td>{{ formatDateTime(session.lastActiveAt) }}</td>
              <td class="table-actions">
                <button class="table-action" type="button" :disabled="revokePending" @click="requestRevoke(session)">强制下线</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination
        v-if="sessionTotal > 0"
        :current="sessionPage"
        :total="sessionTotal"
        :page-size="sessionPageSize"
        @update:current="changeSessionPage"
        @update:page-size="changeSessionPageSize"
      />
    </EntityDrawer>

    <ConfirmDialog
      :open="revokeTarget !== null"
      title="强制下线确认"
      :description="revokeTarget ? `将撤销用户 ${revokeTarget.username} 的全部活跃会话，其所有已登录设备立即登出。` : ''"
      confirm-label="强制下线"
      :pending="revokePending"
      @close="!revokePending && (revokeTarget = null)"
      @confirm="confirmRevoke"
    />
  </section>
</template>
