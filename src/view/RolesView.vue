<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
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
  fetchRoleAuthorizationRule,
  fetchRoleDepartments,
  fetchRoleMemberPage,
  fetchRolePage,
  fetchRolePermissions,
  fetchUserGroupUsers,
  fetchUserGroups,
  fetchUsers,
  permissionTypeLabel,
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
  type RoleAuthorizationRule,
  type TrustedApplication
} from '../api/iamAuth';

const roles = ref<IamRole[]>([]);
const allPermissions = ref<IamPermission[]>([]);
const currentRole = ref<IamRole | null>(null);
const assignedPermissions = ref<IamPermission[]>([]);
const roleMembers = ref<IamUser[]>([]);
const roleDepartments = ref<IamDepartment[]>([]);
const message = ref('');
const errorMessage = ref('');
const roleKeyword = ref('');
const permissionKeyword = ref('');
const createDrawerOpen = ref(false);
const detailDrawerOpen = ref(false);
const deleteTarget = ref<IamRole | null>(null);
const deleteMemberCount = ref<number | null>(null);
const revokePermissionTarget = ref<IamPermission | null>(null);
const deletePending = ref(false);
const submitting = ref(false);
const permissionPending = ref(false);

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
const memberSelectedIds = ref<Set<number>>(new Set());
const memberCandidatePending = ref(false);
const memberAdding = ref(false);
const memberAddFailures = ref<string[]>([]);
const departments = ref<IamDepartment[]>([]);
const userGroups = ref<IamUserGroup[]>([]);
const revokeMemberTarget = ref<IamUser | null>(null);
const memberRevoking = ref(false);

const roleMemberIds = computed(() => new Set(roleMembers.value.map(user => user.id)));
const memberSelectedCount = computed(() => memberSelectedIds.value.size);

