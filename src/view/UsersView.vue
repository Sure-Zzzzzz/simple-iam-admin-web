<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  assignUserRole,
  bindExternalIdentity,
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  fetchAllTrustedApplications,
  fetchApplicationPermissionManifest,
  fetchDepartments,
  fetchLoginProviders,
  fetchRoles,
  fetchUserApplicationAuthorization,
  fetchUserApplicationAuthorizations,
  fetchUserRoles,
  fetchUsers,
  grantUserApplication,
  identitySourceLabel,
  resetUserPassword,
  revokeUserApplication,
  revokeUserRole,
  unbindExternalIdentity,
  unlockUser,
  updateUser,
  type ApplicationPermissionManifest,
  type DataGrantDocument,
  type IamDepartment,
  type IamRole,
  type IamUser,
  type LoginProvider,
  type TrustedApplication,
  type UserApplicationAuthorization,
  type UserPageQuery
} from '../api/iamAuth';
import { adminState } from '../adminState';

const route = useRoute();
const router = useRouter();

const users = ref<IamUser[]>([]);
const roles = ref<IamRole[]>([]);
const departments = ref<IamDepartment[]>([]);
const trustedApplications = ref<TrustedApplication[]>([]);
const loginProviders = ref<LoginProvider[]>([]);
const selectedUser = ref<IamUser | null>(null);
const selectedUserRoles = ref<IamRole[]>([]);
const selectedUserAuthorizations = ref<UserApplicationAuthorization[]>([]);
const revokeApplicationTarget = ref<TrustedApplication | null>(null);
const revokeApplicationPending = ref(false);
const deleteUserTarget = ref<IamUser | null>(null);
const deleteUserPending = ref(false);
const grantDrawerOpen = ref(false);
const grantTargetApplication = ref<TrustedApplication | null>(null);
const grantEditingExisting = ref(false);
const grantDetailPending = ref(false);
const grantPending = ref(false);
const grantManifest = ref<ApplicationPermissionManifest | null>(null);
const grantManifestError = ref<string | null>(null);
const grantSelectedRoles = ref<Set<string>>(new Set());
const grantSelectedPagePermissions = ref<Set<string>>(new Set());
const grantSelectedApiPermissions = ref<Set<string>>(new Set());
const grantDataGrantDocument = ref<DataGrantDocument | null>(null);
const unbindPending = ref(false);
const unbindConfirmOpen = ref(false);
const bindForm = reactive({ providerCode: '', externalId: '' });
const loading = ref(false);
const message = ref('');
const errorMessage = ref('');

const filterForm = reactive({
  keyword: '',
  status: '' as '' | '1' | '0',
  view: '' as '' | 'today' | 'locked' | 'noDepartment'
});

const pageSize = ref(10);
const currentPage = ref(1);
const totalPages = ref(1);
const totalElements = ref(0);

function changeUserPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return;
  }
  currentPage.value = page;
  void loadUsers();
}

function changeUserPageSize(size: number) {
  if (size < 1 || size === pageSize.value) {
    return;
  }
  pageSize.value = size;
  currentPage.value = 1;
  void loadUsers();
}

function searchUsers() {
  currentPage.value = 1;
  void loadUsers();
}

function isLocked(user: IamUser): boolean {
  return !!user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
}

