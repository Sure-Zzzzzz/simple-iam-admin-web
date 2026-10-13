<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import DataTable, { type DataTableColumn } from '@sure-zzzzzz/simple-iam-theme-contract/DataTable';
import FormSelect, { type FormSelectOption } from '@sure-zzzzzz/simple-iam-theme-contract/FormSelect';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  assignRolePermission,
  assignUserRole,
  createRole,
  deleteRole,
  deleteRoleAuthorizationRule,
  fetchAllTrustedApplications,
  fetchApplicationPermissionManifest,
  fetchDepartments,
  fetchPermissions,
  fetchRole,
  fetchRoleAuthorizationRule,
  fetchRoleDepartments,
  fetchRoleMemberPage,
  fetchRolePage,
  fetchRolePermissions,
  fetchUserGroupUsers,
  fetchUserGroups,
  fetchUsers,
  permissionTypeLabel,
  isRolePreconditionError,
  putRoleAuthorizationRule,
  revokeRolePermission,
  revokeUserRole,
  updateRole,
  type ApplicationPermissionManifest,
  type DataGrantDocument,
  type IamDepartment,
  type IamPermission,
  type IamRole,
  type IamUser,
  type IamUserGroup,
  type PageQuery,
  type RoleAuthorizationRule,
  type TrustedApplication
} from '../api/iamAuth';

const roles = ref<IamRole[]>([]);

const roleColumns: DataTableColumn[] = [
  { key: 'name', label: '角色' },
  { key: 'description', label: '说明' },
  { key: 'type', label: '类型' },
  { key: 'actions', label: '操作', align: 'right', nowrap: true }
];
const allPermissions = ref<IamPermission[]>([]);
const currentRole = ref<IamRole | null>(null);
const assignedPermissions = ref<IamPermission[]>([]);
const roleMembers = ref<IamUser[]>([]);
const roleDepartments = ref<IamDepartment[]>([]);
const message = ref('');
const errorMessage = ref('');
const roleKeyword = ref('');
const permissionKeyword = ref('');
// 角色列表服务端分页状态：与用户页同款（page/size/总数三件套 + 翻页守卫）
const rolePageSize = ref(10);
const roleCurrentPage = ref(1);
const roleTotalPages = ref(1);
const roleTotalElements = ref(0);
// 继承来源部门面板：admin 端点全量返回，客户端分页只读展示（切换角色时归位第一页）
const departmentPageSize = ref(8);
const departmentCurrentPage = ref(1);
const departmentTotalPages = computed(() =>
  Math.max(1, Math.ceil(roleDepartments.value.length / departmentPageSize.value))
);
const departmentPageItems = computed(() => {
  const start = (departmentCurrentPage.value - 1) * departmentPageSize.value;
  return roleDepartments.value.slice(start, start + departmentPageSize.value);
});
const createDrawerOpen = ref(false);
const detailDrawerOpen = ref(false);
const deleteTarget = ref<IamRole | null>(null);
const deleteMemberCount = ref<number | null>(null);
const revokePermissionTarget = ref<IamPermission | null>(null);
const deletePending = ref(false);
const deleteReadPending = ref(false);
let deleteReadRequest = 0;
const submitting = ref(false);
const permissionPending = ref(false);
const delegatedRole = computed(() => currentRole.value?.openRoleBinding ?? null);
const roleVersionReady = ref(true);
let roleDetailRequest = 0;
let roleWriteOperation = 0;

async function refreshDelegatedRole(role: IamRole, requestId: number, operationId: number): Promise<boolean> {
  if (operationId !== roleWriteOperation || requestId !== roleDetailRequest) return false;
  roleVersionReady.value = false;
  const refreshed = await fetchRole(role.id);
  if (operationId !== roleWriteOperation || requestId !== roleDetailRequest || currentRole.value?.id !== role.id) return false;
  const loaded = await openRoleDetail(refreshed, true, true, operationId);
  if (operationId !== roleWriteOperation) return false;
  if (!loaded) throw new Error('角色详情未能完整加载');
  return true;
}

async function handleRoleWriteError(error: unknown, role: IamRole, requestId: number, operationId: number, fallback: string) {
  if (operationId !== roleWriteOperation || currentRole.value?.id !== role.id) return;
  if (isRolePreconditionError(error)) {
    deleteTarget.value = null;
    try {
      if (!await refreshDelegatedRole(role, requestId, operationId)) return;
      errorMessage.value = '角色已发生变化，已重新加载。请核对最新内容后重新确认操作。';
    } catch (refreshError) {
      if (operationId !== roleWriteOperation) return;
      roleVersionReady.value = false;
      errorMessage.value = refreshError instanceof Error ? `重新加载角色失败：${refreshError.message}。请关闭详情后重新打开。` : fallback;
    }
    return;
  }
  errorMessage.value = error instanceof Error ? error.message : fallback;
}

const ruleApplications = ref<TrustedApplication[]>([]);
// 多应用并行编辑：每个勾选的应用一份独立编辑器，activeRuleAppId 指向当前页签
interface RuleEditorState {
  manifest: ApplicationPermissionManifest | null;
  manifestError: string | null;
  ruleExists: boolean;
  pagePermissions: Set<string>;
  apiPermissions: Set<string>;
  grantRows: RuleGrantRow[];
  pending: boolean;
}
const ruleEditors = ref(new Map<number, RuleEditorState>());
const activeRuleAppId = ref<number | ''>('');
const ruleSaving = ref(false);
const roleWritePending = computed(() => submitting.value || ruleSaving.value || deletePending.value || deleteReadPending.value);

const activeEditor = computed<RuleEditorState | null>(() => {
  return activeRuleAppId.value === '' ? null : ruleEditors.value.get(activeRuleAppId.value) ?? null;
});

const selectedRuleAppIds = computed<number[]>(() => {
  return ruleApplications.value
    .filter(application => ruleEditors.value.has(application.id))
    .map(application => application.id);
});

interface RuleGrantConstraintRow {
  dimension: string;
  values: string;
}

interface RuleGrantRow {
  resource: string;
  actions: Set<string>;
  all: boolean;
  constraints: RuleGrantConstraintRow[];
}

const createForm = reactive({
  code: '',
  name: '',
  description: ''
});

// —— 权限模块分组：iam:<module>:<type> 按模块段聚组，page+api 成对模块合并为一个开关 ——

interface PermissionGroupRow {
  key: string;
  label: string;
  typeLabel: string;
  description: string;
  permissions: IamPermission[];
}

function descriptionOf(permissions: IamPermission[]): string {
  return permissions.map(permission => permission.description).filter(Boolean).join(' / ');
}

function moduleLabelOf(permission: IamPermission): string {
  for (const suffix of ['页面', '接口']) {
    if (permission.name.endsWith(suffix)) {
      return permission.name.slice(0, -suffix.length);
    }
  }
  return permission.name;
}

