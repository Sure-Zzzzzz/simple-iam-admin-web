<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  createResourceVerificationClient,
  createTrustedApplication,
  createTrustedApplicationClient,
  deleteTrustedApplication,
  deleteTrustedApplicationClient,
  fetchApplicationPermissionManifest,
  fetchResourceVerificationClients,
  fetchTrustedApplication,
  fetchTrustedApplications,
  putApplicationPermissionManifest,
  revokeResourceVerificationClient,
  rotateResourceVerificationClientSecret,
  updateTrustedApplication,
  updateTrustedApplicationClient,
  type ApplicationPermissionManifest,
  type DataResourceDeclaration,
  type TrustedApplication,
  type TrustedApplicationClient,
  type TrustedApplicationDetail,
  type TrustedApplicationResourceVerificationClient
} from '../api/iamAuth';
import { TRUSTED_APPLICATION_ICONS, trustedApplicationIcon } from '../trustedApplicationIcons';

const trustedApplications = ref<TrustedApplication[]>([]);
const errorMessage = ref('');
const message = ref('');
const query = ref('');
const currentPage = ref(1);
const totalApplications = ref(0);
const totalPages = ref(1);
const loading = ref(false);
const submitting = ref(false);
const deleting = ref(false);
const pageSize = ref(10);

const createDrawerOpen = ref(false);
const detailDrawerOpen = ref(false);
const addClientDrawerOpen = ref(false);
const editClientDrawerOpen = ref(false);
const detail = ref<TrustedApplicationDetail | null>(null);
const createdSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const createdAppSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const deleteAppTarget = ref<TrustedApplicationDetail | null>(null);
const deleteClientTarget = ref<TrustedApplicationClient | null>(null);

const resourceClients = ref<TrustedApplicationResourceVerificationClient[]>([]);
const resourceClientDrawerOpen = ref(false);
const resourceClientForm = reactive({ clientId: '' });
const resourceSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const rotateResourceTarget = ref<TrustedApplicationResourceVerificationClient | null>(null);
const rotateSecretResult = ref<{ clientId: string; clientSecret: string } | null>(null);
const revokeResourceTarget = ref<TrustedApplicationResourceVerificationClient | null>(null);

const manifestCurrent = ref<ApplicationPermissionManifest | null>(null);
const manifestForm = reactive({ roles: '', pagePermissions: '', apiPermissions: '' });
const manifestResourceText = ref('');
const manifestSubmitting = ref(false);

const createForm = reactive({
  applicationCode: '',
  applicationName: '',
  description: '',
  icon: 'default',
  clientId: '',
  clientName: '',
  clientType: 'CONFIDENTIAL',
  requireConsent: true,
  redirectUris: '',
  scopes: '',
  roles: '',
  pagePermissions: '',
  apiPermissions: ''
});

const editForm = reactive({
  applicationName: '',
  description: '',
  icon: 'default',
  portalEnabled: false,
  portalEntry: '',
  portalApiBase: ''
});

interface MenuDraft {
  code: string;
  name: string;
  route: string;
  sortOrder: number;
}

const menuDraft = ref<MenuDraft[]>([]);

function addMenuRow() {
  menuDraft.value.push({ code: '', name: '', route: '', sortOrder: menuDraft.value.length + 1 });
}

function removeMenuRow(index: number) {
  menuDraft.value.splice(index, 1);
}

const clientForm = reactive({
  clientId: '',
  clientName: '',
  clientType: 'CONFIDENTIAL',
  requireConsent: true,
  redirectUris: '',
  scopes: ''
});

const editClientForm = reactive({
  clientId: '',
  clientName: '',
  requireConsent: true,
  redirectUris: '',
  scopes: ''
});

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function splitTokens(value: string): string[] {
  return value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
}

function resetCreateForm() {
  Object.assign(createForm, {
    applicationCode: '', applicationName: '', description: '', icon: 'default',
    clientId: '', clientName: '', clientType: 'CONFIDENTIAL',
    requireConsent: true, redirectUris: '', scopes: ''
  });
}

function resetClientForm() {
  Object.assign(clientForm, {
    clientId: '', clientName: '', clientType: 'CONFIDENTIAL',
    requireConsent: true, redirectUris: '', scopes: ''
  });
}