function lockedUntilLabel(user: IamUser): string {
  return new Date(user.lockedUntil as string)
    .toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const createDrawerOpen = ref(false);
const createPending = ref(false);

const createForm = reactive({
  username: '',
  password: '',
  displayName: '',
  email: '',
  phone: '',
  departmentId: ''
});

function resetCreateForm() {
  Object.assign(createForm, { username: '', password: '', displayName: '', email: '', phone: '', departmentId: '' });
}

function closeCreateDrawer() {
  if (!createPending.value) {
    createDrawerOpen.value = false;
    resetCreateForm();
  }
}

const editForm = reactive({
  displayName: '',
  email: '',
  phone: '',
  departmentId: '',
  newPassword: ''
});

const assignableRoles = computed(() => {
  const assigned = new Set(selectedUserRoles.value.map(role => role.id));
  return roles.value.filter(role => !assigned.has(role.id));
});

const activeAuthorizations = computed(() =>
  selectedUserAuthorizations.value.filter(item => item.status === 1)
);

const revokedAuthorizations = computed(() =>
  selectedUserAuthorizations.value.filter(item => item.status !== 1)
);

const grantableApplications = computed(() => {
  const authorized = new Set(activeAuthorizations.value.map(item => item.applicationId));
  return trustedApplications.value.filter(application => !authorized.has(application.id));
});

const selectedUserIsPlatformAdmin = computed(() =>
  selectedUserRoles.value.some(role => role.code === 'iam_admin')
);

function hasApiPermission(permission: string): boolean {
  const currentUser = adminState.currentUser;
  return Boolean(currentUser?.admin || currentUser?.authorities.includes(permission));
}

const canReadRoleCatalog = computed(() => hasApiPermission('iam:role:api'));
const canReadDepartmentCatalog = computed(() => hasApiPermission('iam:department:api'));
const canReadTrustedApplicationCatalog = computed(() => hasApiPermission('iam:trusted-application:api'));
const hasRestrictedUserTools = computed(() =>
  !canReadRoleCatalog.value || !canReadDepartmentCatalog.value || !canReadTrustedApplicationCatalog.value
);

function applicationLabel(applicationId: number): string {
  const application = trustedApplications.value.find(item => item.id === applicationId);
  return application
    ? `${application.applicationName}（${application.applicationCode}）`
    : `应用 #${applicationId}`;
}

function toDepartmentId(value: string): number | null {
  const departmentId = Number(value);
  return Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null;
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function todayStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function buildUserQuery(): UserPageQuery {
  const query: UserPageQuery = { page: currentPage.value, size: pageSize.value };
  if (filterForm.keyword.trim()) {
    query.keyword = filterForm.keyword.trim();
  }
  if (filterForm.status !== '') {
    query.status = Number(filterForm.status);
  }
  if (filterForm.view === 'today') {
    query.lastLoginAfter = todayStartIso();
  }
  if (filterForm.view === 'locked') {
    query.lockedUntilAfter = new Date().toISOString();
  }
  if (filterForm.view === 'noDepartment') {
    query.noDepartment = true;
  }
  return query;
}

// 仪表盘下钻链接形式：/users?lastLogin=today、/users?locked=1 或 /users?noDepartment=1
function applyRouteQuery() {
  const query = route.query;
  filterForm.keyword = typeof query.keyword === 'string' ? query.keyword : '';
  filterForm.status = query.status === '1' || query.status === '0' ? query.status : '';
  filterForm.view = query.lastLogin === 'today'
    ? 'today'
    : query.locked === '1'
      ? 'locked'
      : query.noDepartment === '1'
        ? 'noDepartment'
        : '';
}

async function resetFilters() {
  if (Object.keys(route.query).length > 0) {
    await router.replace({ query: {} });
    return;
  }
  Object.assign(filterForm, { keyword: '', status: '', view: '' });
  searchUsers();
}

async function loadUsers() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [userPage, roleList, departmentList, applicationList] = await Promise.all([
      fetchUsers(buildUserQuery()),
      canReadRoleCatalog.value ? fetchRoles() : Promise.resolve([]),
      canReadDepartmentCatalog.value ? fetchDepartments() : Promise.resolve([]),
      canReadTrustedApplicationCatalog.value ? fetchAllTrustedApplications() : Promise.resolve([])
    ]);
    users.value = userPage.content;
    totalElements.value = userPage.totalElements;
    totalPages.value = Math.max(userPage.totalPages, 1);
    currentPage.value = userPage.page;
    roles.value = roleList;
    departments.value = departmentList;
    trustedApplications.value = applicationList;
    if (selectedUser.value) {
      const latest = users.value.find(user => user.id === selectedUser.value?.id);
      if (latest) {
        await selectUser(latest);
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载用户失败';
  } finally {
    loading.value = false;
  }
}

async function submitCreateUser() {
  message.value = '';
  errorMessage.value = '';
  createPending.value = true;
  try {
    await createUser({
      username: createForm.username,
      password: createForm.password,
      displayName: createForm.displayName,
      email: createForm.email,
      phone: createForm.phone,
      departmentId: canReadDepartmentCatalog.value ? toDepartmentId(createForm.departmentId) : null
    });
    createDrawerOpen.value = false;
    resetCreateForm();
    message.value = '用户创建成功';
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建用户失败';
  } finally {
    createPending.value = false;
  }
}

async function selectUser(user: IamUser) {
  selectedUser.value = user;
  Object.assign(editForm, {
    displayName: user.displayName || '',
    email: user.email || '',
    phone: user.phone || '',
    departmentId: user.departmentId ? String(user.departmentId) : '',
    newPassword: ''
  });
  const [roleList, authorizationList] = await Promise.all([
    fetchUserRoles(user.id),
    canReadTrustedApplicationCatalog.value
      ? fetchUserApplicationAuthorizations(user.id)
      : Promise.resolve([])
  ]);
  selectedUserRoles.value = roleList;
  selectedUserAuthorizations.value = authorizationList;
}

async function submitUpdateUser() {
  if (!selectedUser.value) {
    return;
  }
  message.value = '';
  errorMessage.value = '';
  try {
    const updated = await updateUser(selectedUser.value.id, {
      displayName: editForm.displayName,
      email: editForm.email,
      phone: editForm.phone,
      departmentId: canReadDepartmentCatalog.value
        ? toDepartmentId(editForm.departmentId)
        : selectedUser.value.departmentId,
      clearDepartment: canReadDepartmentCatalog.value && !editForm.departmentId
    });
    selectedUser.value = updated;
    message.value = '用户信息已更新';
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新用户失败';
  }
}

async function toggleUser(user: IamUser) {
  message.value = '';
  errorMessage.value = '';
  try {
    if (user.status === 1) {
      await disableUser(user.id);
      message.value = '用户已禁用';
    } else {
      await enableUser(user.id);
      message.value = '用户已启用';
    }
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新状态失败';
  }
}

async function unlockUserAction(user: IamUser) {
  message.value = '';
  errorMessage.value = '';
  try {
    await unlockUser(user.id);
    message.value = `已解锁 ${user.username}，可立即重新登录`;
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '解锁失败';
  }
}

function askDeleteUser(user: IamUser) {
  message.value = '';
  errorMessage.value = '';
  deleteUserTarget.value = user;
}

async function confirmDeleteUser() {
  const target = deleteUserTarget.value;
  if (!target) {
    return;
  }
  deleteUserPending.value = true;
  try {
    await deleteUser(target.id);
    deleteUserTarget.value = null;
    message.value = `已删除用户 ${target.username}`;
    if (selectedUser.value?.id === target.id) {
      selectedUser.value = null;
    }
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除用户失败';
  } finally {
    deleteUserPending.value = false;
  }
}

async function submitResetPassword() {
  if (!selectedUser.value || !editForm.newPassword) {
    errorMessage.value = '请输入新密码';
    return;
  }
  message.value = '';
  errorMessage.value = '';
  try {
    await resetUserPassword(selectedUser.value.id, editForm.newPassword);
    editForm.newPassword = '';
    message.value = '密码已重置';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重置密码失败';
  }
}

async function assignRole(roleId: number) {
  if (!selectedUser.value) {
    return;
  }
  message.value = '';
  errorMessage.value = '';
  try {
    await assignUserRole(selectedUser.value.id, roleId);
    selectedUserRoles.value = await fetchUserRoles(selectedUser.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '分配角色失败';
  }
}

async function revokeRole(roleId: number) {
  if (!selectedUser.value) {
    return;
  }
  message.value = '';
  errorMessage.value = '';
  try {
    await revokeUserRole(selectedUser.value.id, roleId);
    selectedUserRoles.value = await fetchUserRoles(selectedUser.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '移除角色失败';
  }
}

async function refreshAuthorizations() {
  if (!selectedUser.value) {
    return;
  }
  selectedUserAuthorizations.value = await fetchUserApplicationAuthorizations(selectedUser.value.id);
}

async function openGrantDrawer(application: TrustedApplication, existing: UserApplicationAuthorization | null) {
  if (!selectedUser.value) {
    return;
  }
  grantTargetApplication.value = application;
  grantEditingExisting.value = Boolean(existing);
  grantSelectedRoles.value = new Set();
  grantSelectedPagePermissions.value = new Set();
  grantSelectedApiPermissions.value = new Set();
  grantDataGrantDocument.value = null;
  grantManifest.value = null;
  grantManifestError.value = null;
  grantDrawerOpen.value = true;
  grantDetailPending.value = true;
  try {
    const manifest = await fetchApplicationPermissionManifest(application.id);
    if (manifest === null) {
      grantManifestError.value = '该应用尚未登记权限清单';
    } else {
      grantManifest.value = manifest;
      if (existing) {
        const detail = await fetchUserApplicationAuthorization(selectedUser.value.id, application.id);
        grantSelectedRoles.value = new Set(detail.roles);
        grantSelectedPagePermissions.value = new Set(detail.pagePermissions);
        grantSelectedApiPermissions.value = new Set(detail.apiPermissions);
        grantDataGrantDocument.value = detail.dataGrantDocument;
      }
    }
  } catch (error) {
    grantManifestError.value = error instanceof Error ? error.message : '读取权限清单失败';
  } finally {
    grantDetailPending.value = false;
  }
}

function toggleGrantCode(list: 'roles' | 'pagePermissions' | 'apiPermissions', code: string) {
  const target = list === 'roles'
    ? grantSelectedRoles
    : list === 'pagePermissions' ? grantSelectedPagePermissions : grantSelectedApiPermissions;
  const next = new Set(target.value);
  if (next.has(code)) {
    next.delete(code);
  } else {
    next.add(code);
  }
  target.value = next;
}

async function submitGrant() {
  if (!selectedUser.value || !grantTargetApplication.value || !grantManifest.value) {
    return;
  }
  message.value = '';
  errorMessage.value = '';
  grantPending.value = true;
  try {
    await grantUserApplication(selectedUser.value.id, grantTargetApplication.value.id, {
      roles: [...grantSelectedRoles.value],
      pagePermissions: [...grantSelectedPagePermissions.value],
      apiPermissions: [...grantSelectedApiPermissions.value],
      dataGrantDocument: grantDataGrantDocument.value
    });
    message.value = `已保存 ${grantTargetApplication.value.applicationName} 的授权`;
    grantDrawerOpen.value = false;
    await refreshAuthorizations();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存授权失败';
  } finally {
    grantPending.value = false;
  }
}

async function submitBindExternal() {
  if (!selectedUser.value) {
    return;
  }
  if (!bindForm.providerCode || !bindForm.externalId.trim()) {
    errorMessage.value = '请选择登录方式并填写外部标识';
    return;
  }
  message.value = '';
  errorMessage.value = '';
  try {
    await bindExternalIdentity(selectedUser.value.id, bindForm.providerCode, bindForm.externalId.trim());
    Object.assign(bindForm, { providerCode: '', externalId: '' });
    message.value = '外部身份已绑定';
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '绑定外部身份失败';
  }
}

async function confirmUnbindExternal() {
  if (!selectedUser.value) {
    return;
  }
  unbindPending.value = true;
  try {
    await unbindExternalIdentity(selectedUser.value.id);
    message.value = '外部身份已解绑，该用户回退为本地密码登录';
    unbindConfirmOpen.value = false;
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '解绑外部身份失败';
    unbindConfirmOpen.value = false;
  } finally {
    unbindPending.value = false;
  }
}

function askRevokeApplication(application: TrustedApplication) {
  revokeApplicationTarget.value = application;
}

async function confirmRevokeApplication() {
  if (!selectedUser.value || !revokeApplicationTarget.value) {
    return;
  }
  revokeApplicationPending.value = true;
  try {
    await revokeUserApplication(selectedUser.value.id, revokeApplicationTarget.value.id);
    message.value = `已撤销 ${revokeApplicationTarget.value.applicationName} 的授权`;
    revokeApplicationTarget.value = null;
    await refreshAuthorizations();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '撤销授权失败';
    revokeApplicationTarget.value = null;
  } finally {
    revokeApplicationPending.value = false;
  }
}

onMounted(() => {
  applyRouteQuery();
  loadUsers();
  fetchLoginProviders().then(providers => {
    loginProviders.value = providers.filter(provider => provider.code !== 'local-password' && provider.enabled !== false);
  }).catch(() => {
    loginProviders.value = [];
  });
});

watch(() => route.query, () => {
  applyRouteQuery();
  currentPage.value = 1;
  void loadUsers();
});
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="用户管理"
      description="创建用户、维护部门和基础信息、启停账号、重置密码和分配角色。"
      primary-label="创建用户"
      @primary="createDrawerOpen = true"
    />
    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="admin-message error" role="alert">{{ errorMessage }}</p>
    <p v-if="hasRestrictedUserTools" class="assignment-empty">
      当前账号只具备部分用户管理范围；角色、组织和应用授权按独立权限控制。
    </p>

    <section class="panel">
      <div>
        <h2>用户列表 <span>{{ totalElements }}</span></h2>
        <div class="data-toolbar user-filter-bar">
          <input
            v-model="filterForm.keyword"
            type="search"
            placeholder="搜索用户名 / 显示名 / 邮箱"
            @keyup.enter="searchUsers"
          >
          <select v-model="filterForm.status" @change="searchUsers">
            <option value="">全部状态</option>
            <option value="1">启用</option>
            <option value="0">禁用</option>
          </select>
          <select v-model="filterForm.view" @change="searchUsers">
            <option value="">全部用户</option>
            <option value="today">今日登录</option>
            <option value="locked">锁定中</option>
            <option value="noDepartment">未挂部门</option>
          </select>
          <div class="admin-page-actions">
            <button class="button-primary" type="button" :disabled="loading" @click="searchUsers">查询</button>
            <button class="button-secondary" type="button" :disabled="loading" @click="resetFilters">重置</button>
          </div>
        </div>
        <div class="responsive-table">
          <table class="user-table">
            <colgroup>
              <col class="col-user">
              <col class="col-department">
              <col class="col-email">
              <col class="col-phone">
              <col class="col-source">
              <col class="col-status">
              <col class="col-login">
              <col class="col-created">
              <col class="col-ops">
            </colgroup>
            <thead>
              <tr>
                <th>用户</th>
                <th>部门</th>
                <th>邮箱</th>
                <th>手机号</th>
                <th>身份来源</th>
                <th>状态</th>
                <th>最近登录</th>
                <th>创建时间</th>
                <th class="table-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>
                  <button class="table-primary-action" type="button" @click="selectUser(user)">
                    <strong>{{ user.displayName || user.username }}</strong>
                    <span>{{ user.username }}</span>
                  </button>
                </td>
                <td class="cell-ellipsis" :title="user.departmentName || ''">{{ user.departmentName || '—' }}</td>
                <td class="cell-ellipsis" :title="user.email || ''">{{ user.email || '—' }}</td>
                <td>{{ user.phone || '—' }}</td>
                <td>{{ identitySourceLabel(user.identitySource) }}</td>
                <td>
                  <span v-if="isLocked(user)" class="status-badge danger">锁定至 {{ lockedUntilLabel(user) }}</span>
                  <span v-else class="status-badge" :class="user.status === 1 ? 'success' : 'neutral'">
                    {{ user.status === 1 ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="cell-time">{{ user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—' }}</td>
                <td class="cell-time">{{ formatDateTime(user.createdAt) }}</td>
                <td class="table-actions">
                  <button class="table-action" type="button" @click="selectUser(user)">详情</button>
                  <button v-if="isLocked(user)" class="table-action" type="button" @click="unlockUserAction(user)">解锁</button>
                  <button class="table-action" type="button" @click="toggleUser(user)">{{ user.status === 1 ? '禁用' : '启用' }}</button>
                  <button class="table-action danger" type="button" @click="askDeleteUser(user)">删除</button>
                </td>
              </tr>
              <tr v-if="!users.length && !loading">
                <td colspan="9"><div class="table-empty">暂无符合条件的用户。</div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination
          v-if="totalElements > 0"
          :current="currentPage"
          :total="totalElements"
          :page-size="pageSize"
          @update:current="changeUserPage"
          @update:page-size="changeUserPageSize"
        />
      </div>
    </section>

    <EntityDrawer
      :open="!!selectedUser"
      wide
      :title="selectedUser ? `用户详情：${selectedUser.username}` : '用户详情'"
      description="维护基础信息、密码、角色、外部身份与应用授权。"
      @close="selectedUser = null"
    >
      <div v-if="selectedUser" class="user-detail">
        <form class="drawer-form" @submit.prevent="submitUpdateUser">
          <label>
            <span>显示名</span>
            <input v-model="editForm.displayName" placeholder="显示名">
          </label>
          <label>
            <span>邮箱</span>
            <input v-model="editForm.email" placeholder="邮箱">
          </label>
          <label>
            <span>手机号</span>
            <input v-model="editForm.phone" placeholder="手机号">
          </label>
          <label>
            <span>部门</span>
            <select v-if="canReadDepartmentCatalog" v-model="editForm.departmentId">
              <option value="">未分配部门</option>
              <option v-for="department in departments" :key="department.id" :value="String(department.id)">
                {{ department.name }}（{{ department.code }}）              </option>
            </select>
            <span v-else class="assignment-empty">{{ selectedUser.departmentName || '未分配部门' }}（当前角色不能变更部门）</span>
          </label>
          <button type="submit">保存基础信息</button>
        </form>
        <form class="drawer-form" @submit.prevent="submitResetPassword">
          <label>
            <span>新密码</span>
            <input v-model="editForm.newPassword" type="password" placeholder="新密码">
          </label>
          <button type="submit">重置密码（同时解除锁定）</button>
        </form>
        <h3>已分配角色</h3>
        <div class="tag-list">
          <button v-for="role in selectedUserRoles" :key="role.id" type="button" @click="revokeRole(role.id)">
            {{ role.code }} ×
          </button>
          <span v-if="selectedUserRoles.length === 0">暂无角色</span>
        </div>
        <template v-if="canReadRoleCatalog">
          <h3>可分配角色</h3>
          <div class="tag-list">
            <button v-for="role in assignableRoles" :key="role.id" type="button" @click="assignRole(role.id)">
              + {{ role.code }}
            </button>
            <span v-if="assignableRoles.length === 0">无可分配角色</span>
          </div>
        </template>

        <h3>外部身份</h3>
        <div v-if="selectedUser.identitySource" class="external-identity-bound">
          <span>已绑定 {{ identitySourceLabel(selectedUser.identitySource) }}（{{ selectedUser.identitySource }}）</span>
          <button type="button" @click="unbindConfirmOpen = true">解绑</button>
        </div>
        <form v-else class="drawer-form" @submit.prevent="submitBindExternal">
          <label>
            <span>登录方式</span>
            <select v-model="bindForm.providerCode" required>
              <option value="" disabled>选择登录方式</option>
              <option v-for="provider in loginProviders" :key="provider.code" :value="provider.code">
                {{ provider.displayName || provider.code }}（{{ provider.code }}）              </option>
            </select>
          </label>
          <label>
            <span>外部唯一标识</span>
            <input v-model="bindForm.externalId" required placeholder="LDAP DN/uid。OIDC sub">
          </label>
          <button type="submit" :disabled="loginProviders.length === 0">绑定外部身份</button>
        </form>
        <p v-if="!selectedUser.identitySource && loginProviders.length === 0" class="assignment-empty">未装配外部登录方式</p>

        <template v-if="canReadTrustedApplicationCatalog">
          <h3>已授权应用</h3>
          <p v-if="selectedUserIsPlatformAdmin" class="assignment-empty platform-admin-note">
            该用户是平台管理员：拥有全部应用的准入与权限清单申报范围的全量权限（解析时特权合并，不体现为授权记录）。撤销单应用授权不会生效，降权请摘除 iam_admin 角色。
          </p>
          <div class="app-auth-list">
            <article v-for="authorization in activeAuthorizations" :key="authorization.applicationId">
              <div>
                <strong>{{ applicationLabel(authorization.applicationId) }}</strong>
                <span>准入 · 版本 v{{ authorization.authorizationVersion }}<template v-if="authorization.manifestVersion"> · 清单 {{ authorization.manifestVersion }}</template><template v-if="authorization.updatedAt"> · {{ formatDateTime(authorization.updatedAt) }}</template></span>
              </div>
              <div class="app-auth-actions">
                <button
                  v-if="trustedApplications.some(item => item.id === authorization.applicationId)"
                  type="button"
                  class="table-action"
                  @click="openGrantDrawer(trustedApplications.find(item => item.id === authorization.applicationId)!, authorization)"
                >
                  编辑授权
                </button>
                <button
                  v-if="trustedApplications.some(item => item.id === authorization.applicationId)"
                  type="button"
                  class="table-action danger"
                  :disabled="selectedUserIsPlatformAdmin"
                  :title="selectedUserIsPlatformAdmin ? '平台管理员特权不受单应用撤销影响，请摘除 iam_admin 角色' : undefined"
                  @click="askRevokeApplication(trustedApplications.find(item => item.id === authorization.applicationId)!)"
                >
                  撤销授权
                </button>
              </div>
            </article>
            <article v-for="authorization in revokedAuthorizations" :key="`revoked-${authorization.applicationId}`" class="revoked">
              <div>
                <strong>{{ applicationLabel(authorization.applicationId) }}</strong>
                <span>已撤销<template v-if="authorization.revokedAt"> · {{ formatDateTime(authorization.revokedAt) }}</template> · 可重新授权</span>
              </div>
              <button
                v-if="trustedApplications.some(item => item.id === authorization.applicationId)"
                type="button"
                class="table-action"
                @click="openGrantDrawer(trustedApplications.find(item => item.id === authorization.applicationId)!, null)"
              >
                重新授权
              </button>
            </article>
            <span v-if="selectedUserAuthorizations.length === 0" class="assignment-empty">暂无应用授权</span>
          </div>
          <h3>可授权应用</h3>
          <div class="app-auth-list available">
            <article v-for="application in grantableApplications" :key="application.id">
              <div>
                <strong>{{ application.applicationName }}（{{ application.applicationCode }}）</strong>
                <span>{{ application.description || '—' }}</span>
              </div>
              <button type="button" class="table-action" @click="openGrantDrawer(application, null)">+ 授权准入</button>
            </article>
            <span v-if="grantableApplications.length === 0" class="assignment-empty">没有可授权的应用</span>
          </div>
        </template>
      </div>
    </EntityDrawer>

    <EntityDrawer
      :open="createDrawerOpen"
      title="新建用户"
      description="创建本地账号：用户名与初始密码必填，可选挂载部门。"
      :pending="createPending"
      @close="closeCreateDrawer"
    >
      <form class="drawer-form" @submit.prevent="submitCreateUser">
        <label>
          <span>用户已启用</span>
          <input v-model="createForm.username" required placeholder="用户名">
        </label>
        <label>
          <span>初始密码</span>
          <input v-model="createForm.password" required type="password" autocomplete="new-password" placeholder="初始密码">
        </label>
        <label>
          <span>显示名</span>
          <input v-model="createForm.displayName" placeholder="显示名">
        </label>
        <label>
          <span>邮箱</span>
          <input v-model="createForm.email" placeholder="邮箱">
        </label>
        <label>
          <span>手机号</span>
          <input v-model="createForm.phone" placeholder="手机号">
        </label>
        <label>
          <span>所属部门</span>
          <select v-if="canReadDepartmentCatalog" v-model="createForm.departmentId">
            <option value="">未分配部门</option>
            <option v-for="department in departments" :key="department.id" :value="String(department.id)">
              {{ department.name }}（{{ department.code }}）            </option>
          </select>
          <span v-else class="assignment-empty">当前角色无组织目录访问权限，新建用户将不挂部门。</span>
        </label>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="createPending" @click="closeCreateDrawer">取消</button>
          <button class="button-primary" type="submit" :disabled="createPending">{{ createPending ? '正在创建…' : '创建用户' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <EntityDrawer
      :open="grantDrawerOpen"
      :title="`${grantEditingExisting ? '编辑' : '授权'}：${grantTargetApplication?.applicationName ?? ''}`"
      description="应用局部授权内容（全量替换）：编码从应用权限清单勾选；数据授权文档留空表示无数据授权。"
      :pending="grantPending"
      @close="grantDrawerOpen = false"
    >
      <p class="drawer-hint">此处为该用户的手工授权，角色规则变更会触发投影重算。</p>
      <p v-if="grantManifestError" class="assignment-empty" role="alert">
        加载权限清单失败：{{ grantManifestError }}。请先在「可信应用管理」中为该应用登记权限清单，再进行授权。
      </p>
      <form v-else class="drawer-form" @submit.prevent="submitGrant">
        <div class="picker-group">
          <p class="picker-group-title">应用角色编码（已勾选 {{ grantSelectedRoles.size }}/{{ grantManifest?.roles.length ?? 0 }}）</p>
          <div v-if="grantManifest?.roles.length" class="picker-options">
            <label v-for="code in grantManifest.roles" :key="code">
              <input
                type="checkbox"
                :checked="grantSelectedRoles.has(code)"
                :disabled="grantDetailPending"
                @change="toggleGrantCode('roles', code)"
              >
              <span>{{ code }}</span>
            </label>
          </div>
          <p v-else class="picker-empty">清单未申报角色编码</p>
        </div>
        <div class="picker-group">
          <p class="picker-group-title">页面权限编码（已勾选 {{ grantSelectedPagePermissions.size }}/{{ grantManifest?.pagePermissions.length ?? 0 }}）</p>
          <div v-if="grantManifest?.pagePermissions.length" class="picker-options">
            <label v-for="code in grantManifest.pagePermissions" :key="code">
              <input
                type="checkbox"
                :checked="grantSelectedPagePermissions.has(code)"
                :disabled="grantDetailPending"
                @change="toggleGrantCode('pagePermissions', code)"
              >
              <span>{{ code }}</span>
            </label>
          </div>
          <p v-else class="picker-empty">清单未申报页面权限编码</p>
        </div>
        <div class="picker-group">
          <p class="picker-group-title">API 权限编码（已勾选 {{ grantSelectedApiPermissions.size }}/{{ grantManifest?.apiPermissions.length ?? 0 }}）</p>
          <div v-if="grantManifest?.apiPermissions.length" class="picker-options">
            <label v-for="code in grantManifest.apiPermissions" :key="code">
              <input
                type="checkbox"
                :checked="grantSelectedApiPermissions.has(code)"
                :disabled="grantDetailPending"
                @change="toggleGrantCode('apiPermissions', code)"
              >
              <span>{{ code }}</span>
            </label>
          </div>
          <p v-else class="picker-empty">清单未申报 API 权限编码</p>
        </div>
        <div class="grant-document-readonly">
          <span class="picker-group-title">数据授权（由角色规则生成并集投影，角色变更后会被重算覆盖，此处仅展示）</span>
          <template v-if="grantDataGrantDocument?.grants.length">
            <div v-for="(grant, index) in grantDataGrantDocument.grants" :key="index" class="grant-document-row">
              <strong>{{ grant.resource }}</strong>
              <span>{{ grant.actions.length ? grant.actions.join(' / ') : '无动作' }}</span>
              <span v-if="grant.all">全量数据</span>
              <span v-else-if="grant.constraints.length">
                {{ grant.constraints.map(constraint => `${constraint.dimension} IN (${constraint.values.join(', ')})`).join(' 且 ') }}
              </span>
              <span v-else>无约束</span>
            </div>
          </template>
          <p v-else class="picker-empty">当前无数据授权</p>
        </div>
        <button type="submit" :disabled="grantPending || grantDetailPending || !grantManifest">保存授权</button>
      </form>
    </EntityDrawer>

    <ConfirmDialog
      :open="revokeApplicationTarget !== null"
      :title="'撤销应用授权'"
      :description="`撤销后 ${revokeApplicationTarget?.applicationName ?? ''} 将立即拒绝该用户的令牌验证，重新授权需从空清单开始。确定撤销？`"
      confirm-label="确认撤销"
      :pending="revokeApplicationPending"
      @close="revokeApplicationTarget = null"
      @confirm="confirmRevokeApplication"
    />

    <ConfirmDialog
      :open="unbindConfirmOpen"
      :title="'解绑外部身份'"
      :description="`解绑后 ${selectedUser?.username ?? ''} 将回退为本地密码登录。确定解绑？`"
      confirm-label="确认解绑"
      :pending="unbindPending"
      @close="unbindConfirmOpen = false"
      @confirm="confirmUnbindExternal"
    />

    <ConfirmDialog
      :open="deleteUserTarget !== null"
      title="删除用户"
      :description="`将永久删除用户 ${deleteUserTarget?.username ?? ''}：会话、角色、协作组与应用授权一并清除，删除后不可恢复；需要留案底请改用禁用。确定删除？`"
      confirm-label="确认删除"
      :pending="deleteUserPending"
      @close="!deleteUserPending && (deleteUserTarget = null)"
      @confirm="confirmDeleteUser"
    />
  </section>
</template>