const permissionGroupRows = computed<PermissionGroupRow[]>(() => {
  const groups = new Map<string, IamPermission[]>();
  for (const permission of allPermissions.value) {
    const parts = permission.code.split(':');
    const key = parts.length === 3 && parts[0] === 'iam' ? `module:${parts[1]}` : `other:${permission.code}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(permission);
    groups.set(key, bucket);
  }
  const rows: PermissionGroupRow[] = [];
  for (const [key, permissions] of groups) {
    const page = permissions.find(permission => permission.type === 'page');
    const api = permissions.find(permission => permission.type === 'api');
    if (page && api && permissions.length === 2) {
      rows.push({
        key,
        label: moduleLabelOf(page),
        typeLabel: '页面 + 接口',
        description: descriptionOf([page, api]),
        permissions: [page, api]
      });
    } else {
      // 不成对的码单独成行，不硬凑对
      for (const permission of permissions) {
        rows.push({
          key: `${key}:${permission.id}`,
          label: moduleLabelOf(permission),
          typeLabel: permissionTypeLabel(permission.type),
          description: descriptionOf([permission]),
          permissions: [permission]
        });
      }
    }
  }
  return rows;
});

const visiblePermissionGroups = computed(() => {
  const keyword = permissionKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return permissionGroupRows.value;
  }
  return permissionGroupRows.value.filter(row =>
    [row.label, row.typeLabel, ...row.permissions.map(permission => permission.code)]
      .some(value => value.toLowerCase().includes(keyword)));
});

const assignedPermissionIds = computed(() => new Set(assignedPermissions.value.map(permission => permission.id)));

function groupFullyAssigned(row: PermissionGroupRow): boolean {
  return row.permissions.every(permission => assignedPermissionIds.value.has(permission.id));
}

function groupPartlyAssigned(row: PermissionGroupRow): boolean {
  const assigned = row.permissions.filter(permission => assignedPermissionIds.value.has(permission.id));
  return assigned.length > 0 && assigned.length < row.permissions.length;
}

// —— 成员选择器：部门/协作组/关键字三筛，批量绑定走既有单人接口分批并发 ——

const memberPickerOpen = ref(false);
const memberCandidateKeyword = ref('');
const memberCandidateDepartmentId = ref<number | ''>('');
const memberCandidateGroupId = ref<number | ''>('');
const memberCandidates = ref<IamUser[]>([]);
const memberSelectedIds = ref<Set<string>>(new Set());
const memberCandidatePending = ref(false);
const memberAdding = ref(false);
const memberAddFailures = ref<string[]>([]);
const departments = ref<IamDepartment[]>([]);
const userGroups = ref<IamUserGroup[]>([]);
const revokeMemberTarget = ref<IamUser | null>(null);
const memberRevoking = ref(false);

const roleMemberIds = computed(() => new Set(roleMembers.value.map(user => user.subjectId)));
const memberSelectedCount = computed(() => memberSelectedIds.value.size);

async function openMemberPicker() {
  if (delegatedRole.value) return;
  memberPickerOpen.value = true;
  memberCandidateKeyword.value = '';
  memberCandidateDepartmentId.value = '';
  memberCandidateGroupId.value = '';
  memberCandidates.value = [];
  memberSelectedIds.value = new Set();
  memberAddFailures.value = [];
  if (departments.value.length && userGroups.value.length) {
    return;
  }
  try {
    const [departmentList, groupList] = await Promise.all([fetchDepartments(), fetchUserGroups()]);
    departments.value = departmentList;
    userGroups.value = groupList;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载部门/协作组失败';
  }
}

function closeMemberPicker() {
  memberPickerOpen.value = false;
}

function mergeMemberCandidates(users: IamUser[]) {
  const existingIds = new Set(memberCandidates.value.map(user => user.subjectId));
  const additions = users.filter(user => !existingIds.has(user.subjectId));
  if (additions.length) {
    memberCandidates.value = [...memberCandidates.value, ...additions];
  }
}

// 选部门/协作组即一键带出整组（全部勾选），管理员再单个剔除不想要的人
async function applyMemberDepartmentFilter() {
  if (memberCandidateDepartmentId.value === '') {
    return;
  }
  memberCandidatePending.value = true;
  errorMessage.value = '';
  try {
    const page = await fetchUsers({ departmentId: memberCandidateDepartmentId.value, size: 100 });
    mergeMemberCandidates(page.content);
    const next = new Set(memberSelectedIds.value);
    page.content.forEach(user => next.add(user.subjectId));
    memberSelectedIds.value = next;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '按部门加载成员失败';
  } finally {
    memberCandidatePending.value = false;
  }
}

async function applyMemberGroupFilter() {
  if (memberCandidateGroupId.value === '') {
    return;
  }
  memberCandidatePending.value = true;
  errorMessage.value = '';
  try {
    const users = await fetchUserGroupUsers(memberCandidateGroupId.value);
    mergeMemberCandidates(users);
    const next = new Set(memberSelectedIds.value);
    users.forEach(user => next.add(user.subjectId));
    memberSelectedIds.value = next;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '按协作组加载成员失败';
  } finally {
    memberCandidatePending.value = false;
  }
}

async function searchMemberCandidates() {
  const keyword = memberCandidateKeyword.value.trim();
  if (!keyword) {
    return;
  }
  memberCandidatePending.value = true;
  errorMessage.value = '';
  try {
    const page = await fetchUsers({ keyword, size: 100 });
    mergeMemberCandidates(page.content);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索用户失败';
  } finally {
    memberCandidatePending.value = false;
  }
}

function toggleMemberCandidate(subjectId: string) {
  const next = new Set(memberSelectedIds.value);
  if (next.has(subjectId)) {
    next.delete(subjectId);
  } else {
    next.add(subjectId);
  }
  memberSelectedIds.value = next;
}

// 分批并发（5 个一批）循环调既有单人绑定接口；失败逐个反馈，已成功的不回滚
async function confirmAddMembers() {
  if (!currentRole.value || delegatedRole.value) {
    return;
  }
  const role = currentRole.value;
  const targetIds = [...memberSelectedIds.value].filter(id => !roleMemberIds.value.has(id));
  if (!targetIds.length) {
    closeMemberPicker();
    return;
  }
  memberAdding.value = true;
  memberAddFailures.value = [];
  message.value = '';
  errorMessage.value = '';
  const failed: string[] = [];
  const batchSize = 5;
  for (let index = 0; index < targetIds.length; index += batchSize) {
    const batch = targetIds.slice(index, index + batchSize);
    const results = await Promise.allSettled(batch.map(subjectId => assignUserRole(subjectId, role.id)));
    results.forEach((result, batchIndex) => {
      if (result.status === 'rejected') {
        const user = memberCandidates.value.find(candidate => candidate.subjectId === batch[batchIndex]);
        failed.push(user ? (user.displayName || user.username) : `用户 ${batch[batchIndex]}`);
      }
    });
  }
  try {
    const memberPage = await fetchRoleMemberPage(role.id, { page: 1, size: 100 });
    roleMembers.value = memberPage.content;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '刷新角色成员失败';
  }
  memberAdding.value = false;
  if (failed.length) {
    memberAddFailures.value = failed;
    errorMessage.value = `以下成员添加失败：${failed.join('、')}`;
  } else {
    message.value = `已添加 ${targetIds.length} 名成员`;
    closeMemberPicker();
  }
}

function requestRevokeMember(user: IamUser) {
  revokeMemberTarget.value = user;
}

async function confirmRevokeMember() {
  if (!currentRole.value || delegatedRole.value || !revokeMemberTarget.value) {
    return;
  }
  const role = currentRole.value;
  const target = revokeMemberTarget.value;
  memberRevoking.value = true;
  errorMessage.value = '';
  try {
    await revokeUserRole(target.subjectId, role.id);
    const memberPage = await fetchRoleMemberPage(role.id, { page: 1, size: 100 });
    roleMembers.value = memberPage.content;
    message.value = '已移除该成员的角色';
    revokeMemberTarget.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '移除成员失败';
  } finally {
    memberRevoking.value = false;
  }
}

// —— 角色效果预览：本体权限 + 各应用已保存规则的只读汇总 ——

const roleProjectionRules = ref(new Map<number, RoleAuthorizationRule>());
// 按应用去重请求：toggleRuleApplication（默认选中首个应用）与 loadRoleProjectionRules
// 会并发查同一个应用，共享同一个 Promise 避免重复打接口；每次开抽屉/切角色前清空
let roleProjectionRuleRequests = new Map<number, Promise<RoleAuthorizationRule | null>>();

function ensureRoleProjectionRule(roleId: number, applicationId: number): Promise<RoleAuthorizationRule | null> {
  const cached = roleProjectionRuleRequests.get(applicationId);
  if (cached) {
    return cached;
  }
  const requestId = roleDetailRequest;
  const promise = fetchRoleAuthorizationRule(roleId, applicationId).then(rule => {
    if (rule && requestId === roleDetailRequest && currentRole.value?.id === roleId) {
      const next = new Map(roleProjectionRules.value);
      next.set(applicationId, rule);
      roleProjectionRules.value = next;
    }
    return rule;
  });
  roleProjectionRuleRequests.set(applicationId, promise);
  return promise;
}

const previewPages = computed(() => assignedPermissions.value.filter(permission => permission.type === 'page'));
const previewApiOnly = computed(() => {
  // 纯接口权限：同模块没有 page 码（内置码里同模块成对的，接口随页面走）
  const pageModules = new Set(previewPages.value.map(permission => permission.code.split(':')[1]));
  return assignedPermissions.value.filter(permission =>
    permission.type === 'api' && !pageModules.has(permission.code.split(':')[1] ?? ''));
});
const previewData = computed(() => assignedPermissions.value.filter(permission => permission.type === 'data'));

const previewProjectionRows = computed(() => {
  return ruleApplications.value
    .map(application => {
      const rule = roleProjectionRules.value.get(application.id);
      if (!rule) {
        return null;
      }
      const parts = [`页面 × ${rule.pagePermissions.length}`, `接口 × ${rule.apiPermissions.length}`];
      if (rule.dataGrantTemplate) {
        parts.push(`数据授权 × ${rule.dataGrantTemplate.grants.length}`);
      }
      return { name: application.applicationName, summary: parts.join('、') };
    })
    .filter((row): row is { name: string; summary: string } => row !== null);
});

const editForm = reactive({
  name: '',
  description: ''
});

const deleteDescription = computed(() => {
  const target = deleteTarget.value;
  if (!target) {
    return '';
  }
  const count = deleteMemberCount.value;
  if (count === null) {
    return `将删除“${target.name}”及其当前权限分配。此操作无法撤销。`;
  }
  if (count === 0) {
    return `将删除“${target.name}”及其当前权限分配。该角色当前没有成员，此操作无法撤销。`;
  }
  return `将删除“${target.name}”及其当前权限分配。该角色的 ${count} 名成员将在下次请求时失去对应权限，无需重新登录。此操作无法撤销。`;
});

// 角色列表改服务端检索后本地过滤退场：keyword 直接进查询参数，列表原样展示当前页
const filteredRoles = computed(() => roles.value);

// 翻页守卫：与用户页同款（越界/原地跳转忽略）
function changeRolePage(page: number) {
  if (page < 1 || page > roleTotalPages.value || page === roleCurrentPage.value) {
    return;
  }
  roleCurrentPage.value = page;
  void loadRoles();
}

function changeRolePageSize(size: number) {
  if (size < 1 || size === rolePageSize.value) {
    return;
  }
  rolePageSize.value = size;
  roleCurrentPage.value = 1;
  void loadRoles();
}

// 搜索：回服务端检索并回到第一页
function searchRoles() {
  roleCurrentPage.value = 1;
  void loadRoles();
}

// 合并开关：勾选 = 组内缺的码逐个补发；取消（含半选态点击）= 组内已绑的码逐个撤销；
// 部分失败时列出码名，已生效的不回滚
async function togglePermissionGroup(row: PermissionGroupRow) {
  if (!currentRole.value || delegatedRole.value || permissionPending.value) {
    return;
  }
  const enable = !groupFullyAssigned(row);
  permissionPending.value = true;
  message.value = '';
  errorMessage.value = '';
  const failed: string[] = [];
  for (const permission of row.permissions) {
    const assigned = assignedPermissionIds.value.has(permission.id);
    if (enable === assigned) {
      continue;
    }
    try {
      if (enable) {
        await assignRolePermission(currentRole.value.id, permission.id);
      } else {
        await revokeRolePermission(currentRole.value.id, permission.id);
      }
    } catch {
      failed.push(permission.code);
    }
  }
  try {
    assignedPermissions.value = await fetchRolePermissions(currentRole.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '刷新已分配权限失败';
  }
  if (failed.length) {
    errorMessage.value = `以下权限${enable ? '分配' : '撤销'}失败：${failed.join('、')}`;
  } else {
    message.value = enable ? `已为「${row.label}」分配${row.typeLabel}` : `已收回「${row.label}」的${row.typeLabel}`;
  }
  permissionPending.value = false;
}

async function loadRoles(operationId?: number) {
  errorMessage.value = '';
  try {
    const roleQuery: PageQuery = { page: roleCurrentPage.value, size: rolePageSize.value };
    const trimmedKeyword = roleKeyword.value.trim();
    if (trimmedKeyword) {
      roleQuery.keyword = trimmedKeyword;
    }
    const [rolePage, permissionList] = await Promise.all([
      fetchRolePage(roleQuery),
      fetchPermissions()
    ]);
    if (operationId !== undefined && operationId !== roleWriteOperation) return;
    roles.value = rolePage.content;
    roleTotalElements.value = rolePage.totalElements;
    roleTotalPages.value = Math.max(rolePage.totalPages, 1);
    roleCurrentPage.value = rolePage.page;
    allPermissions.value = permissionList;
    if (currentRole.value) {
      const refreshed = roles.value.find(role => role.id === currentRole.value?.id);
      if (refreshed) {
        await openRoleDetail(refreshed, false, false, operationId);
      } else {
        closeRoleDetail();
      }
    }
  } catch (error) {
    if (operationId !== undefined && operationId !== roleWriteOperation) return;
    errorMessage.value = error instanceof Error ? error.message : '加载角色失败';
  }
}

async function submitCreateRole() {
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const created = await createRole({ ...createForm });
    Object.assign(createForm, { code: '', name: '', description: '' });
    createDrawerOpen.value = false;
    message.value = '角色创建成功';
    // 新建角色按 createdAt 倒序必然落在第一页：回到第一页重载，保证 find 能定位到
    roleKeyword.value = '';
    roleCurrentPage.value = 1;
    await loadRoles();
    const target = roles.value.find(role => role.id === created.id) || created;
    await openRoleDetail(target);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建角色失败';
  } finally {
    submitting.value = false;
  }
}

async function openRoleDetail(role: IamRole, openDrawer = true, detailAlreadyRead = false, operationId?: number) {
  if (operationId !== undefined && operationId !== roleWriteOperation) return false;
  if (operationId === undefined) {
    roleWriteOperation++;
    submitting.value = false;
    ruleSaving.value = false;
  }
  const requestId = ++roleDetailRequest;
  const reloadRules = openDrawer || Boolean(role.openRoleBinding);
  errorMessage.value = '';
  roleVersionReady.value = !role.openRoleBinding;
  currentRole.value = role;
  if (reloadRules) resetRuleEditor();
  assignedPermissions.value = [];
  roleMembers.value = [];
  roleDepartments.value = [];
  departmentCurrentPage.value = 1;
  Object.assign(editForm, { name: role.name, description: role.description || '' });
  try {
    // 受委托角色必须先回读详情，版本与展示内容一起确认，不在提交前偷换版本。
    const detail = role.openRoleBinding && !detailAlreadyRead ? await fetchRole(role.id) : role;
    if (requestId !== roleDetailRequest) return false;
    currentRole.value = detail;
    Object.assign(editForm, { name: detail.name, description: detail.description || '' });
    const [permissions, memberPage, departments] = await Promise.all([
      fetchRolePermissions(role.id),
      fetchRoleMemberPage(role.id, { page: 1, size: 100 }),
      fetchRoleDepartments(role.id)
    ]);
    if (requestId !== roleDetailRequest) return false;
    roleVersionReady.value = true;
    assignedPermissions.value = permissions;
    roleMembers.value = memberPage.content;
    roleDepartments.value = departments;
    if (openDrawer) detailDrawerOpen.value = true;
    if (reloadRules) void loadRuleApplications();
    return true;
  } catch (error) {
    if (requestId !== roleDetailRequest) return false;
    errorMessage.value = error instanceof Error ? error.message : '加载角色详情失败';
    return false;
  }
}

function closeRoleDetail() {
  roleWriteOperation++;
  submitting.value = false;
  ruleSaving.value = false;
  roleDetailRequest++;
  detailDrawerOpen.value = false;
  currentRole.value = null;
  assignedPermissions.value = [];
  roleMembers.value = [];
  roleDepartments.value = [];
  departmentCurrentPage.value = 1;
  permissionKeyword.value = '';
  memberPickerOpen.value = false;
  resetRuleEditor();
}

function resetRuleEditor() {
  ruleApplications.value = [];
  ruleEditors.value = new Map();
  activeRuleAppId.value = '';
  roleProjectionRules.value = new Map();
  roleProjectionRuleRequests = new Map();
}

async function loadRuleApplications() {
  const requestId = roleDetailRequest;
  try {
    const applications = await fetchAllTrustedApplications();
    if (requestId !== roleDetailRequest) return;
    const binding = delegatedRole.value;
    ruleApplications.value = binding ? applications.filter(application => application.id === binding.applicationId) : applications;
    // 默认选中第一个应用，避免进来先空选一次；已有勾选时不覆盖
    const first = ruleApplications.value[0];
    if (first && ruleEditors.value.size === 0) {
      void toggleRuleApplication(first.id);
    }
    void loadRoleProjectionRules();
  } catch (error) {
    if (requestId !== roleDetailRequest) return;
    errorMessage.value = error instanceof Error ? error.message : '加载可信应用失败';
  }
}

// 效果预览用：为每个可信应用查询该角色的已保存规则；无规则 404 是既有契约，直接跳过不存 Map
// 复用 ensureRoleProjectionRule 缓存，避免与 toggleRuleApplication 默认选中首个应用时重复打接口
async function loadRoleProjectionRules() {
  const role = currentRole.value;
  const requestId = roleDetailRequest;
  if (!role) {
    return;
  }
  try {
    await Promise.all(ruleApplications.value.map(application => ensureRoleProjectionRule(role.id, application.id)));
  } catch (error) {
    if (requestId !== roleDetailRequest) return;
    errorMessage.value = error instanceof Error ? error.message : '加载角色效果预览失败';
  }
}

// 勾选/取消一个应用的编辑器：勾选即初始化并拉清单+存量规则，取消即整体移除
async function toggleRuleApplication(applicationId: number) {
  const role = currentRole.value;
  const requestId = roleDetailRequest;
  if (!role || (role.openRoleBinding && role.openRoleBinding.applicationId !== applicationId)) return;
  if (role.openRoleBinding && ruleEditors.value.has(applicationId)) return;
  if (ruleEditors.value.has(applicationId)) {
    ruleEditors.value.delete(applicationId);
    if (activeRuleAppId.value === applicationId) {
      activeRuleAppId.value = selectedRuleAppIds.value[0] ?? '';
    }
    return;
  }
  // 必须用 reactive 包装：后续对 editor 的字段赋值（manifest/勾选集等）要即时驱动模板重渲
  const editor = reactive<RuleEditorState>({
    manifest: null,
    manifestError: null,
    ruleExists: false,
    pagePermissions: new Set(),
    apiPermissions: new Set(),
    grantRows: [],
    pending: true
  });
  ruleEditors.value.set(applicationId, editor);
  activeRuleAppId.value = applicationId;
  if (!currentRole.value) {
    return;
  }
  try {
    const manifest = await fetchApplicationPermissionManifest(applicationId);
    if (requestId !== roleDetailRequest || ruleEditors.value.get(applicationId) !== editor) return;
    if (manifest === null) {
      editor.manifestError = '该应用尚未登记权限清单';
      return;
    }
    editor.manifest = manifest;
    const rule = await ensureRoleProjectionRule(role.id, applicationId);
    if (requestId !== roleDetailRequest || ruleEditors.value.get(applicationId) !== editor) return;
    if (rule !== null) {
      editor.ruleExists = true;
      editor.pagePermissions = new Set(rule.pagePermissions);
      editor.apiPermissions = new Set(rule.apiPermissions);
      editor.grantRows = grantRowsFromTemplate(rule.dataGrantTemplate);
    }
  } catch (error) {
    editor.manifestError = error instanceof Error ? error.message : '读取授权规则失败';
  } finally {
    editor.pending = false;
  }
}

function setActiveRuleApp(applicationId: number) {
  if (ruleEditors.value.has(applicationId)) {
    activeRuleAppId.value = applicationId;
  }
}

function toggleRuleCode(group: 'pagePermissions' | 'apiPermissions', code: string) {
  const editor = activeEditor.value;
  if (!editor) {
    return;
  }
  const target = group === 'pagePermissions' ? editor.pagePermissions : editor.apiPermissions;
  if (target.has(code)) {
    target.delete(code);
  } else {
    target.add(code);
  }
}

function splitGrantTokens(value: string): string[] {
  return value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
}

function grantRowsFromTemplate(template: DataGrantDocument | null): RuleGrantRow[] {
  if (!template) {
    return [];
  }
  return template.grants.map(grant => ({
    resource: grant.resource,
    actions: new Set(grant.actions),
    all: grant.all,
    constraints: grant.constraints.map(constraint => ({
      dimension: constraint.dimension,
      values: constraint.values.join(', ')
    }))
  }));
}

function declarationFor(resource: string) {
  return activeEditor.value?.manifest?.dataResources.find(item => item.resource === resource) ?? null;
}

// 下拉/勾选候选 = 清单申报集 ∪ 当前存量值：清单缩码后存量越界项保留并标"未申报"，
// 避免保存时被静默丢弃；后端 PUT 仍会 400 兜底
function mergedCandidates(declared: string[], present: string[]): { value: string; declared: boolean }[] {
  const extras = present.filter(item => item && !declared.includes(item));
  return [...declared, ...extras].map(value => ({ value, declared: declared.includes(value) }));
}

function grantResourceOptions(row: RuleGrantRow) {
  const declared = activeEditor.value?.manifest?.dataResources.map(item => item.resource) ?? [];
  return mergedCandidates(declared, row.resource ? [row.resource] : []);
}

function grantActionOptions(row: RuleGrantRow) {
  const declared = declarationFor(row.resource)?.actions ?? [];
  return mergedCandidates(declared, [...row.actions]);
}

function grantDimensionOptions(row: RuleGrantRow) {
  const declared = declarationFor(row.resource)?.dimensions ?? [];
  return mergedCandidates(declared, row.constraints.map(item => item.dimension));
}

function grantResourceSelectOptions(row: RuleGrantRow): FormSelectOption[] {
  return grantResourceOptions(row).map(option => ({
    label: option.declared ? option.value : `${option.value}（清单未申报）`,
    value: option.value
  }));
}

function grantDimensionSelectOptions(row: RuleGrantRow): FormSelectOption[] {
  return grantDimensionOptions(row).map(option => ({
    label: option.declared ? option.value : `${option.value}（未申报）`,
    value: option.value
  }));
}

const memberDepartmentOptions = computed<FormSelectOption[]>(() => [
  { label: '选择部门…', value: '' },
  ...departments.value.map(department => ({ label: department.name, value: department.id }))
]);

const memberGroupOptions = computed<FormSelectOption[]>(() => [
  { label: '选择协作组…', value: '' },
  ...userGroups.value.map(group => ({ label: group.name, value: group.id }))
]);

// 切换资源即切换码空间：旧动作/约束维度对新资源无意义，全部清空
function changeGrantResource(index: number) {
  const row = activeEditor.value?.grantRows[index];
  if (!row) {
    return;
  }
  row.actions = new Set();
  row.constraints = [];
}

function toggleGrantAction(index: number, action: string) {
  const row = activeEditor.value?.grantRows[index];
  if (!row) {
    return;
  }
  if (row.actions.has(action)) {
    row.actions.delete(action);
  } else {
    row.actions.add(action);
  }
}

function addGrantRow() {
  const editor = activeEditor.value;
  if (!editor) {
    return;
  }
  const first = editor.manifest?.dataResources[0]?.resource ?? '';
  editor.grantRows.push({ resource: first, actions: new Set(), all: false, constraints: [] });
}

function addGrantConstraint(index: number) {
  const row = activeEditor.value?.grantRows[index];
  if (!row) {
    return;
  }
  row.constraints.push({ dimension: declarationFor(row.resource)?.dimensions[0] ?? '', values: '' });
}

// 组装提交模板：无有效授权行时整体传 null（契约 null=清除数据授权）；
// all=true 的行 constraints 强制空数组（契约要求）
function templateFromGrantRows(editor: RuleEditorState): DataGrantDocument | null {
  const grants = editor.grantRows
    .filter(row => row.resource)
    .map(row => ({
      resource: row.resource,
      actions: [...row.actions],
      all: row.all,
      constraints: row.all ? [] : row.constraints
        .filter(constraint => constraint.dimension)
        .map(constraint => ({
          dimension: constraint.dimension,
          operator: 'IN' as const,
          values: splitGrantTokens(constraint.values)
        }))
    }));
  if (!grants.length) {
    return null;
  }
  return { protocol: 'simple-data-permission', version: '1.0', grants };
}

// 批量保存：对所有勾选且清单就绪的应用逐个全量替换 PUT；部分失败时列出失败应用名
async function submitRule() {
  if (!currentRole.value || !roleVersionReady.value || roleWritePending.value) {
    return;
  }
  const targets = [...ruleEditors.value.entries()].filter(([, editor]) => editor.manifest);
  if (!targets.length) {
    return;
  }
  ruleSaving.value = true;
  const operationId = ++roleWriteOperation;
  const role = currentRole.value;
  const requestId = roleDetailRequest;
  message.value = '';
  errorMessage.value = '';
  const failed: string[] = [];
  for (const [applicationId, editor] of targets) {
    try {
      const saved = await putRoleAuthorizationRule(role.id, applicationId, {
        pagePermissions: [...editor.pagePermissions],
        apiPermissions: [...editor.apiPermissions],
        dataGrantTemplate: templateFromGrantRows(editor)
      }, role.openRoleBinding);
      if (operationId !== roleWriteOperation) return;
      editor.ruleExists = true;
      editor.pagePermissions = new Set(saved.pagePermissions);
      editor.apiPermissions = new Set(saved.apiPermissions);
      editor.grantRows = grantRowsFromTemplate(saved.dataGrantTemplate);
      const next = new Map(roleProjectionRules.value);
      next.set(applicationId, saved);
      roleProjectionRules.value = next;
    } catch (error) {
      if (role.openRoleBinding) {
        await handleRoleWriteError(error, role, requestId, operationId, '保存授权规则失败');
        if (operationId === roleWriteOperation) ruleSaving.value = false;
        return;
      }
      failed.push(applicationName(applicationId) || `应用 ${applicationId}`);
      void error;
    }
  }
  if (operationId !== roleWriteOperation) return;
  ruleSaving.value = false;
  if (failed.length) {
    errorMessage.value = `以下应用的授权规则保存失败：${failed.join('、')}`;
  } else {
    message.value = `已保存 ${targets.length} 个应用的授权规则`;
    if (role.openRoleBinding) {
      try {
        await refreshDelegatedRole(role, requestId, operationId);
      } catch (error) {
        if (operationId !== roleWriteOperation) return;
        errorMessage.value = error instanceof Error ? `规则已保存，但重新加载角色失败：${error.message}。请关闭详情后重新打开。` : '规则已保存，请重新打开角色详情。';
      }
    }
  }
}

function applicationName(applicationId: number): string {
  const application = ruleApplications.value.find(item => item.id === applicationId);
  return application ? application.applicationName : '';
}

async function clearRule() {
  if (!currentRole.value || activeRuleAppId.value === '' || !roleVersionReady.value || roleWritePending.value) {
    return;
  }
  ruleSaving.value = true;
  const operationId = ++roleWriteOperation;
  const role = currentRole.value;
  const applicationId = activeRuleAppId.value;
  const requestId = roleDetailRequest;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteRoleAuthorizationRule(role.id, applicationId, role.openRoleBinding);
    if (operationId !== roleWriteOperation) return;
    const editor = ruleEditors.value.get(applicationId);
    if (editor) {
      editor.ruleExists = false;
      editor.pagePermissions = new Set();
      editor.apiPermissions = new Set();
      editor.grantRows = [];
    }
    const next = new Map(roleProjectionRules.value);
    next.delete(applicationId);
    roleProjectionRules.value = next;
    message.value = '应用授权规则已删除';
    if (role.openRoleBinding) await refreshDelegatedRole(role, requestId, operationId);
  } catch (error) {
    await handleRoleWriteError(error, role, requestId, operationId, '删除授权规则失败');
  } finally {
    if (operationId === roleWriteOperation) ruleSaving.value = false;
  }
}

async function submitRoleEdit() {
  if (!currentRole.value || !roleVersionReady.value || roleWritePending.value) {
    return;
  }
  submitting.value = true;
  const operationId = ++roleWriteOperation;
  const role = currentRole.value;
  const requestId = roleDetailRequest;
  message.value = '';
  errorMessage.value = '';
  try {
    const saved = await updateRole(role.id, { ...editForm }, role.openRoleBinding);
    if (operationId !== roleWriteOperation) return;
    currentRole.value = saved;
    message.value = '角色已更新';
    await loadRoles(operationId);
  } catch (error) {
    await handleRoleWriteError(error, role, requestId, operationId, '更新角色失败');
  } finally {
    if (operationId === roleWriteOperation) submitting.value = false;
  }
}

async function requestDeleteRole(role: IamRole) {
  if (roleWritePending.value) return;
  const requestId = ++deleteReadRequest;
  deleteMemberCount.value = null;
  message.value = '';
  errorMessage.value = '';
  if (role.openRoleBinding) {
    deleteTarget.value = null;
    deleteReadPending.value = true;
    try {
      const detail = await fetchRole(role.id);
      if (requestId !== deleteReadRequest) return;
      deleteTarget.value = detail;
    } catch (error) {
      if (requestId !== deleteReadRequest) return;
      errorMessage.value = error instanceof Error ? `读取删除确认信息失败：${error.message}` : '读取删除确认信息失败';
      return;
    } finally {
      if (requestId === deleteReadRequest) deleteReadPending.value = false;
    }
  } else {
    deleteTarget.value = role;
  }
  const target = deleteTarget.value;
  fetchRoleMemberPage(role.id, { page: 1, size: 1 })
    .then(page => {
      if (requestId !== deleteReadRequest || deleteTarget.value !== target) return;
      deleteMemberCount.value = page.totalElements;
    })
    .catch(() => {
      if (requestId !== deleteReadRequest || deleteTarget.value !== target) return;
      deleteMemberCount.value = null;
    });
}

async function confirmDeleteRole() {
  if (!deleteTarget.value) {
    return;
  }
  deletePending.value = true;
  const role = deleteTarget.value;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteRole(role.id, role.openRoleBinding);
    if (currentRole.value?.id === role.id) {
      closeRoleDetail();
    }
    message.value = '角色已删除';
    deleteTarget.value = null;
    deleteMemberCount.value = null;
    await loadRoles();
  } catch (error) {
    if (isRolePreconditionError(error)) {
      deleteTarget.value = null;
      await loadRoles();
      errorMessage.value = '角色已发生变化，已重新加载。请核对最新内容后重新确认删除。';
    } else {
      errorMessage.value = error instanceof Error ? error.message : '删除角色失败';
    }
  } finally {
    deletePending.value = false;
  }
}

function requestRevokePermission(permission: IamPermission) {
  revokePermissionTarget.value = permission;
}

async function confirmRevokePermission() {
  if (!currentRole.value || delegatedRole.value || !revokePermissionTarget.value) {
    return;
  }
  permissionPending.value = true;
  errorMessage.value = '';
  try {
    await revokeRolePermission(currentRole.value.id, revokePermissionTarget.value.id);
    assignedPermissions.value = await fetchRolePermissions(currentRole.value.id);
    message.value = '权限已从角色中移除';
    revokePermissionTarget.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '撤销权限失败';
  } finally {
    permissionPending.value = false;
  }
}

onMounted(() => {
  void loadRoles();
});
onUnmounted(() => { roleDetailRequest++; roleWriteOperation++; deleteReadRequest++; });
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="角色管理"
      description="通过角色集中管理访问范围，并将页面、接口和数据权限按职责分配。"
      primary-label="新建角色"
      @primary="createDrawerOpen = true"
    />

    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="admin-message error" role="alert">{{ errorMessage }}</p>

    <section class="admin-data-surface" aria-label="角色列表">
      <header class="data-toolbar">
        <div>
          <h2>全部角色 <span>{{ roleTotalElements }}</span></h2>
          <p>选择一个角色以查看其权限范围和配置。</p>
        </div>
        <label class="search-field">
          <span class="sr-only">搜索角色</span>
          <input v-model="roleKeyword" type="search" placeholder="搜索编码、名称或描述" @keyup.enter="searchRoles">
        </label>
      </header>
      <DataTable
        :columns="roleColumns"
        :rows="filteredRoles"
        row-key="id"
        empty-text="没有找到匹配的角色。"
        :selected-key="currentRole ? currentRole.id : null"
      >
        <template #cell-name="{ row }">
          <button class="table-primary-action" type="button" :disabled="roleWritePending" @click="openRoleDetail(row)">
            <strong>{{ row.name }}</strong>
            <span>{{ row.code }}</span>
          </button>
        </template>
        <template #cell-description="{ row }">{{ row.description || '未填写角色说明' }}</template>
        <template #cell-type="{ row }">
          <span class="status-badge" :class="row.builtIn === 1 ? 'warning' : ''">
            {{ row.openRoleBinding ? '受委托角色' : (row.builtIn === 1 ? '内置角色' : '自定义角色') }}
          </span>
        </template>
        <template #cell-actions="{ row }">
          <button class="table-action" type="button" :disabled="roleWritePending" @click="openRoleDetail(row)">查看</button>
          <button
            v-if="row.builtIn !== 1"
            class="table-action danger"
            type="button"
            :disabled="roleWritePending"
            @click="requestDeleteRole(row)"
          >
            删除
          </button>
        </template>
      </DataTable>
      <Pagination
        v-if="roleTotalElements > 0"
        :current="roleCurrentPage"
        :total="roleTotalElements"
        :page-size="rolePageSize"
        @update:current="changeRolePage"
        @update:page-size="changeRolePageSize"
      />
    </section>

    <EntityDrawer :open="createDrawerOpen" :pending="submitting" title="新建角色" description="角色编码创建后不可修改，请使用清晰稳定的职责标识。" @close="!submitting && (createDrawerOpen = false)">
      <form class="drawer-form" @submit.prevent="submitCreateRole">
        <label><span>角色编码</span><input v-model="createForm.code" required placeholder="例如 business_operator"></label>
        <label><span>角色名称</span><input v-model="createForm.name" required placeholder="例如 业务运营"></label>
        <label><span>角色说明</span><textarea v-model="createForm.description" placeholder="说明该角色承担的工作职责"></textarea></label>
        <footer class="drawer-actions">
          <button class="button-secondary" type="button" :disabled="submitting" @click="createDrawerOpen = false">取消</button>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建角色' }}</button>
        </footer>
      </form>
    </EntityDrawer>

    <EntityDrawer :open="detailDrawerOpen" :pending="roleWritePending" wide :title="currentRole ? currentRole.name : '角色详情'" :description="currentRole?.code" @close="closeRoleDetail">
      <template v-if="currentRole">
        <div class="drawer-status-line">
          <span class="status-badge" :class="currentRole.builtIn === 1 || delegatedRole ? 'warning' : ''">{{ delegatedRole ? '受委托角色' : (currentRole.builtIn === 1 ? '内置角色' : '自定义角色') }}</span>
          <span v-if="currentRole.builtIn === 1">内置角色不能删除</span>
        </div>
        <section v-if="delegatedRole" class="assignment-section" aria-label="委托信息">
          <dl class="open-role-details">
            <div><dt>委托编号</dt><dd>{{ delegatedRole.openRoleId }}</dd></div>
            <div><dt>固定应用</dt><dd>{{ applicationName(delegatedRole.applicationId) || delegatedRole.applicationId }}</dd></div>
            <div><dt>组织根部门</dt><dd>{{ delegatedRole.rootDepartmentId }}</dd></div>
            <div><dt>版本</dt><dd>{{ delegatedRole.revision }}</dd></div>
          </dl>
        </section>
        <form class="drawer-form" @submit.prevent="submitRoleEdit">
          <label><span>角色名称</span><input v-model="editForm.name" required></label>
          <label><span>角色说明</span><textarea v-model="editForm.description"></textarea></label>
          <button class="button-primary" type="submit" :disabled="roleWritePending || !roleVersionReady">{{ submitting ? '正在保存…' : '保存基本信息' }}</button>
        </form>
        <section class="assignment-section">
          <header>
            <div>
              <h3>角色成员 <span>{{ roleMembers.length }}</span></h3>
              <p>当前持有该角色的用户。</p>
            </div>
            <button v-if="!delegatedRole" class="button-secondary" type="button" @click="openMemberPicker">添加成员</button>
          </header>
          <div v-if="roleMembers.length" class="assignment-list">
            <article v-for="user in roleMembers" :key="user.subjectId">
              <div>
                <strong>{{ user.displayName || user.username }}</strong>
                <span>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}</span>
              </div>
              <div class="drawer-status-line">
                <span class="status-badge" :class="user.status === 1 ? '' : 'muted'">{{ user.status === 1 ? '启用' : '禁用' }}</span>
                <button v-if="!delegatedRole" type="button" class="table-action danger" @click="requestRevokeMember(user)">移除</button>
              </div>
            </article>
          </div>
          <p v-else class="assignment-empty">暂无成员持有该角色。</p>
          <div v-if="memberPickerOpen" class="member-picker">
            <span class="member-picker-title">按部门或协作组一键带出人员，再单个剔除；关键字可补充搜索</span>
            <div class="member-picker-filter-bar">
              <label>
                <span class="sr-only">按部门筛选</span>
                <FormSelect
                  v-model="memberCandidateDepartmentId"
                  :options="memberDepartmentOptions"
                  :disabled="memberCandidatePending"
                  aria-label="按部门筛选"
                  @change="applyMemberDepartmentFilter"
                />
              </label>
              <label>
                <span class="sr-only">按协作组筛选</span>
                <FormSelect
                  v-model="memberCandidateGroupId"
                  :options="memberGroupOptions"
                  :disabled="memberCandidatePending"
                  aria-label="按协作组筛选"
                  @change="applyMemberGroupFilter"
                />
              </label>
              <label class="search-field">
                <span class="sr-only">按关键字搜索</span>
                <input v-model="memberCandidateKeyword" type="search" placeholder="搜索用户名 / 显示名" :disabled="memberCandidatePending" @keyup.enter="searchMemberCandidates">
              </label>
            </div>
            <p v-if="memberCandidatePending" class="member-picker-status">正在加载…</p>
            <p v-else-if="!memberCandidates.length" class="member-picker-status">选择部门/协作组或搜索关键字以列出候选人。</p>
            <div v-else class="member-option-list">
              <label v-for="user in memberCandidates" :key="user.subjectId" class="member-option" :class="{ muted: roleMemberIds.has(user.subjectId) }">
                <input
                  type="checkbox"
                  :checked="memberSelectedIds.has(user.subjectId) || roleMemberIds.has(user.subjectId)"
                  :disabled="roleMemberIds.has(user.subjectId)"
                  @change="toggleMemberCandidate(user.subjectId)"
                >
                <span>
                  <strong>{{ user.displayName || user.username }}</strong>
                  <small>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}{{ roleMemberIds.has(user.subjectId) ? ' · 已是成员' : '' }}</small>
                </span>
              </label>
            </div>
            <p v-if="memberAddFailures.length" class="admin-message error" role="alert">添加失败：{{ memberAddFailures.join('、') }}</p>
            <footer class="drawer-actions">
              <button class="button-secondary" type="button" :disabled="memberAdding" @click="closeMemberPicker">取消</button>
              <button class="button-primary" type="button" :disabled="memberAdding || !memberSelectedCount" @click="confirmAddMembers">
                {{ memberAdding ? '正在添加…' : `确认添加${memberSelectedCount ? `（${memberSelectedCount}）` : ''}` }}
              </button>
            </footer>
          </div>
        </section>
        <section class="assignment-section">
          <header>
            <div>
              <h3>继承来源部门 <span>{{ roleDepartments.length }}</span></h3>
              <p>挂载了该角色的部门，其全体成员自动继承本角色，不会单独出现在上方“角色成员”列表中；只读展示，请到组织与成员中维护部门角色挂载关系。</p>
            </div>
          </header>
          <div v-if="roleDepartments.length" class="assignment-list">
            <article v-for="department in departmentPageItems" :key="department.id">
              <div>
                <strong>{{ department.name }}</strong>
                <span>{{ department.code }}</span>
              </div>
            </article>
          </div>
          <Pagination
            v-if="departmentTotalPages > 1"
            :current="departmentCurrentPage"
            :total="roleDepartments.length"
            :page-size="departmentPageSize"
            :page-size-options="[]"
            @update:current="departmentCurrentPage = $event"
          />
          <p v-else-if="!roleDepartments.length" class="assignment-empty">尚无部门挂载该角色。</p>
        </section>
        <section v-if="!delegatedRole" class="assignment-section">
          <header>
            <div>
              <h3>IAM 管理台权限 <span>{{ assignedPermissions.length }}</span></h3>
              <p>按模块勾选，管平台自身管理台访问；page+api 成对模块合并为一个开关，勾选即两码同发、取消即两码同收。</p>
            </div>
          </header>
          <label class="search-field">
            <span class="sr-only">搜索权限模块</span>
            <input v-model="permissionKeyword" type="search" placeholder="搜索模块名称或编码">
          </label>
          <div v-if="visiblePermissionGroups.length" class="picker-options">
            <label v-for="row in visiblePermissionGroups" :key="row.key" :class="{ 'partly-checked': groupPartlyAssigned(row) }">
              <input
                type="checkbox"
                :checked="groupFullyAssigned(row)"
                :disabled="permissionPending"
                @change="togglePermissionGroup(row)"
              >
              <span class="picker-option-text">
                <span class="picker-option-title">{{ row.label }}（{{ row.typeLabel }}）</span>
                <span v-if="row.description" class="picker-option-hint">{{ row.description }}</span>
              </span>
            </label>
          </div>
          <p v-else class="picker-empty">没有匹配的权限模块。</p>
          <div v-if="assignedPermissions.length" class="assignment-list available">
            <article v-for="permission in assignedPermissions" :key="permission.id">
              <div>
                <strong>{{ permission.name }}</strong>
                <span>{{ permission.code }} · {{ permission.type }}</span>
              </div>
              <button type="button" class="table-action danger" :disabled="permissionPending" @click="requestRevokePermission(permission)">移除</button>
            </article>
          </div>
          <p v-else class="assignment-empty">尚未分配权限。</p>
          <div class="preview-block">
            <p class="preview-block-title">当前效果（只读预览）</p>
            <div class="picker-group">
              <p class="picker-group-title">可访问页面（{{ previewPages.length }}）</p>
              <p v-if="!previewPages.length" class="picker-empty">该角色未分配任何页面权限。</p>
              <ul v-else class="preview-plain-list">
                <li v-for="permission in previewPages" :key="permission.id">{{ permission.name }}</li>
              </ul>
            </div>
            <div class="picker-group">
              <p class="picker-group-title">纯接口权限（{{ previewApiOnly.length }}）</p>
              <p v-if="!previewApiOnly.length" class="picker-empty">该角色没有独立的纯接口权限。</p>
              <ul v-else class="preview-plain-list">
                <li v-for="permission in previewApiOnly" :key="permission.id">{{ permission.name }}</li>
              </ul>
            </div>
            <div class="picker-group">
              <p class="picker-group-title">数据权限（{{ previewData.length }}）</p>
              <p v-if="!previewData.length" class="picker-empty">该角色未分配任何数据权限。</p>
              <ul v-else class="preview-plain-list">
                <li v-for="permission in previewData" :key="permission.id">{{ permission.name }}</li>
              </ul>
            </div>
          </div>
        </section>
        <section class="assignment-section assignment-section--projection">
          <header>
            <div>
              <div class="section-title-row">
                <h3>业务应用投影规则</h3>
                <span class="status-badge warning">影响其他应用</span>
              </div>
              <p>按应用配置该角色的授权规则，影响持角色用户在其业务应用 Token 里的投影；保存后立即按规则重算。</p>
            </div>
          </header>

          <div class="preview-block">
            <p class="preview-block-title">该角色将投影的权限（按应用汇总，需用户另有 admitted 授权方可生效）</p>
            <p v-if="!previewProjectionRows.length" class="picker-empty">该角色在各应用均未配置授权规则。</p>
            <ul v-else class="preview-plain-list">
              <li v-for="row in previewProjectionRows" :key="row.name">{{ row.name }} —— {{ row.summary }}</li>
            </ul>
          </div>

          <div class="picker-group">
            <p class="picker-group-title">{{ delegatedRole ? '固定可信应用' : '可信应用（可多选，每个应用单独配置）' }}</p>
            <div v-if="ruleApplications.length" class="picker-options">
              <label v-for="application in ruleApplications" :key="application.id">
                <input
                  type="checkbox"
                  :checked="ruleEditors.has(application.id)"
                  :disabled="Boolean(delegatedRole) || roleWritePending"
                  @change="toggleRuleApplication(application.id)"
                >
                <span>{{ application.applicationName }}（{{ application.applicationCode }}）</span>
              </label>
            </div>
            <p v-else class="picker-empty">暂无可信应用。</p>
          </div>
          <div v-if="selectedRuleAppIds.length > 1" class="rule-app-tabs" role="tablist">
            <button
              v-for="applicationId in selectedRuleAppIds"
              :key="applicationId"
              type="button"
              role="tab"
              :aria-selected="applicationId === activeRuleAppId"
              :class="{ active: applicationId === activeRuleAppId }"
              @click="setActiveRuleApp(applicationId)"
            >
              {{ applicationName(applicationId) || `应用 ${applicationId}` }}
            </button>
          </div>
          <p v-if="activeEditor?.manifestError" class="assignment-empty" role="alert">
            加载权限清单失败：{{ activeEditor.manifestError }}。请先在「可信应用管理」中为该应用登记权限清单，再配置规则。
          </p>
          <form v-else-if="activeEditor" class="drawer-form" @submit.prevent="submitRule">
            <p class="picker-group-title">
              {{ activeEditor.ruleExists ? '已配置规则，保存为全量替换' : '尚未配置规则，勾选后保存即创建' }}
            </p>
            <div class="picker-group">
              <p class="picker-group-title">页面权限编码（已勾选 {{ activeEditor.pagePermissions.size }}/{{ activeEditor.manifest?.pagePermissions.length ?? 0 }}）</p>
              <div v-if="activeEditor.manifest?.pagePermissions.length" class="picker-options">
                <label v-for="code in activeEditor.manifest.pagePermissions" :key="code">
                  <input
                    type="checkbox"
                    :checked="activeEditor.pagePermissions.has(code)"
                    :disabled="activeEditor.pending"
                    @change="toggleRuleCode('pagePermissions', code)"
                  >
                  <span>{{ code }}</span>
                </label>
              </div>
              <p v-else class="picker-empty">清单未申报页面权限编码</p>
            </div>
            <div class="picker-group">
              <p class="picker-group-title">API 权限编码（已勾选 {{ activeEditor.apiPermissions.size }}/{{ activeEditor.manifest?.apiPermissions.length ?? 0 }}）</p>
              <div v-if="activeEditor.manifest?.apiPermissions.length" class="picker-options">
                <label v-for="code in activeEditor.manifest.apiPermissions" :key="code">
                  <input
                    type="checkbox"
                    :checked="activeEditor.apiPermissions.has(code)"
                    :disabled="activeEditor.pending"
                    @change="toggleRuleCode('apiPermissions', code)"
                  >
                  <span>{{ code }}</span>
                </label>
              </div>
              <p v-else class="picker-empty">清单未申报 API 权限编码</p>
            </div>
            <div class="picker-group">
              <p class="picker-group-title">数据授权模板（各角色并集后投影给用户）</p>
              <div v-if="activeEditor.manifest?.dataResources.length || activeEditor.grantRows.length" class="rule-grant-list">
                <div v-for="(grant, grantIndex) in activeEditor.grantRows" :key="grantIndex" class="rule-grant-card">
                  <header class="rule-grant-header">
                    <FormSelect
                      v-model="grant.resource"
                      :options="grantResourceSelectOptions(grant)"
                      :disabled="activeEditor.pending"
                      aria-label="数据资源"
                      @change="changeGrantResource(grantIndex)"
                    />
                    <button class="button-secondary" type="button" :disabled="ruleSaving || activeEditor.pending" @click="activeEditor.grantRows.splice(grantIndex, 1)">删除授权</button>
                  </header>
                  <div v-if="grantActionOptions(grant).length" class="picker-options">
                    <label v-for="option in grantActionOptions(grant)" :key="option.value">
                      <input
                        type="checkbox"
                        :checked="grant.actions.has(option.value)"
                        :disabled="activeEditor.pending"
                        @change="toggleGrantAction(grantIndex, option.value)"
                      >
                      <span>{{ option.declared ? option.value : `${option.value}（未申报）` }}</span>
                    </label>
                  </div>
                  <label class="checkbox-field">
                    <input v-model="grant.all" type="checkbox" :disabled="activeEditor.pending">
                    <span>全量数据（不设约束）</span>
                  </label>
                  <template v-if="!grant.all">
                    <div v-for="(constraint, constraintIndex) in grant.constraints" :key="constraintIndex" class="rule-constraint-row">
                      <FormSelect
                        v-model="constraint.dimension"
                        :options="grantDimensionSelectOptions(grant)"
                        :disabled="activeEditor.pending"
                        aria-label="约束维度"
                      />
                      <input v-model="constraint.values" :disabled="activeEditor.pending" placeholder="维度值，逗号分隔" />
                      <button class="button-secondary" type="button" :disabled="ruleSaving || activeEditor.pending" @click="grant.constraints.splice(constraintIndex, 1)">删除</button>
                    </div>
                    <button class="button-secondary rule-constraint-add" type="button" :disabled="ruleSaving || activeEditor.pending" @click="addGrantConstraint(grantIndex)">添加约束</button>
                  </template>
                </div>
                <button class="button-secondary" type="button" :disabled="ruleSaving || activeEditor.pending" @click="addGrantRow">添加数据授权</button>
              </div>
              <p v-else class="picker-empty">清单未申报 DATA 资源，无法配置数据授权。</p>
            </div>
            <footer class="drawer-actions">
              <button v-if="activeEditor.ruleExists" class="button-secondary" type="button" :disabled="roleWritePending || !roleVersionReady || activeEditor.pending" @click="clearRule">删除此应用规则</button>
              <button class="button-primary" type="submit" :disabled="roleWritePending || !roleVersionReady || activeEditor.pending || !activeEditor.manifest">
                {{ ruleSaving ? '正在保存…' : `保存规则${selectedRuleAppIds.length > 1 ? `（${selectedRuleAppIds.length} 个应用）` : ''}` }}
              </button>
            </footer>
          </form>
          <p v-else class="assignment-empty">勾选应用后按其权限清单配置页面、接口与数据权限。</p>
        </section>
      </template>
    </EntityDrawer>

    <ConfirmDialog
      :open="!!revokePermissionTarget"
      title="移除角色权限"
      :description="`将从“${currentRole?.name || ''}”移除“${revokePermissionTarget?.name || ''}”。拥有该角色的成员将失去这项访问范围。`"
      :pending="permissionPending"
      confirm-label="确认移除"
      @close="revokePermissionTarget = null"
      @confirm="confirmRevokePermission"
    />

    <ConfirmDialog
      :open="!!revokeMemberTarget"
      title="移除角色成员"
      :description="`将撤销“${revokeMemberTarget?.displayName || revokeMemberTarget?.username || ''}”的“${currentRole?.name || ''}”角色。`"
      :pending="memberRevoking"
      confirm-label="确认移除"
      @close="revokeMemberTarget = null"
      @confirm="confirmRevokeMember"
    />

    <ConfirmDialog
      :open="!!deleteTarget"
      title="删除角色"
      :description="deleteDescription"
      :pending="deletePending"
      @close="deleteTarget = null"
      @confirm="confirmDeleteRole"
    />
  </section>
</template>