async function openMemberPicker() {
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
  const existingIds = new Set(memberCandidates.value.map(user => user.id));
  const additions = users.filter(user => !existingIds.has(user.id));
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
    page.content.forEach(user => next.add(user.id));
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
    users.forEach(user => next.add(user.id));
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

function toggleMemberCandidate(userId: number) {
  const next = new Set(memberSelectedIds.value);
  if (next.has(userId)) {
    next.delete(userId);
  } else {
    next.add(userId);
  }
  memberSelectedIds.value = next;
}

// 分批并发（5 个一批）循环调既有单人绑定接口；失败逐个反馈，已成功的不回滚
async function confirmAddMembers() {
  if (!currentRole.value) {
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
    const results = await Promise.allSettled(batch.map(userId => assignUserRole(userId, role.id)));
    results.forEach((result, batchIndex) => {
      if (result.status === 'rejected') {
        const user = memberCandidates.value.find(candidate => candidate.id === batch[batchIndex]);
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
  if (!currentRole.value || !revokeMemberTarget.value) {
    return;
  }
  const role = currentRole.value;
  const target = revokeMemberTarget.value;
  memberRevoking.value = true;
  errorMessage.value = '';
  try {
    await revokeUserRole(target.id, role.id);
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
  const promise = fetchRoleAuthorizationRule(roleId, applicationId).then(rule => {
    if (rule) {
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

const filteredRoles = computed(() => {
  const keyword = roleKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return roles.value;
  }
  return roles.value.filter(role =>
    [role.code, role.name, role.description || ''].some(value => value.toLowerCase().includes(keyword)));
});

// 合并开关：勾选 = 组内缺的码逐个补发；取消（含半选态点击）= 组内已绑的码逐个撤销；
// 部分失败时列出码名，已生效的不回滚
async function togglePermissionGroup(row: PermissionGroupRow) {
  if (!currentRole.value || permissionPending.value) {
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

async function loadRoles() {
  errorMessage.value = '';
  try {
    const [rolePage, permissionList] = await Promise.all([
      fetchRolePage({ page: 1, size: 100 }),
      fetchPermissions()
    ]);
    roles.value = rolePage.content;
    allPermissions.value = permissionList;
    if (currentRole.value) {
      const refreshed = roles.value.find(role => role.id === currentRole.value?.id);
      if (refreshed) {
        await openRoleDetail(refreshed, false);
      } else {
        closeRoleDetail();
      }
    }
  } catch (error) {
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
    await loadRoles();
    const target = roles.value.find(role => role.id === created.id) || created;
    await openRoleDetail(target);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建角色失败';
  } finally {
    submitting.value = false;
  }
}

async function openRoleDetail(role: IamRole, openDrawer = true) {
  errorMessage.value = '';
  currentRole.value = role;
  Object.assign(editForm, { name: role.name, description: role.description || '' });
  try {
    const [permissions, memberPage, departments] = await Promise.all([
      fetchRolePermissions(role.id),
      fetchRoleMemberPage(role.id, { page: 1, size: 100 }),
      fetchRoleDepartments(role.id)
    ]);
    assignedPermissions.value = permissions;
    roleMembers.value = memberPage.content;
    roleDepartments.value = departments;
    if (openDrawer) {
      detailDrawerOpen.value = true;
      resetRuleEditor();
      void loadRuleApplications();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载角色详情失败';
  }
}

function closeRoleDetail() {
  detailDrawerOpen.value = false;
  currentRole.value = null;
  assignedPermissions.value = [];
  roleMembers.value = [];
  roleDepartments.value = [];
  permissionKeyword.value = '';
  memberPickerOpen.value = false;
  resetRuleEditor();
}

function resetRuleEditor() {
  ruleEditors.value = new Map();
  activeRuleAppId.value = '';
  roleProjectionRules.value = new Map();
  roleProjectionRuleRequests = new Map();
}

async function loadRuleApplications() {
  try {
    ruleApplications.value = await fetchAllTrustedApplications();
    // 默认选中第一个应用，避免进来先空选一次；已有勾选时不覆盖
    const first = ruleApplications.value[0];
    if (first && ruleEditors.value.size === 0) {
      void toggleRuleApplication(first.id);
    }
    void loadRoleProjectionRules();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载可信应用失败';
  }
}

// 效果预览用：为每个可信应用查询该角色的已保存规则；无规则 404 是既有契约，直接跳过不存 Map
// 复用 ensureRoleProjectionRule 缓存，避免与 toggleRuleApplication 默认选中首个应用时重复打接口
async function loadRoleProjectionRules() {
  const role = currentRole.value;
  if (!role) {
    return;
  }
  try {
    await Promise.all(ruleApplications.value.map(application => ensureRoleProjectionRule(role.id, application.id)));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载角色效果预览失败';
  }
}

// 勾选/取消一个应用的编辑器：勾选即初始化并拉清单+存量规则，取消即整体移除
async function toggleRuleApplication(applicationId: number) {
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
    if (manifest === null) {
      editor.manifestError = '该应用尚未登记权限清单';
      return;
    }
    editor.manifest = manifest;
    const rule = await ensureRoleProjectionRule(currentRole.value.id, applicationId);
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
  if (!currentRole.value) {
    return;
  }
  const targets = [...ruleEditors.value.entries()].filter(([, editor]) => editor.manifest);
  if (!targets.length) {
    return;
  }
  ruleSaving.value = true;
  message.value = '';
  errorMessage.value = '';
  const failed: string[] = [];
  for (const [applicationId, editor] of targets) {
    try {
      const saved = await putRoleAuthorizationRule(currentRole.value.id, applicationId, {
        pagePermissions: [...editor.pagePermissions],
        apiPermissions: [...editor.apiPermissions],
        dataGrantTemplate: templateFromGrantRows(editor)
      });
      editor.ruleExists = true;
      editor.pagePermissions = new Set(saved.pagePermissions);
      editor.apiPermissions = new Set(saved.apiPermissions);
      editor.grantRows = grantRowsFromTemplate(saved.dataGrantTemplate);
      const next = new Map(roleProjectionRules.value);
      next.set(applicationId, saved);
      roleProjectionRules.value = next;
    } catch (error) {
      failed.push(applicationName(applicationId) || `应用 ${applicationId}`);
      void error;
    }
  }
  ruleSaving.value = false;
  if (failed.length) {
    errorMessage.value = `以下应用的授权规则保存失败：${failed.join('、')}`;
  } else {
    message.value = `已保存 ${targets.length} 个应用的授权规则`;
  }
}

function applicationName(applicationId: number): string {
  const application = ruleApplications.value.find(item => item.id === applicationId);
  return application ? application.applicationName : '';
}

async function clearRule() {
  if (!currentRole.value || activeRuleAppId.value === '') {
    return;
  }
  ruleSaving.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteRoleAuthorizationRule(currentRole.value.id, activeRuleAppId.value);
    const editor = ruleEditors.value.get(activeRuleAppId.value);
    if (editor) {
      editor.ruleExists = false;
      editor.pagePermissions = new Set();
      editor.apiPermissions = new Set();
      editor.grantRows = [];
    }
    const next = new Map(roleProjectionRules.value);
    next.delete(activeRuleAppId.value);
    roleProjectionRules.value = next;
    message.value = '应用授权规则已删除';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除授权规则失败';
  } finally {
    ruleSaving.value = false;
  }
}

async function submitRoleEdit() {
  if (!currentRole.value) {
    return;
  }
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    currentRole.value = await updateRole(currentRole.value.id, { ...editForm });
    message.value = '角色已更新';
    await loadRoles();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新角色失败';
  } finally {
    submitting.value = false;
  }
}

function requestDeleteRole(role: IamRole) {
  deleteTarget.value = role;
  deleteMemberCount.value = null;
  fetchRoleMemberPage(role.id, { page: 1, size: 1 })
    .then(page => {
      deleteMemberCount.value = page.totalElements;
    })
    .catch(() => {
      deleteMemberCount.value = null;
    });
}

async function confirmDeleteRole() {
  if (!deleteTarget.value) {
    return;
  }
  deletePending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteRole(deleteTarget.value.id);
    if (currentRole.value?.id === deleteTarget.value.id) {
      closeRoleDetail();
    }
    message.value = '角色已删除';
    deleteTarget.value = null;
    deleteMemberCount.value = null;
    await loadRoles();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除角色失败';
  } finally {
    deletePending.value = false;
  }
}

function requestRevokePermission(permission: IamPermission) {
  revokePermissionTarget.value = permission;
}

async function confirmRevokePermission() {
  if (!currentRole.value || !revokePermissionTarget.value) {
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
          <h2>全部角色 <span>{{ filteredRoles.length }}</span></h2>
          <p>选择一个角色以查看其权限范围和配置。</p>
        </div>
        <label class="search-field">
          <span class="sr-only">搜索角色</span>
          <input v-model="roleKeyword" type="search" placeholder="搜索编码、名称或描述">
        </label>
      </header>
      <div class="responsive-table">
        <table>
          <thead>
            <tr>
              <th>角色</th>
              <th>说明</th>
              <th>类型</th>
              <th class="table-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in filteredRoles" :key="role.id" :class="{ selected: currentRole?.id === role.id }">
              <td>
                <button class="table-primary-action" type="button" @click="openRoleDetail(role)">
                  <strong>{{ role.name }}</strong>
                  <span>{{ role.code }}</span>
                </button>
              </td>
              <td>{{ role.description || '未填写角色说明' }}</td>
              <td>
                <span class="status-badge" :class="role.builtIn === 1 ? 'warning' : ''">
                  {{ role.builtIn === 1 ? '内置角色' : '自定义角色' }}
                </span>
              </td>
              <td class="table-actions">
                <button class="table-action" type="button" @click="openRoleDetail(role)">查看</button>
                <button v-if="role.builtIn !== 1" class="table-action danger" type="button" @click="requestDeleteRole(role)">删除</button>
              </td>
            </tr>
            <tr v-if="filteredRoles.length === 0">
              <td colspan="4"><div class="table-empty">没有找到匹配的角色。</div></td>
            </tr>
          </tbody>
        </table>
      </div>
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

    <EntityDrawer :open="detailDrawerOpen" :pending="submitting" wide :title="currentRole ? currentRole.name : '角色详情'" :description="currentRole?.code" @close="closeRoleDetail">
      <template v-if="currentRole">
        <div class="drawer-status-line">
          <span class="status-badge" :class="currentRole.builtIn === 1 ? 'warning' : ''">{{ currentRole.builtIn === 1 ? '内置角色' : '自定义角色' }}</span>
          <span v-if="currentRole.builtIn === 1">内置角色不能删除</span>
        </div>
        <form class="drawer-form" @submit.prevent="submitRoleEdit">
          <label><span>角色名称</span><input v-model="editForm.name" required></label>
          <label><span>角色说明</span><textarea v-model="editForm.description"></textarea></label>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存基本信息' }}</button>
        </form>
        <section class="assignment-section">
          <header>
            <div>
              <h3>角色成员 <span>{{ roleMembers.length }}</span></h3>
              <p>当前持有该角色的用户。</p>
            </div>
            <button class="button-secondary" type="button" @click="openMemberPicker">添加成员</button>
          </header>
          <div v-if="roleMembers.length" class="assignment-list">
            <article v-for="user in roleMembers" :key="user.id">
              <div>
                <strong>{{ user.displayName || user.username }}</strong>
                <span>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}</span>
              </div>
              <div class="drawer-status-line">
                <span class="status-badge" :class="user.status === 1 ? '' : 'muted'">{{ user.status === 1 ? '启用' : '禁用' }}</span>
                <button type="button" class="table-action danger" @click="requestRevokeMember(user)">移除</button>
              </div>
            </article>
          </div>
          <p v-else class="assignment-empty">暂无成员持有该角色。</p>
          <div v-if="memberPickerOpen" class="member-picker">
            <span class="member-picker-title">按部门或协作组一键带出人员，再单个剔除；关键字可补充搜索</span>
            <div class="member-picker-filter-bar">
              <label>
                <span class="sr-only">按部门筛选</span>
                <select v-model="memberCandidateDepartmentId" :disabled="memberCandidatePending" @change="applyMemberDepartmentFilter">
                  <option value="">选择部门…</option>
                  <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
                </select>
              </label>
              <label>
                <span class="sr-only">按协作组筛选</span>
                <select v-model="memberCandidateGroupId" :disabled="memberCandidatePending" @change="applyMemberGroupFilter">
                  <option value="">选择协作组…</option>
                  <option v-for="group in userGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
                </select>
              </label>
              <label class="search-field">
                <span class="sr-only">按关键字搜索</span>
                <input v-model="memberCandidateKeyword" type="search" placeholder="搜索用户名 / 显示名" :disabled="memberCandidatePending" @keyup.enter="searchMemberCandidates">
              </label>
            </div>
            <p v-if="memberCandidatePending" class="member-picker-status">正在加载…</p>
            <p v-else-if="!memberCandidates.length" class="member-picker-status">选择部门/协作组或搜索关键字以列出候选人。</p>
            <div v-else class="member-option-list">
              <label v-for="user in memberCandidates" :key="user.id" class="member-option" :class="{ muted: roleMemberIds.has(user.id) }">
                <input
                  type="checkbox"
                  :checked="memberSelectedIds.has(user.id) || roleMemberIds.has(user.id)"
                  :disabled="roleMemberIds.has(user.id)"
                  @change="toggleMemberCandidate(user.id)"
                >
                <span>
                  <strong>{{ user.displayName || user.username }}</strong>
                  <small>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}{{ roleMemberIds.has(user.id) ? ' · 已是成员' : '' }}</small>
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
            <article v-for="department in roleDepartments" :key="department.id">
              <div>
                <strong>{{ department.name }}</strong>
                <span>{{ department.code }}</span>
              </div>
            </article>
          </div>
          <p v-else class="assignment-empty">尚无部门挂载该角色。</p>
        </section>
        <section class="assignment-section">
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
            <p class="picker-group-title">可信应用（可多选，每个应用单独配置）</p>
            <div v-if="ruleApplications.length" class="picker-options">
              <label v-for="application in ruleApplications" :key="application.id">
                <input
                  type="checkbox"
                  :checked="ruleEditors.has(application.id)"
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
                    <select v-model="grant.resource" :disabled="activeEditor.pending" @change="changeGrantResource(grantIndex)">
                      <option v-for="option in grantResourceOptions(grant)" :key="option.value" :value="option.value">
                        {{ option.declared ? option.value : `${option.value}（清单未申报）` }}
                      </option>
                    </select>
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
                      <select v-model="constraint.dimension" :disabled="activeEditor.pending">
                        <option v-for="option in grantDimensionOptions(grant)" :key="option.value" :value="option.value">
                          {{ option.declared ? option.value : `${option.value}（未申报）` }}
                        </option>
                      </select>
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
              <button v-if="activeEditor.ruleExists" class="button-secondary" type="button" :disabled="ruleSaving || activeEditor.pending" @click="clearRule">删除此应用规则</button>
              <button class="button-primary" type="submit" :disabled="ruleSaving || activeEditor.pending || !activeEditor.manifest">
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
