<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import DashboardIcon from '../components/DashboardIcon.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  assignDepartmentRole,
  assignUserGroupUser,
  assignUserRole,
  createDepartment,
  createUser,
  deleteDepartment,
  fetchDepartmentRoles,
  fetchOrganizationDepartmentWorkspace,
  fetchOrganizationTree,
  fetchOrganizationUserProfile,
  fetchRoles,
  fetchUsers,
  fetchUserGroups,
  fetchDepartments,
  permissionTypeLabel,
  revokeDepartmentRole,
  revokeUserGroupUser,
  revokeUserRole,
  roleSourceLabel,
  updateDepartment,
  updateUser,
  type IamDepartment,
  type IamRole,
  type IamUser,
  type IamUserGroup,
  type OrganizationDepartmentWorkspace,
  type OrganizationTreeNode,
  type OrganizationUserProfile
} from '../api/iamAuth';

interface TreeRow { node: OrganizationTreeNode; depth: number; }

const router = useRouter();
const tree = ref<OrganizationTreeNode[]>([]);
const workspace = ref<OrganizationDepartmentWorkspace | null>(null);
const departmentRoles = ref<IamRole[]>([]);
const profile = ref<OrganizationUserProfile | null>(null);
const departments = ref<IamDepartment[]>([]);
const allGroups = ref<IamUserGroup[]>([]);
const allRoles = ref<IamRole[]>([]);
const selectedDepartmentId = ref<number | null>(null);
const loading = ref(false);
const submitting = ref(false);
const departmentDrawerOpen = ref(false);
const departmentDrawerMode = ref<'root' | 'child'>('child');
const memberDrawerOpen = ref(false);
const addMemberDrawerOpen = ref(false);
const addMemberSelectedIds = ref<Set<number>>(new Set());
const removeMemberTarget = ref<IamUser | null>(null);
const removeMemberPending = ref(false);
const profileDrawerOpen = ref(false);
const editDrawerOpen = ref(false);
const deleteDialogOpen = ref(false);
const deletePending = ref(false);
const relationshipTarget = ref<{ type: 'group' | 'role' | 'departmentRole'; id: number; name: string } | null>(null);
const relationshipPending = ref(false);
const message = ref('');
const errorMessage = ref('');
const createDepartmentForm = reactive({ code: '', name: '', sortOrder: 0 });
const editDepartmentForm = reactive({ name: '', sortOrder: 0, status: 1, parentId: '' });
const createUserForm = reactive({ username: '', password: '', displayName: '', email: '', phone: '' });
const memberQuery = reactive({ keyword: '', status: '' as '' | '1' | '0', page: 1 });
const memberTotalPages = ref(1);
const memberPageSize = ref(10);
const pickerKeyword = ref('');
const departmentForm = reactive({ id: '', name: '' });
const bindableUsers = ref<IamUser[]>([]);
const memberOptionsLoading = ref(false);
const selectedMemberIds = ref<Set<number>>(new Set());

const treeSearchKeyword = ref('');
const treeRows = computed<TreeRow[]>(() => {
  const keyword = treeSearchKeyword.value.trim().toLowerCase();
  const rows: TreeRow[] = [];
  const append = (nodes: OrganizationTreeNode[], depth: number) => nodes.forEach(node => {
    if (keyword) {
      if (node.name.toLowerCase().includes(keyword) || node.code.toLowerCase().includes(keyword)) {
        rows.push({ node, depth });
      }
      append(node.children, depth);
    } else {
      rows.push({ node, depth });
      append(node.children, depth + 1);
    }
  });
  append(tree.value, 0);
  return rows;
});
const assignedGroupIds = computed(() => new Set(profile.value?.userGroups.map(group => group.id) || []));
const assignedRoleIds = computed(() => new Set(profile.value?.roles.map(role => role.id) || []));
const assignableGroupQuery = ref('');
const assignableRoleQuery = ref('');
const assignableGroups = computed(() => {
  const keyword = assignableGroupQuery.value.trim().toLowerCase();
  return allGroups.value
    .filter(group => !assignedGroupIds.value.has(group.id))
    .filter(group => !keyword || group.name.toLowerCase().includes(keyword) || group.code.toLowerCase().includes(keyword));
});
const assignableRoles = computed(() => {
  const keyword = assignableRoleQuery.value.trim().toLowerCase();
  return allRoles.value
    .filter(role => !assignedRoleIds.value.has(role.id))
    .filter(role => !keyword || role.name.toLowerCase().includes(keyword) || role.code.toLowerCase().includes(keyword));
});
const assignedDepartmentRoleIds = computed(() => new Set(departmentRoles.value.map(role => role.id)));
const addableUsers = computed(() => bindableUsers.value.filter(user => user.departmentId !== selectedDepartmentId.value));
const assignableDepartmentRoleQuery = ref('');
const assignableDepartmentRoles = computed(() => {
  const keyword = assignableDepartmentRoleQuery.value.trim().toLowerCase();
  return allRoles.value
    .filter(role => !assignedDepartmentRoleIds.value.has(role.id))
    .filter(role => !keyword || role.name.toLowerCase().includes(keyword) || role.code.toLowerCase().includes(keyword));
});