async function loadTrustedApplications() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchTrustedApplications({ page: currentPage.value, size: pageSize.value, keyword: query.value });
    trustedApplications.value = result.content;
    totalApplications.value = result.totalElements;
    totalPages.value = Math.max(result.totalPages, 1);
    currentPage.value = result.page;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载可信应用失败';
  } finally {
    loading.value = false;
  }
}

async function searchTrustedApplications() {
  currentPage.value = 1;
  await loadTrustedApplications();
}

async function changePage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return;
  }
  currentPage.value = page;
  await loadTrustedApplications();
}

async function changePageSize(size: number) {
  if (size < 1 || size === pageSize.value) {
    return;
  }
  pageSize.value = size;
  currentPage.value = 1;
  await loadTrustedApplications();
}

async function submitCreate() {
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const roles = splitLines(createForm.roles);
    const pagePermissions = splitLines(createForm.pagePermissions);
    const apiPermissions = splitLines(createForm.apiPermissions);
    const { application, initialClientSecret } = await createTrustedApplication({
      applicationCode: createForm.applicationCode,
      applicationName: createForm.applicationName,
      description: createForm.description,
      icon: createForm.icon,
      initialClient: {
        clientId: createForm.clientId,
        clientName: createForm.clientName,
        clientType: createForm.clientType as 'PUBLIC' | 'CONFIDENTIAL',
        requireConsent: createForm.requireConsent,
        redirectUris: splitLines(createForm.redirectUris),
        scopes: splitTokens(createForm.scopes),
        grantTypes: ['authorization_code', 'refresh_token'],
        authenticationMethods: createForm.clientType === 'CONFIDENTIAL' ? ['client_secret_basic'] : ['none']
      },
      ...(roles.length || pagePermissions.length || apiPermissions.length ? { roles, pagePermissions, apiPermissions } : {})
    });
    const initialClientId = createForm.clientId;
    resetCreateForm();
    if (initialClientSecret) {
      createdAppSecret.value = { clientId: initialClientId, clientSecret: initialClientSecret };
      message.value = `可信应用已创建：${application.applicationCode}，初始客户端密钥见抽屉内提示`;
    } else {
      createDrawerOpen.value = false;
      message.value = `可信应用已创建：${application.applicationCode}`;
    }
    await loadTrustedApplications();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建可信应用失败';
  } finally {
    submitting.value = false;
  }
}