function departmentDescendantIds(departmentId: number): Set<number> {
  const ids = new Set<number>([departmentId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const department of departments.value) {
      if (department.parentId !== null && ids.has(department.parentId) && !ids.has(department.id)) {
        ids.add(department.id);
        expanded = true;
      }
    }
  }
  return ids;
}

const editableParentDepartments = computed(() => {
  const current = workspace.value?.department;
  if (!current) return departments.value;
  const excluded = departmentDescendantIds(current.id);
  return departments.value.filter(department => !excluded.has(department.id));
});

function resetChildDepartmentForm() {
  Object.assign(createDepartmentForm, { code: '', name: '', sortOrder: 0 });
  selectedMemberIds.value = new Set();
}

function toggleMember(userId: number) {
  const next = new Set(selectedMemberIds.value);
  if (next.has(userId)) {
    next.delete(userId);
  } else {
    next.add(userId);
  }
  selectedMemberIds.value = next;
}
function resetMemberForm() { Object.assign(createUserForm, { username: '', password: '', displayName: '', email: '', phone: '' }); }
function closeDepartmentDrawer() { if (!submitting.value) { departmentDrawerOpen.value = false; resetChildDepartmentForm(); } }
function closeMemberDrawer() { if (!submitting.value) { memberDrawerOpen.value = false; resetMemberForm(); } }
function closeProfileDrawer() {
  if (!submitting.value) {
    profileDrawerOpen.value = false;
    profile.value = null;
    assignableGroupQuery.value = '';
    assignableRoleQuery.value = '';
  }
}

function goToUsersView() {
  if (!profile.value) return;
  const username = profile.value.user.username;
  profileDrawerOpen.value = false;
  void router.push({ path: '/users', query: { keyword: username } });
}

async function loadWorkspace(departmentId: number, page = memberQuery.page) {
  loading.value = true;
  errorMessage.value = '';
  try {
    selectedDepartmentId.value = departmentId;
    memberQuery.page = page;
    const [workspaceResult, roles] = await Promise.all([
      fetchOrganizationDepartmentWorkspace(departmentId, {
        page,
        size: memberPageSize.value,
        keyword: memberQuery.keyword || undefined,
        status: memberQuery.status === '' ? undefined : Number(memberQuery.status)
      }),
      fetchDepartmentRoles(departmentId)
    ]);
    workspace.value = workspaceResult;
    departmentRoles.value = roles;
    memberTotalPages.value = Math.max(workspace.value.members.totalPages, 1);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    loading.value = false;
  }
}

function selectDepartment(departmentId: number) {
  memberQuery.keyword = '';
  memberQuery.status = '';
  void loadWorkspace(departmentId, 1);
}

function changeMemberPage(page: number) {
  if (!selectedDepartmentId.value || page < 1 || page > memberTotalPages.value || page === memberQuery.page) return;
  void loadWorkspace(selectedDepartmentId.value, page);
}

function changeMemberPageSize(size: number) {
  if (!selectedDepartmentId.value || size < 1 || size === memberPageSize.value) return;
  memberPageSize.value = size;
  void loadWorkspace(selectedDepartmentId.value, 1);
}

function resetMemberPageAndLoad() {
  if (selectedDepartmentId.value) void loadWorkspace(selectedDepartmentId.value, 1);
}

async function loadTree(selectDefault = false) {
  tree.value = await fetchOrganizationTree();
  if (selectDefault && !selectedDepartmentId.value && tree.value.length) await loadWorkspace(tree.value[0].id);
}