async function openDetail(application: TrustedApplication) {
  errorMessage.value = '';
  rotateSecretResult.value = null;
  try {
    detail.value = await fetchTrustedApplication(application.id);
    syncEditStateFromDetail();
    detailDrawerOpen.value = true;
    await Promise.all([loadResourceClients(application.id), loadManifest(application.id)]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载应用详情失败';
  }
}

async function loadManifest(applicationId: number) {
  manifestCurrent.value = await fetchApplicationPermissionManifest(applicationId);
  const manifest = manifestCurrent.value;
  Object.assign(manifestForm, {
    roles: manifest ? manifest.roles.join('\n') : '',
    pagePermissions: manifest ? manifest.pagePermissions.join('\n') : '',
    apiPermissions: manifest ? manifest.apiPermissions.join('\n') : ''
  });
  manifestResourceText.value = (manifest ? manifest.dataResources : [])
    .map(item => [item.resource, item.actions.join(', '), item.dimensions.join(', ')].join(' | '))
    .join('\n');
}

// 每行格式“资源标识 | 动作,动作 | 维度,维度”：段数不是 3 即整行非法，
// 报行号阻断提交，不做静默丢弃
function parseResourceLines(value: string): { resources: DataResourceDeclaration[]; error: string | null } {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const resources: DataResourceDeclaration[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parts = lines[index].split('|').map(part => part.trim());
    if (parts.length !== 3 || !parts[0]) {
      return { resources: [], error: `DATA 资源第 ${index + 1} 行格式应为“资源标识 | 动作,动作 | 维度,维度”` };
    }
    resources.push({ resource: parts[0], actions: splitTokens(parts[1]), dimensions: splitTokens(parts[2]) });
  }
  return { resources, error: null };
}

async function submitManifest() {
  if (!detail.value) return;
  manifestSubmitting.value = true;
  message.value = '';
  errorMessage.value = '';
  const parsed = parseResourceLines(manifestResourceText.value);
  if (parsed.error) {
    errorMessage.value = parsed.error;
    manifestSubmitting.value = false;
    return;
  }
  try {
    const saved = await putApplicationPermissionManifest(detail.value.id, {
      roles: splitLines(manifestForm.roles),
      pagePermissions: splitLines(manifestForm.pagePermissions),
      apiPermissions: splitLines(manifestForm.apiPermissions),
      dataResources: parsed.resources
    });
    manifestCurrent.value = saved;
    message.value = `权限清单已保存（当前版本 v${saved.manifestVersion}）`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存权限清单失败';
  } finally {
    manifestSubmitting.value = false;
  }
}

function syncEditStateFromDetail() {
  if (!detail.value) return;
  Object.assign(editForm, {
    applicationName: detail.value.applicationName,
    description: detail.value.description || '',
    icon: detail.value.icon || 'default',
    portalEnabled: detail.value.portal?.enabled || false,
    portalEntry: detail.value.portal?.entry || '',
    portalApiBase: detail.value.portal?.apiBase || ''
  });
  menuDraft.value = (detail.value.portal?.menus || []).map(menu => ({
    code: menu.code,
    name: menu.name,
    route: menu.route,
    sortOrder: menu.sortOrder
  }));
}

async function loadResourceClients(applicationId: number) {
  try {
    resourceClients.value = await fetchResourceVerificationClients(applicationId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载资源校验客户端失败';
  }
}

function openResourceClientDrawer() {
  resourceClientForm.clientId = '';
  resourceSecret.value = null;
  resourceClientDrawerOpen.value = true;
}

async function submitResourceClient() {
  if (!detail.value) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const secret = await createResourceVerificationClient(detail.value.id, { clientId: resourceClientForm.clientId });
    resourceSecret.value = { clientId: secret.clientId, clientSecret: secret.clientSecret };
    resourceClientForm.clientId = '';
    await loadResourceClients(detail.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    submitting.value = false;
  }
}

async function confirmRotateResourceSecret() {
  if (!detail.value || !rotateResourceTarget.value) return;
  deleting.value = true;
  errorMessage.value = '';
  try {
    const secret = await rotateResourceVerificationClientSecret(detail.value.id, rotateResourceTarget.value.clientId);
    rotateSecretResult.value = { clientId: secret.clientId, clientSecret: secret.clientSecret };
    rotateResourceTarget.value = null;
    message.value = '资源校验客户端密钥已轮换，旧密钥立即失效';
    await loadResourceClients(detail.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '轮换密钥失败';
  } finally {
    deleting.value = false;
  }
}

async function confirmRevokeResourceClient() {
  if (!detail.value || !revokeResourceTarget.value) return;
  deleting.value = true;
  errorMessage.value = '';
  try {
    await revokeResourceVerificationClient(detail.value.id, revokeResourceTarget.value.clientId);
    revokeResourceTarget.value = null;
    message.value = '资源校验客户端已撤销';
    await loadResourceClients(detail.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    deleting.value = false;
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function submitUpdateApplication() {
  if (!detail.value) return;
  const filledMenus = menuDraft.value.filter(menu => menu.code.trim() || menu.name.trim() || menu.route.trim());
  if (filledMenus.some(menu => !menu.code.trim() || !menu.name.trim() || !menu.route.trim())) {
    errorMessage.value = '门户菜单每一行都需填写编码、名称和路由';
    return;
  }
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await updateTrustedApplication(detail.value.id, {
      applicationName: editForm.applicationName,
      description: editForm.description,
      icon: editForm.icon,
      portal: {
        enabled: editForm.portalEnabled,
        ...(editForm.portalEntry ? { entry: editForm.portalEntry } : {}),
        ...(editForm.portalApiBase ? { apiBase: editForm.portalApiBase } : {}),
        menus: filledMenus.map(menu => ({
          code: menu.code.trim(),
          name: menu.name.trim(),
          route: menu.route.trim(),
          sortOrder: menu.sortOrder
        }))
      }
    });
    message.value = '应用资料已更新';
    detail.value = await fetchTrustedApplication(detail.value.id);
    syncEditStateFromDetail();
    await loadTrustedApplications();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新应用失败';
  } finally {
    submitting.value = false;
  }
}

function openCreateDrawer() {
  resetCreateForm();
  createdAppSecret.value = null;
  createDrawerOpen.value = true;
}

function openAddClient() {
  resetClientForm();
  createdSecret.value = null;
  addClientDrawerOpen.value = true;
}

async function submitAddClient() {
  if (!detail.value) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const secret = await createTrustedApplicationClient(detail.value.id, {
      clientId: clientForm.clientId,
      clientName: clientForm.clientName,
      clientType: clientForm.clientType as 'PUBLIC' | 'CONFIDENTIAL',
      requireConsent: clientForm.requireConsent,
      redirectUris: splitLines(clientForm.redirectUris),
      scopes: splitTokens(clientForm.scopes),
      grantTypes: ['authorization_code', 'refresh_token'],
      authenticationMethods: clientForm.clientType === 'CONFIDENTIAL' ? ['client_secret_basic'] : ['none']
    });
    if (secret.clientSecret) {
      createdSecret.value = { clientId: secret.clientId, clientSecret: secret.clientSecret };
    }
    resetClientForm();
    detail.value = await fetchTrustedApplication(detail.value.id);
    await loadTrustedApplications();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    submitting.value = false;
  }
}

function openEditClient(client: TrustedApplicationClient) {
  Object.assign(editClientForm, {
    clientId: client.clientId,
    clientName: client.clientName,
    requireConsent: client.requireConsent,
    redirectUris: client.redirectUris.join('\n'),
    scopes: client.scopes.join(' ')
  });
  editClientDrawerOpen.value = true;
}

async function submitEditClient() {
  if (!detail.value) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await updateTrustedApplicationClient(detail.value.id, editClientForm.clientId, {
      clientName: editClientForm.clientName,
      requireConsent: editClientForm.requireConsent,
      redirectUris: splitLines(editClientForm.redirectUris),
      scopes: splitTokens(editClientForm.scopes)
    });
    editClientDrawerOpen.value = false;
    message.value = '客户端配置已更新';
    detail.value = await fetchTrustedApplication(detail.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    submitting.value = false;
  }
}

async function confirmDeleteApplication() {
  if (!deleteAppTarget.value) return;
  deleting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteTrustedApplication(deleteAppTarget.value.id);
    deleteAppTarget.value = null;
    detailDrawerOpen.value = false;
    detail.value = null;
    message.value = '可信应用已删除';
    await loadTrustedApplications();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除可信应用失败';
  } finally {
    deleting.value = false;
  }
}

async function confirmDeleteClient() {
  if (!detail.value || !deleteClientTarget.value) return;
  deleting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteTrustedApplicationClient(detail.value.id, deleteClientTarget.value.clientId);
    deleteClientTarget.value = null;
    message.value = '客户端已删除';
    detail.value = await fetchTrustedApplication(detail.value.id);
    await loadTrustedApplications();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    deleting.value = false;
  }
}

onMounted(loadTrustedApplications);
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="可信应用"
      description="登记接入 IAM 的业务应用，维护门户集成与 OAuth2 客户端凭证。"
      primary-label="新建可信应用"
      @primary="openCreateDrawer"
    />

    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="admin-message error" role="alert">{{ errorMessage }}</p>

    <section class="admin-data-surface" aria-label="可信应用列表" :aria-busy="loading">
      <header class="data-toolbar">
        <div>
          <h2>全部可信应用 <span>{{ totalApplications }}</span></h2>
          <p>应用编码创建后不可修改；门户集成与客户端凭证在应用详情中维护。</p>
        </div>
        <label class="search-field">
          <span class="sr-only">搜索可信应用</span>
          <input v-model="query" type="search" placeholder="搜索编码、名称或描述" @keyup.enter="searchTrustedApplications">
        </label>
      </header>
      <div class="responsive-table">
        <table>
          <thead><tr><th>应用</th><th>图标</th><th>统一应用门户</th><th>客户端</th><th class="table-actions">操作</th></tr></thead>
          <tbody>
            <tr v-for="application in trustedApplications" :key="application.id" :class="{ selected: detail?.id === application.id }">
              <td>
                <button class="table-primary-action" type="button" @click="openDetail(application)">
                  <strong>{{ application.applicationName }}</strong>
                  <span>{{ application.applicationCode }}</span>
                </button>
              </td>
              <td><span class="trusted-app-icon" :aria-label="trustedApplicationIcon(application.icon).label" role="img"><component :is="trustedApplicationIcon(application.icon).component" :size="16" :stroke-width="2" aria-hidden="true" /></span></td>
              <td><span class="status-badge" :class="application.portalEnabled ? 'success' : 'neutral'">{{ application.portalEnabled ? '门户可见' : '门户已隐藏' }}</span></td>
              <td>{{ application.clientCount }} 个</td>
              <td class="table-actions">
                <button class="table-action" type="button" @click="openDetail(application)">管理</button>
              </td>
            </tr>
            <tr v-if="!loading && trustedApplications.length === 0"><td colspan="5"><div class="table-empty">{{ query ? '没有找到匹配的可信应用。' : '暂无可信应用，点击右上角新建。' }}</div></td></tr>
          </tbody>
        </table>
      </div>
      <Pagination
        v-if="totalApplications > 0"
        :current="currentPage"
        :total="totalApplications"
        :page-size="pageSize"
        @update:current="changePage"
        @update:page-size="changePageSize"
      />
    </section>

    <EntityDrawer
      :open="createDrawerOpen"
      :pending="submitting"
      title="新建可信应用"
      description="登记应用并创建首个 OAuth2 客户端；应用编码与客户端 ID 创建后不可修改，机密客户端密钥由服务端生成并仅展示一次。"
      @close="!submitting && (createDrawerOpen = false)"
    >
      <form class="drawer-form" @submit.prevent="submitCreate">
        <h3 class="drawer-section-title">基本资料</h3>
        <label><span>应用编码</span><input v-model="createForm.applicationCode" required placeholder="如 demo"></label>
        <label><span>应用名称</span><input v-model="createForm.applicationName" required placeholder="应用名称"></label>
        <label><span>应用说明</span><textarea v-model="createForm.description" placeholder="说明应用用途"></textarea></label>
        <label><span>应用图标</span>
          <select v-model="createForm.icon" required aria-label="应用图标">
            <option v-for="icon in TRUSTED_APPLICATION_ICONS" :key="icon.code" :value="icon.code">{{ icon.label }}</option>
          </select>
        </label>

        <h3 class="drawer-section-title">初始 OAuth2 客户端</h3>
        <label><span>客户端 ID</span><input v-model="createForm.clientId" required placeholder="OAuth2 client_id"></label>
        <label><span>客户端名称</span><input v-model="createForm.clientName" required placeholder="客户端名称"></label>
        <label><span>客户端类型</span>
          <select v-model="createForm.clientType" required aria-label="客户端类型">
            <option value="CONFIDENTIAL">机密客户端（服务端应用，持密钥）</option>
            <option value="PUBLIC">公共客户端（浏览器/原生应用）</option>
          </select>
        </label>
        <label><span>回调地址（每行一个）</span><textarea v-model="createForm.redirectUris" required placeholder="https://app.example.com/login/oauth2/code/iam"></textarea></label>
        <label><span>授权范围（空格分隔）</span><input v-model="createForm.scopes" required placeholder="openid profile message.read"></label>

        <h3 class="drawer-section-title">权限清单（可选，创建后仍可修改）</h3>
        <p class="drawer-hint">应用向 IAM 申报的权限码全集，每行一个编码。用户授权时只能从清单中勾选，授权接口会校验子集合法性。</p>
        <label><span>应用角色编码（每行一个）</span><textarea v-model="createForm.roles" rows="3" placeholder="app-admin&#10;app-user"></textarea></label>
        <label><span>页面权限编码（每行一个）</span><textarea v-model="createForm.pagePermissions" rows="3" placeholder="app:order:page&#10;app:report:page"></textarea></label>
        <label><span>API 权限编码（每行一个）</span><textarea v-model="createForm.apiPermissions" rows="3" placeholder="app:order:api&#10;app:report:api"></textarea></label>

        <div v-if="createdAppSecret" class="secret-reveal" role="status">
          <p>初始客户端 {{ createdAppSecret.clientId }} 的密钥（仅此一次）</p>
          <code>{{ createdAppSecret.clientSecret }}</code>
        </div>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="submitting" @click="createDrawerOpen = false">关闭</button>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建应用' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <EntityDrawer
      :open="detailDrawerOpen && Boolean(detail)"
      :pending="submitting"
      wide
      :title="detail ? detail.applicationName : '应用详情'"
      :description="detail ? `${detail.applicationCode} · ${detail.clients.length} 个客户端` : ''"
      @close="!submitting && (detailDrawerOpen = false)"
    >
      <template v-if="detail">
        <form class="drawer-form" @submit.prevent="submitUpdateApplication">
          <h3 class="drawer-section-title">基本资料</h3>
          <label><span>应用名称</span><input v-model="editForm.applicationName" required placeholder="应用名称"></label>
          <label><span>应用说明</span><textarea v-model="editForm.description" placeholder="说明应用用途"></textarea></label>
          <label><span>应用图标</span>
            <select v-model="editForm.icon" required aria-label="应用图标">
              <option v-for="icon in TRUSTED_APPLICATION_ICONS" :key="icon.code" :value="icon.code">{{ icon.label }}</option>
            </select>
          </label>

          <h3 class="drawer-section-title">门户集成</h3>
          <label class="checkbox-field"><input v-model="editForm.portalEnabled" type="checkbox"><span>在统一应用门户中可见</span></label>
          <label><span>子应用入口地址</span><input v-model="editForm.portalEntry" placeholder="如 /app/iam/ 或完整 URL" :disabled="!editForm.portalEnabled"></label>
          <label><span>API 基础路径</span><input v-model="editForm.portalApiBase" placeholder="如 /iam/" :disabled="!editForm.portalEnabled"></label>
          <p v-if="detail.portal?.routePrefix" class="drawer-hint">门户路由前缀：{{ detail.portal.routePrefix }}（由应用编码决定，不可修改）</p>
          <div class="menu-editor" :aria-label="`门户菜单（${menuDraft.length} 项）`">
            <div v-for="(menu, index) in menuDraft" :key="index" class="menu-editor-row">
              <label><span>菜单编码</span><input v-model="menu.code" :disabled="!editForm.portalEnabled" placeholder="如 workspace" required></label>
              <label><span>菜单名称</span><input v-model="menu.name" :disabled="!editForm.portalEnabled" placeholder="如 工作台" required></label>
              <label><span>路由（相对路径）</span><input v-model="menu.route" :disabled="!editForm.portalEnabled" placeholder="如 /organizations" required></label>
              <label><span>排序</span><input v-model.number="menu.sortOrder" :disabled="!editForm.portalEnabled" type="number" min="1" step="1"></label>
              <div class="menu-row-actions">
                <button class="table-action danger" type="button" :disabled="!editForm.portalEnabled" @click="removeMenuRow(index)">移除菜单</button>
              </div>
            </div>
            <button class="button-secondary" type="button" :disabled="!editForm.portalEnabled" @click="addMenuRow">添加菜单</button>
            <p class="drawer-hint">菜单路由为相对路径，门户渲染时拼接路由前缀；保存按整表覆盖，移除行即删除菜单。</p>
          </div>
          <footer class="drawer-actions">
            <button class="button-secondary" type="button" :disabled="submitting" @click="detailDrawerOpen = false">关闭</button>
            <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存应用资料' }}</button>
          </footer>
        </form>

        <section class="assignment-section">
          <header>
            <div>
              <h3>权限清单</h3>
              <p>应用向 IAM 申报的权限码全集，每行一个编码、保存整表覆盖；用户授权时只能从清单中勾选。</p>
            </div>
          </header>
          <dl v-if="manifestCurrent" class="manifest-stats">
            <div><dt>清单版本</dt><dd>v{{ manifestCurrent.manifestVersion }}</dd></div>
            <div><dt>角色</dt><dd>{{ manifestCurrent.roles.length }}</dd></div>
            <div><dt>页面权限</dt><dd>{{ manifestCurrent.pagePermissions.length }}</dd></div>
            <div><dt>API 权限</dt><dd>{{ manifestCurrent.apiPermissions.length }}</dd></div>
            <div><dt>DATA 资源</dt><dd>{{ manifestCurrent.dataResources.length }}</dd></div>
            <div v-if="manifestCurrent.updatedAt"><dt>最近更新</dt><dd class="manifest-stats-time">{{ formatDateTime(manifestCurrent.updatedAt) }}</dd></div>
          </dl>
          <p v-else class="assignment-empty">尚未登记权限清单：登记后才能在用户管理中为该应用授权。</p>
          <form class="drawer-form" @submit.prevent="submitManifest">
            <label><span>应用角色编码（每行一个）</span><textarea v-model="manifestForm.roles" rows="4" placeholder="app-admin"></textarea></label>
            <label><span>页面权限编码（每行一个）</span><textarea v-model="manifestForm.pagePermissions" rows="4" placeholder="app:order:page"></textarea></label>
            <label><span>API 权限编码（每行一个）</span><textarea v-model="manifestForm.apiPermissions" rows="4" placeholder="app:order:api"></textarea></label>
            <label><span>DATA 资源申报（每行一个：资源标识 | 动作,动作 | 维度,维度）</span><textarea v-model="manifestResourceText" rows="3" placeholder="demo:order | read, write | departmentId"></textarea></label>
            <button class="button-secondary" type="submit" :disabled="manifestSubmitting">
              {{ manifestSubmitting ? '正在保存…' : '保存权限清单' }}
            </button>
          </form>
        </section>

        <section class="assignment-section">
          <header>
            <div>
              <h3>OAuth2 客户端 <span>{{ detail.clients.length }}</span></h3>
              <p>客户端凭证用于应用接入 IAM 登录；机密客户端的密钥仅在创建时展示一次。</p>
            </div>
          </header>
          <div v-if="detail.clients.length" class="assignment-list">
            <article v-for="client in detail.clients" :key="client.id">
              <div>
                <strong>{{ client.clientName }}</strong>
                <span>{{ client.clientId }} · {{ client.clientType === 'CONFIDENTIAL' ? '机密' : '公共' }} · {{ client.redirectUris.length }} 个回调</span>
              </div>
              <div class="app-auth-actions">
                <button class="table-action" type="button" @click="openEditClient(client)">编辑</button>
                <button class="table-action danger" type="button" @click="deleteClientTarget = client">删除</button>
              </div>
            </article>
          </div>
          <p v-else class="assignment-empty">尚未创建客户端，应用无法发起登录。</p>
          <button class="button-secondary" type="button" @click="openAddClient">添加客户端</button>
        </section>

        <section class="assignment-section">
          <header>
            <div>
              <h3>资源校验客户端 <span>{{ resourceClients.filter(item => item.status === 1).length }}</span></h3>
              <p>资源服务调用 IAM 令牌校验接口的准入凭据（服务端对服务端），密钥仅在创建和轮换时展示一次，撤销保留记录供审计。</p>
            </div>
          </header>
          <div v-if="rotateSecretResult" class="secret-reveal" role="status">
            <p>客户端 {{ rotateSecretResult.clientId }} 的新密钥（仅此一次）：</p>
            <code>{{ rotateSecretResult.clientSecret }}</code>
          </div>
          <div v-if="resourceClients.length" class="assignment-list">
            <article v-for="resourceClient in resourceClients" :key="resourceClient.clientId">
              <div>
                <strong>{{ resourceClient.clientId }}</strong>
                <span>
                  {{ resourceClient.status === 1 ? '生效中' : '已撤销' }}
                  · 创建于 {{ formatDateTime(resourceClient.createdAt) }}
                </span>
              </div>
              <div v-if="resourceClient.status === 1" class="app-auth-actions">
                <button class="table-action" type="button" @click="rotateResourceTarget = resourceClient">轮换密钥</button>
                <button class="table-action danger" type="button" @click="revokeResourceTarget = resourceClient">撤销</button>
              </div>
            </article>
          </div>
          <p v-else class="assignment-empty">尚未创建资源校验客户端，应用的服务端无法调用 IAM 令牌校验接口。</p>
          <button class="button-secondary" type="button" @click="openResourceClientDrawer">新建资源校验客户端</button>
        </section>

        <section v-if="!detail.builtIn" class="assignment-section">
          <header>
            <div>
              <h3>危险操作</h3>
              <p>删除应用会同时移除其门户集成、客户端登记和用户授权关系。</p>
            </div>
          </header>
          <button class="table-action danger" type="button" @click="deleteAppTarget = detail">删除可信应用</button>
        </section>
        <section v-else class="assignment-section">
          <header>
            <div>
              <h3>内置应用</h3>
              <p>平台引导注册的内置应用不支持删除；如需下线请关闭其门户集成。</p>
            </div>
          </header>
        </section>
      </template>
    </EntityDrawer>

    <EntityDrawer
      :open="addClientDrawerOpen"
      :pending="submitting"
      title="添加 OAuth2 客户端"
      description="机密客户端的密钥仅在创建成功后展示一次，请立即保存。"
      @close="!submitting && (addClientDrawerOpen = false)"
    >
      <form class="drawer-form" @submit.prevent="submitAddClient">
        <label><span>客户端 ID</span><input v-model="clientForm.clientId" required placeholder="OAuth2 client_id"></label>
        <label><span>客户端名称</span><input v-model="clientForm.clientName" required placeholder="客户端名称"></label>
        <label><span>客户端类型</span>
          <select v-model="clientForm.clientType" required aria-label="客户端类型">
            <option value="CONFIDENTIAL">机密客户端（服务端应用，持密钥）</option>
            <option value="PUBLIC">公共客户端（浏览器/原生应用）</option>
          </select>
        </label>
        <label><span>回调地址（每行一个）</span><textarea v-model="clientForm.redirectUris" required placeholder="https://app.example.com/login/oauth2/code/iam"></textarea></label>
        <label><span>授权范围（空格分隔）</span><input v-model="clientForm.scopes" required placeholder="openid profile message.read"></label>
        <div v-if="createdSecret" class="secret-reveal" role="status">
          <p>客户端 {{ createdSecret.clientId }} 的密钥（仅此一次）</p>
          <code>{{ createdSecret.clientSecret }}</code>
        </div>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="submitting" @click="addClientDrawerOpen = false">关闭</button>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建客户端' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <EntityDrawer
      :open="editClientDrawerOpen"
      :pending="submitting"
      title="编辑客户端"
      :description="editClientForm.clientId"
      @close="!submitting && (editClientDrawerOpen = false)"
    >
      <form class="drawer-form" @submit.prevent="submitEditClient">
        <label><span>客户端名称</span><input v-model="editClientForm.clientName" required placeholder="客户端名称"></label>
        <label class="checkbox-field"><input v-model="editClientForm.requireConsent" type="checkbox"><span>授权时需要用户确认</span></label>
        <label><span>回调地址（每行一个）</span><textarea v-model="editClientForm.redirectUris" required placeholder="https://app.example.com/login/oauth2/code/iam"></textarea></label>
        <label><span>授权范围（空格分隔）</span><input v-model="editClientForm.scopes" required placeholder="openid profile message.read"></label>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="submitting" @click="editClientDrawerOpen = false">取消</button>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存客户端' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <EntityDrawer
      :open="resourceClientDrawerOpen"
      :pending="submitting"
      title="新建资源校验客户端"
      description="为应用的服务端签发调用 IAM 令牌校验接口的准入凭据；密钥仅在创建成功后展示一次，请立即配置到资源服务。"
      @close="!submitting && (resourceClientDrawerOpen = false)"
    >
      <form class="drawer-form" @submit.prevent="submitResourceClient">
        <label><span>客户端 ID</span><input v-model="resourceClientForm.clientId" required placeholder="如?demo-resource"></label>
        <div v-if="resourceSecret" class="secret-reveal" role="status">
          <p>客户端 {{ resourceSecret.clientId }} 的密钥（仅此一次）</p>
          <code>{{ resourceSecret.clientSecret }}</code>
        </div>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="submitting" @click="resourceClientDrawerOpen = false">关闭</button>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建资源校验客户端' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <ConfirmDialog
      :open="Boolean(rotateResourceTarget)"
      title="轮换资源校验客户端密钥"
      :description="`将轮换客户端“${rotateResourceTarget?.clientId || ''}”的密钥，旧密钥立即失效，使用旧密钥的资源服务会校验失败。新密钥仅在轮换成功后展示一次。`"
      :pending="deleting"
      confirm-label="确认轮换"
      @close="rotateResourceTarget = null"
      @confirm="confirmRotateResourceSecret"
    />

    <ConfirmDialog
      :open="Boolean(revokeResourceTarget)"
      title="撤销资源校验客户端"
      :description="`将撤销客户端“${revokeResourceTarget?.clientId || ''}”，其准入认证立即失效；撤销保留记录供审计，可随时新建替代客户端。`"
      :pending="deleting"
      confirm-label="确认撤销"
      @close="revokeResourceTarget = null"
      @confirm="confirmRevokeResourceClient"
    />

    <ConfirmDialog
      :open="Boolean(deleteAppTarget)"
      title="删除可信应用"
      :description="`将删除“${deleteAppTarget?.applicationName || ''}”及其门户集成、客户端登记和用户授权关系。此操作无法撤销。`"
      :pending="deleting"
      confirm-label="确认删除"
      @close="deleteAppTarget = null"
      @confirm="confirmDeleteApplication"
    />

    <ConfirmDialog
      :open="Boolean(deleteClientTarget)"
      title="删除客户端"
      :description="`将删除客户端“${deleteClientTarget?.clientName || ''}（${deleteClientTarget?.clientId || ''}）。使用该客户端登录的会话不受影响，但应用将无法再发起登录。`"
      :pending="deleting"
      confirm-label="确认删除"
      @close="deleteClientTarget = null"
      @confirm="confirmDeleteClient"
    />
  </section>
</template>