async function loadInitialData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [departmentList, groups, roles] = await Promise.all([fetchDepartments(), fetchUserGroups(), fetchRoles()]);
    departments.value = departmentList;
    allGroups.value = groups;
    allRoles.value = roles;
    await loadTree(true);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await loadInitialData();
  if (selectedDepartmentId.value) await loadWorkspace(selectedDepartmentId.value);
}

async function createChildDepartment() {
  if (departmentDrawerMode.value === 'child' && !selectedDepartmentId.value) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await createDepartment({
      code: createDepartmentForm.code,
      name: createDepartmentForm.name,
      parentId: departmentDrawerMode.value === 'root' ? null : selectedDepartmentId.value,
      sortOrder: createDepartmentForm.sortOrder,
      status: 1,
      memberIds: [...selectedMemberIds.value]
    });
    departmentDrawerOpen.value = false;
    resetChildDepartmentForm();
    message.value = departmentDrawerMode.value === 'root' ? '根部门已创建' : '下级部门已创建';
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建部门失败';
  } finally {
    submitting.value = false;
  }
}

function searchBindableUsers() {
  memberOptionsLoading.value = true;
  fetchUsers({ size: 100, keyword: pickerKeyword.value || undefined })
    .then(page => { bindableUsers.value = page.content; })
    .catch(() => { bindableUsers.value = []; })
    .finally(() => { memberOptionsLoading.value = false; });
}

function openDepartmentDrawer(mode: 'root' | 'child') {
  departmentDrawerMode.value = mode;
  departmentDrawerOpen.value = true;
  if (!bindableUsers.value.length) searchBindableUsers();
}

function openEditDrawer() {
  const department = workspace.value?.department;
  if (!department) return;
  Object.assign(editDepartmentForm, {
    name: department.name,
    sortOrder: department.sortOrder,
    status: department.status,
    parentId: department.parentId === null ? '' : String(department.parentId)
  });
  editDrawerOpen.value = true;
}

function closeEditDrawer() { if (!submitting.value) { editDrawerOpen.value = false; } }

async function saveDepartmentEdit() {
  const department = workspace.value?.department;
  if (!department) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await updateDepartment(department.id, {
      name: editDepartmentForm.name,
      parentId: editDepartmentForm.parentId === '' ? null : Number(editDepartmentForm.parentId),
      sortOrder: editDepartmentForm.sortOrder,
      status: editDepartmentForm.status
    });
    editDrawerOpen.value = false;
    message.value = '部门已更新';
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新部门失败';
  } finally {
    submitting.value = false;
  }
}

function closeDeleteDialog() { if (!deletePending.value) { deleteDialogOpen.value = false; } }

async function confirmDeleteDepartment() {
  const department = workspace.value?.department;
  if (!department) return;
  deletePending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const parentId = department.parentId;
    await deleteDepartment(department.id);
    deleteDialogOpen.value = false;
    message.value = `部门“${department.name}”已删除`;
    selectedDepartmentId.value = null;
    await loadInitialData();
    if (parentId !== null && departments.value.some(item => item.id === parentId)) {
      await loadWorkspace(parentId);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除部门失败';
    deleteDialogOpen.value = false;
  } finally {
    deletePending.value = false;
  }
}

async function createDepartmentUser() {
  if (!selectedDepartmentId.value) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await createUser({ username: createUserForm.username, password: createUserForm.password, displayName: createUserForm.displayName, email: createUserForm.email, phone: createUserForm.phone, departmentId: selectedDepartmentId.value });
    memberDrawerOpen.value = false;
    resetMemberForm();
    message.value = '成员已创建并归属当前部门';
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建成员失败';
  } finally {
    submitting.value = false;
  }
}

async function openUserProfile(user: IamUser) {
  loading.value = true;
  errorMessage.value = '';
  try {
    profile.value = await fetchOrganizationUserProfile(user.id);
    departmentForm.id = profile.value.user.departmentId ? String(profile.value.user.departmentId) : '';
    departmentForm.name = profile.value.user.displayName || '';
    profileDrawerOpen.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载成员详情失败';
  } finally {
    loading.value = false;
  }
}

async function updateUserDepartment() {
  if (!profile.value) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const departmentId = Number(departmentForm.id);
    await updateUser(profile.value.user.id, {
      displayName: departmentForm.name,
      email: profile.value.user.email || '',
      phone: profile.value.user.phone || '',
      departmentId: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
      clearDepartment: !departmentForm.id
    });
    message.value = '成员资料与所属部门已更新';
    await refresh();
    profile.value = await fetchOrganizationUserProfile(profile.value.user.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新成员归属失败';
  } finally {
    submitting.value = false;
  }
}

function openAddMemberDrawer() {
  addMemberSelectedIds.value = new Set();
  pickerKeyword.value = '';
  addMemberDrawerOpen.value = true;
  searchBindableUsers();
}

function closeAddMemberDrawer() { if (!submitting.value) { addMemberDrawerOpen.value = false; } }

function toggleAddMember(userId: number) {
  const next = new Set(addMemberSelectedIds.value);
  if (next.has(userId)) { next.delete(userId); } else { next.add(userId); }
  addMemberSelectedIds.value = next;
}

async function addSelectedMembers() {
  const department = workspace.value?.department;
  if (!department || !addMemberSelectedIds.value.size) return;
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const targets = bindableUsers.value.filter(user => addMemberSelectedIds.value.has(user.id));
    for (const user of targets) {
      await updateUser(user.id, {
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        departmentId: department.id,
        clearDepartment: false
      });
    }
    addMemberDrawerOpen.value = false;
    message.value = `已把 ${targets.length} 名成员加入${department.name}`;
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '添加成员失败';
  } finally {
    submitting.value = false;
  }
}

async function confirmRemoveMember() {
  const target = removeMemberTarget.value;
  if (!target) return;
  removeMemberPending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await updateUser(target.id, {
      displayName: target.displayName || '',
      email: target.email || '',
      phone: target.phone || '',
      departmentId: null,
      clearDepartment: true
    });
    removeMemberTarget.value = null;
    message.value = `已将 ${target.displayName || target.username} 移出部门`;
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '移除成员失败';
    removeMemberTarget.value = null;
  } finally {
    removeMemberPending.value = false;
  }
}

async function addUserGroup(groupId: number) {
  if (!profile.value) return;
  try {
    await assignUserGroupUser(groupId, profile.value.user.id);
    profile.value = await fetchOrganizationUserProfile(profile.value.user.id);
    message.value = '成员已加入协作组';
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : ''; }
}

async function addRole(roleId: number) {
  if (!profile.value) return;
  try {
    await assignUserRole(profile.value.user.id, roleId);
    profile.value = await fetchOrganizationUserProfile(profile.value.user.id);
    message.value = '直接角色已分配';
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : '分配角色失败'; }
}

async function addDepartmentRole(roleId: number) {
  if (!selectedDepartmentId.value) return;
  try {
    await assignDepartmentRole(selectedDepartmentId.value, roleId);
    departmentRoles.value = await fetchDepartmentRoles(selectedDepartmentId.value);
    message.value = '角色已挂载到部门，部门全体成员将继承该角色';
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : '挂载部门角色失败'; }
}

function requestRemoveUserGroup(group: IamUserGroup) { relationshipTarget.value = { type: 'group', id: group.id, name: group.name }; }
function requestRemoveRole(role: IamRole) { relationshipTarget.value = { type: 'role', id: role.id, name: role.name }; }
function requestRemoveDepartmentRole(role: IamRole) { relationshipTarget.value = { type: 'departmentRole', id: role.id, name: role.name }; }

async function confirmRemoveRelationship() {
  const target = relationshipTarget.value;
  if (!target) return;
  if (target.type !== 'departmentRole' && !profile.value) return;
  relationshipPending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    if (target.type === 'group') {
      await revokeUserGroupUser(target.id, profile.value!.user.id);
      message.value = '成员已移出协作组';
      profile.value = await fetchOrganizationUserProfile(profile.value!.user.id);
    } else if (target.type === 'role') {
      await revokeUserRole(profile.value!.user.id, target.id);
      message.value = '成员的直接角色已移除，有效权限会相应变化';
      profile.value = await fetchOrganizationUserProfile(profile.value!.user.id);
    } else {
      if (!selectedDepartmentId.value) throw new Error('未选中部门');
      await revokeDepartmentRole(selectedDepartmentId.value, target.id);
      departmentRoles.value = await fetchDepartmentRoles(selectedDepartmentId.value);
      message.value = '部门角色已撤销，该部门成员将不再继承此角色';
    }
    relationshipTarget.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '移除成员关系失败';
  } finally {
    relationshipPending.value = false;
  }
}

onMounted(loadInitialData);
</script>

<template>
  <section class="management-page">
    <AdminPageHeader title="组织与成员" description="从部门树进入成员管理；协作组用于跨部门成员集合，直接角色派生只读有效权限。" />
    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <section v-if="errorMessage" class="admin-message error dashboard-error" role="alert"><p>{{ errorMessage }}</p><button class="button-secondary" type="button" :disabled="loading" @click="refresh">重试加载</button></section>

    <section v-if="!loading && !tree.length" class="admin-empty-state"><DashboardIcon name="department" /><h2>尚未创建根部门</h2><p>当前实例没有可管理的组织节点。创建首个根部门后，即可在此维护直属成员和下级部门。</p><button class="button-primary" type="button" @click="openDepartmentDrawer('root')">创建首个根部门</button></section>

    <div v-else class="organization-layout" :aria-busy="loading">
      <aside class="organization-tree panel"><header class="workspace-heading"><div><h2>部门树</h2><p>选择部门后查看直属成员与子部门。</p></div></header><label class="search-field"><span class="sr-only">搜索部门</span><input v-model="treeSearchKeyword" type="search" placeholder="搜索部门名称或编码"></label><button v-for="row in treeRows" :key="row.node.id" type="button" class="tree-node" :class="{ selected: selectedDepartmentId === row.node.id }" :style="{ paddingLeft: `${16 + row.depth * 20}px` }" @click="selectDepartment(row.node.id)"><span>{{ row.node.name }}</span><small>{{ row.node.status === 1 ? '启用' : '停用' }} · {{ row.node.directMemberCount }} 人</small></button></aside>

      <div v-if="workspace" class="organization-workspace">
        <section class="admin-data-surface workspace-summary"><header class="data-toolbar"><div><h2>{{ workspace.department.name }}</h2><p>{{ workspace.department.code }} · {{ workspace.department.status === 1 ? '启用' : '停用' }} · 直属成员 {{ workspace.members.totalElements }} 人</p></div><div class="admin-page-actions"><button class="button-secondary" type="button" @click="openDepartmentDrawer('child')">新建下级部门</button><button class="button-secondary" type="button" @click="openEditDrawer">编辑部门</button><button class="button-danger" type="button" @click="deleteDialogOpen = true">删除部门</button><button class="button-primary" type="button" @click="memberDrawerOpen = true">创建成员</button></div></header></section>

        <section class="admin-data-surface"><header class="data-toolbar"><div><h2>直属子部门 <span>{{ workspace.directChildren.length }}</span></h2><p>这里仅展示当前部门的直接下级。</p></div></header><div v-if="workspace.directChildren.length" class="child-department-list"><button v-for="department in workspace.directChildren" :key="department.id" type="button" @click="selectDepartment(department.id)"><strong>{{ department.name }}</strong><span>{{ department.code }} · {{ department.status === 1 ? '启用' : '停用' }}</span></button></div><div v-else class="table-empty">暂无直属子部门。</div></section>

        <section class="admin-data-surface"><header class="data-toolbar"><div><h2>直属成员 <span>{{ workspace.members.totalElements }}</span></h2><p>成员详情中可维护部门、协作组和直接角色。</p></div><div class="admin-page-actions"><button class="button-secondary" type="button" @click="openAddMemberDrawer">添加成员</button></div></header><div class="data-toolbar user-filter-bar member-filter-bar"><input v-model="memberQuery.keyword" type="search" placeholder="搜索用户名 / 显示名" @keyup.enter="resetMemberPageAndLoad"><select v-model="memberQuery.status" @change="resetMemberPageAndLoad"><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></select></div><div class="responsive-table"><table><thead><tr><th>成员</th><th>状态</th><th class="table-actions">操作</th></tr></thead><tbody><tr v-for="user in workspace.members.content" :key="user.id"><td><button class="table-primary-action" type="button" @click="openUserProfile(user)"><strong>{{ user.displayName || user.username }}</strong><span>{{ user.username }}</span></button></td><td><span class="status-badge" :class="{ builtIn: user.status !== 1 }">{{ user.status === 1 ? '启用' : '停用' }}</span></td><td class="table-actions"><button class="table-action" type="button" @click="openUserProfile(user)">查看关系</button><button class="table-action danger" type="button" @click="removeMemberTarget = user">移除</button></td></tr><tr v-if="!workspace.members.content.length"><td colspan="3"><div class="table-empty">暂无符合条件的直属成员。</div></td></tr></tbody></table></div><Pagination v-if="workspace.members.totalElements > 0" :current="memberQuery.page" :total="workspace.members.totalElements" :page-size="memberPageSize" @update:current="changeMemberPage" @update:page-size="changeMemberPageSize" /></section>

        <section class="admin-data-surface assignment-section"><header><div><h3>部门角色 <span>{{ departmentRoles.length }}</span></h3><p>挂载到部门的角色由该部门全体成员自动继承，无需逐人分配；撤销时若涉及最后一位系统管理员会被拒绝。</p></div></header><div v-if="departmentRoles.length" class="assignment-list"><article v-for="role in departmentRoles" :key="role.id"><div><strong>{{ role.name }}</strong><span>{{ role.code }}</span></div><button class="table-action danger" type="button" @click="requestRemoveDepartmentRole(role)">撤销</button></article></div><p v-else class="assignment-empty">尚未挂载部门角色。</p><div v-if="allRoles.length > assignedDepartmentRoleIds.size" class="assignment-list available"><label class="search-field"><span class="sr-only">搜索可挂载角色</span><input v-model="assignableDepartmentRoleQuery" type="search" placeholder="搜索角色名称或编码"></label><article v-for="role in assignableDepartmentRoles" :key="role.id"><div><strong>{{ role.name }}</strong><span>{{ role.code }}</span></div><button class="table-action" type="button" @click="addDepartmentRole(role.id)">挂载</button></article></div></section>
      </div>
    </div>

    <EntityDrawer :open="departmentDrawerOpen" :pending="submitting" :title="departmentDrawerMode === 'root' ? '创建根部门' : '新建下级部门'" :description="departmentDrawerMode === 'root' ? '根部门是组织树的顶层节点，创建后可在其下继续建子部门和成员。' : (workspace ? `上级部门：${workspace.department.name}` : '')" @close="closeDepartmentDrawer"><form class="drawer-form" @submit.prevent="createChildDepartment"><label><span>部门编码</span><input v-model="createDepartmentForm.code" required :placeholder="departmentDrawerMode === 'root' ? '根部门编码' : '下级部门编码'"></label><label><span>部门名称</span><input v-model="createDepartmentForm.name" required :placeholder="departmentDrawerMode === 'root' ? '根部门名称' : '下级部门名称'"></label><label><span>排序值</span><input v-model.number="createDepartmentForm.sortOrder" type="number" min="0" placeholder="0"></label><div class="member-picker"><span class="member-picker-title">绑定已有成员（可选，创建后直接挂到新部门）</span><label class="search-field"><span class="sr-only">搜索可绑定成员</span><input v-model="pickerKeyword" type="search" placeholder="搜索用户名 / 显示名" @keyup.enter="searchBindableUsers"></label><p v-if="memberOptionsLoading" class="member-picker-status">正在加载成员列表...</p><p v-else-if="!bindableUsers.length" class="member-picker-status">暂无可绑定的成员。</p><div v-else class="member-option-list"><label v-for="user in bindableUsers" :key="user.id" class="member-option"><input type="checkbox" :checked="selectedMemberIds.has(user.id)" @change="toggleMember(user.id)"><span><strong>{{ user.displayName || user.username }}</strong><small>{{ user.username }} · {{ user.departmentName || '未分配部门' }}</small></span></label></div><p v-if="selectedMemberIds.size" class="member-picker-status">已选 {{ selectedMemberIds.size }} 人，创建时一并挂到新部门。</p></div><footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeDepartmentDrawer">取消</button><button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建部门' }}</button></footer></form></EntityDrawer>

    <EntityDrawer :open="editDrawerOpen" :pending="submitting" title="编辑部门" :description="workspace ? `${workspace.department.code} · 直属成员 ${workspace.members.totalElements} 人` : ''" @close="closeEditDrawer"><form class="drawer-form" @submit.prevent="saveDepartmentEdit"><label><span>部门名称</span><input v-model="editDepartmentForm.name" required placeholder="部门名称"></label><label><span>上级部门</span><select v-model="editDepartmentForm.parentId"><option value="">未分配（作为根部门）</option><option v-for="department in editableParentDepartments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label><label><span>排序值</span><input v-model.number="editDepartmentForm.sortOrder" type="number" min="0" placeholder="0"></label><label><span>状态</span><select v-model.number="editDepartmentForm.status"><option :value="1">启用</option><option :value="0">停用</option></select></label><footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeEditDrawer">取消</button><button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存修改' }}</button></footer></form></EntityDrawer>

    <EntityDrawer :open="memberDrawerOpen" :pending="submitting" title="创建成员" :description="workspace ? `创建后将直接归属 ${workspace.department.name}` : ''" @close="closeMemberDrawer"><form class="drawer-form" @submit.prevent="createDepartmentUser"><label><span>用户名</span><input v-model="createUserForm.username" required placeholder="用户名"></label><label><span>初始密码</span><input v-model="createUserForm.password" required type="password" autocomplete="new-password" placeholder="初始密码"><small>8-64 位，需包含大写字母、小写字母、数字与特殊字符。</small></label><label><span>显示名</span><input v-model="createUserForm.displayName" placeholder="显示名"></label><label><span>邮箱（可选）</span><input v-model="createUserForm.email" type="email" placeholder="user@example.com"></label><label><span>手机号（可选）</span><input v-model="createUserForm.phone" placeholder="手机号"></label><footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeMemberDrawer">取消</button><button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建成员' }}</button></footer></form></EntityDrawer>

    <EntityDrawer :open="addMemberDrawerOpen" :pending="submitting" title="添加已有成员" :description="workspace ? `选中的成员将加入 ${workspace.department.name}；从其他部门选中的成员会直接变更归属。` : ''" @close="closeAddMemberDrawer"><form class="drawer-form" @submit.prevent="addSelectedMembers"><div class="member-picker"><span class="member-picker-title">选择要加入本部门的成员</span><label class="search-field"><span class="sr-only">搜索可添加成员</span><input v-model="pickerKeyword" type="search" placeholder="搜索用户名 / 显示名" @keyup.enter="searchBindableUsers"></label><p v-if="memberOptionsLoading" class="member-picker-status">正在加载成员列表...</p><p v-else-if="!addableUsers.length" class="member-picker-status">暂无可添加的成员。</p><div v-else class="member-option-list"><label v-for="user in addableUsers" :key="user.id" class="member-option"><input type="checkbox" :checked="addMemberSelectedIds.has(user.id)" @change="toggleAddMember(user.id)"><span><strong>{{ user.displayName || user.username }}</strong><small>{{ user.username }} · {{ user.departmentName || '未分配部门' }}</small></span></label></div><p v-if="addMemberSelectedIds.size" class="member-picker-status">已选 {{ addMemberSelectedIds.size }} 人，添加后归属本部门。</p></div><footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeAddMemberDrawer">取消</button><button class="button-primary" type="submit" :disabled="submitting || !addMemberSelectedIds.size">{{ submitting ? '正在添加…' : `添加选中的 ${addMemberSelectedIds.size} 名成员` }}</button></footer></form></EntityDrawer>

    <EntityDrawer :open="profileDrawerOpen" :pending="submitting" wide :title="profile ? (profile.user.displayName || profile.user.username) : '成员关系'" :description="profile?.user.username" @close="closeProfileDrawer"><template v-if="profile"><form class="drawer-form" @submit.prevent="updateUserDepartment"><label><span>显示名</span><input v-model="departmentForm.name" placeholder="显示名"></label><label><span>所属部门</span><select v-model="departmentForm.id"><option value="">未分配部门</option><option v-for="department in departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option></select></label><button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存成员资料' }}</button></form><div class="admin-page-actions" style="margin-top:14px"><button class="button-secondary" type="button" @click="goToUsersView">在用户管理中查看</button></div><section class="assignment-section"><header><div><h3>协作组<span>{{ profile.userGroups.length }}</span></h3><p>协作组只用于成员协作和消息收件人扩展，不授予角色或权限。</p></div></header><div v-if="profile.userGroups.length" class="assignment-list"><article v-for="group in profile.userGroups" :key="group.id"><div><strong>{{ group.name }}</strong><span>{{ group.code }}</span></div><button class="table-action danger" type="button" @click="requestRemoveUserGroup(group)">移除</button></article></div><p v-else class="assignment-empty">尚未加入协作组。</p><div v-if="allGroups.length > assignedGroupIds.size" class="assignment-list available"><label class="search-field"><span class="sr-only">搜索可分配协作组</span><input v-model="assignableGroupQuery" type="search" placeholder="搜索协作组名称或编码"></label><article v-for="group in assignableGroups" :key="group.id"><div><strong>{{ group.name }}</strong><span>{{ group.code }}</span></div><button class="table-action" type="button" @click="addUserGroup(group.id)">添加</button></article></div></section><section class="assignment-section"><header><div><h3>有效角色 <span>{{ profile.roles.length }}</span></h3><p>包含个人直接分配的角色和通过所在部门继承的角色；有效权限由全部有效角色聚合、去重得到。</p></div></header><div v-if="profile.roles.length" class="assignment-list"><article v-for="role in profile.roles" :key="role.id"><div><strong>{{ role.name }}</strong><span>{{ role.code }} · {{ roleSourceLabel(role.source) }}</span></div><button v-if="role.source === 'direct'" class="table-action danger" type="button" @click="requestRemoveRole(role)">移除</button></article></div><p v-else class="assignment-empty">尚未分配角色。</p><div v-if="allRoles.length > assignedRoleIds.size" class="assignment-list available"><label class="search-field"><span class="sr-only">搜索可分配角色</span><input v-model="assignableRoleQuery" type="search" placeholder="搜索角色名称或编码"></label><article v-for="role in assignableRoles" :key="role.id"><div><strong>{{ role.name }}</strong><span>{{ role.code }}</span></div><button class="table-action" type="button" @click="addRole(role.id)">添加</button></article></div></section><section class="assignment-section"><header><div><h3>有效权限 <span>{{ profile.effectivePermissions.length }}</span></h3><p>由全部有效角色聚合、去重得到，仅供查看，不能在这里直接修改。</p></div></header><div v-if="profile.effectivePermissions.length" class="assignment-list"><article v-for="permission in profile.effectivePermissions" :key="permission.id"><div><strong>{{ permission.name }}</strong><span>{{ permission.code }} · {{ permissionTypeLabel(permission.type) }} · {{ roleSourceLabel(permission.source) }}</span></div></article></div><p v-else class="assignment-empty">暂无有效权限。</p></section></template></EntityDrawer>

    <ConfirmDialog :open="Boolean(relationshipTarget)" :title="relationshipTarget?.type === 'role' ? '移除直接角色' : (relationshipTarget?.type === 'departmentRole' ? '撤销部门角色' : '移出协作组')" :description="relationshipTarget?.type === 'role' ? `将移除“${relationshipTarget?.name || ''}”并改变该成员的有效权限。此操作无法撤销。` : (relationshipTarget?.type === 'departmentRole' ? `将撤销部门角色“${relationshipTarget?.name || ''}”，该部门全体成员将不再通过部门继承此角色。若该角色为系统保留的最后管理员角色，撤销可能被拒绝。` : `将把成员移出“${relationshipTarget?.name || ''}”。协作组不授予权限，仅解除成员关系。`)" :pending="relationshipPending" confirm-label="确认移除" @close="relationshipTarget = null" @confirm="confirmRemoveRelationship" />

    <ConfirmDialog :open="Boolean(removeMemberTarget)" title="移出部门" :description="removeMemberTarget ? `将把“${removeMemberTarget.displayName || removeMemberTarget.username}”移出${workspace?.department.name || '当前部门'}，变为未分配状态。不会删除账号，其协作组与角色不受影响。` : ''" :pending="removeMemberPending" confirm-label="确认移出" @close="removeMemberTarget = null" @confirm="confirmRemoveMember" />

    <ConfirmDialog :open="deleteDialogOpen" title="删除部门" :description="`将删除部门“${workspace?.department.name || ''}”。若其下仍有子部门或直属成员，删除会被拒绝，需先转移成员并清空子部门。`" :pending="deletePending" confirm-label="确认删除" @close="closeDeleteDialog" @confirm="confirmDeleteDepartment" />
  </section>
</template>
