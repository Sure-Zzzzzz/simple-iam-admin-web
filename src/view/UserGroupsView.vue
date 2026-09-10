<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import DashboardIcon from '../components/DashboardIcon.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  assignUserGroupUser,
  createUserGroup,
  deleteUserGroup,
  fetchUserGroupPage,
  fetchUserGroupUsers,
  fetchUsers,
  revokeUserGroupUser,
  updateUserGroup,
  type IamUser,
  type IamUserGroup,
  type StatusPageQuery
} from '../api/iamAuth';

const userGroups = ref<IamUserGroup[]>([]);
const selectedGroup = ref<IamUserGroup | null>(null);
const selectedGroupUsers = ref<IamUser[]>([]);
const message = ref('');
const errorMessage = ref('');
const filterForm = reactive({ keyword: '', status: '' as '' | '1' | '0' });
const currentPage = ref(1);
const totalPages = ref(1);
const totalElements = ref(0);
const pageSize = ref(10);
const createDrawerOpen = ref(false);
const detailDrawerOpen = ref(false);
const deleteTarget = ref<IamUserGroup | null>(null);
const removeMemberTarget = ref<IamUser | null>(null);
const deleting = ref(false);
const submitting = ref(false);
const relationshipPending = ref(false);

const createForm = reactive({ code: '', name: '', description: '', status: 1 });
const editForm = reactive({ name: '', description: '', status: 1 });

const candidateKeyword = ref('');
const candidates = ref<IamUser[]>([]);
const candidateSearched = ref(false);
const candidateLoading = ref(false);
const candidatePage = ref(1);
const candidateTotalPages = ref(1);
const candidateTotal = ref(0);
const candidatePageSize = ref(10);

const hasFilter = computed(() => filterForm.keyword.trim() !== '' || filterForm.status !== '');

const assignableUsers = computed(() => {
  const assigned = new Set(selectedGroupUsers.value.map(user => user.id));
  return candidates.value.filter(user => !assigned.has(user.id));
});

function buildGroupQuery(): StatusPageQuery {
  const query: StatusPageQuery = { page: currentPage.value, size: pageSize.value };
  if (filterForm.keyword.trim()) {
    query.keyword = filterForm.keyword.trim();
  }
  if (filterForm.status !== '') {
    query.status = Number(filterForm.status);
  }
  return query;
}

async function loadGroups() {
  errorMessage.value = '';
  try {
    const result = await fetchUserGroupPage(buildGroupQuery());
    userGroups.value = result.content;
    totalElements.value = result.totalElements;
    totalPages.value = Math.max(result.totalPages, 1);
    currentPage.value = result.page;
    if (selectedGroup.value) {
      const latest = userGroups.value.find(group => group.id === selectedGroup.value?.id);
      if (latest) {
        await selectGroup(latest, false);
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  }
}

async function searchGroups() {
  currentPage.value = 1;
  await loadGroups();
}

function changePage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return;
  }
  currentPage.value = page;
  void loadGroups();
}

function changePageSize(size: number) {
  if (size < 1 || size === pageSize.value) {
    return;
  }
  pageSize.value = size;
  currentPage.value = 1;
  void loadGroups();
}

function resetFilters() {
  filterForm.keyword = '';
  filterForm.status = '';
  void searchGroups();
}

async function submitCreateGroup() {
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const group = await createUserGroup({
      code: createForm.code,
      name: createForm.name,
      description: createForm.description,
      status: Number(createForm.status)
    });
    Object.assign(createForm, { code: '', name: '', description: '', status: 1 });
    createDrawerOpen.value = false;
    message.value = '协作组创建成功';
    filterForm.keyword = '';
    filterForm.status = '';
    await searchGroups();
    if (group && typeof group === 'object' && 'id' in group && typeof group.id === 'number') {
      await selectGroup(userGroups.value.find(item => item.id === group.id) || group);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    submitting.value = false;
  }
}

async function selectGroup(group: IamUserGroup, openDrawer = true) {
  selectedGroup.value = group;
  Object.assign(editForm, {
    name: group.name,
    description: group.description || '',
    status: group.status
  });
  try {
    selectedGroupUsers.value = await fetchUserGroupUsers(group.id);
    if (openDrawer) {
      detailDrawerOpen.value = true;
      candidateKeyword.value = '';
      void searchCandidates();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  }
}

function closeDetail() {
  detailDrawerOpen.value = false;
  selectedGroup.value = null;
  selectedGroupUsers.value = [];
  candidates.value = [];
  candidateKeyword.value = '';
  candidateSearched.value = false;
  candidatePage.value = 1;
  candidateTotalPages.value = 1;
  candidateTotal.value = 0;
  candidatePageSize.value = 10;
}

async function submitUpdateGroup() {
  if (!selectedGroup.value) {
    return;
  }
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    selectedGroup.value = await updateUserGroup(selectedGroup.value.id, {
      name: editForm.name,
      description: editForm.description,
      status: Number(editForm.status)
    });
    message.value = '协作组已更新';
    await loadGroups();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    submitting.value = false;
  }
}

function requestDelete(group: IamUserGroup) {
  deleteTarget.value = group;
}

async function confirmDelete() {
  if (!deleteTarget.value) {
    return;
  }
  deleting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await deleteUserGroup(deleteTarget.value.id);
    if (selectedGroup.value?.id === deleteTarget.value.id) {
      closeDetail();
    }
    message.value = '协作组已删除';
    deleteTarget.value = null;
    await loadGroups();
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
      await loadGroups();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    deleting.value = false;
  }
}

async function loadCandidates(page = 1) {
  candidateLoading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchUsers({ page, size: candidatePageSize.value, keyword: candidateKeyword.value.trim() || undefined });
    candidates.value = result.content;
    candidateSearched.value = true;
    candidatePage.value = result.page;
    candidateTotalPages.value = Math.max(result.totalPages, 1);
    candidateTotal.value = result.totalElements;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索用户失败';
  } finally {
    candidateLoading.value = false;
  }
}

function searchCandidates() {
  void loadCandidates(1);
}

function changeCandidatePage(page: number) {
  if (page < 1 || page > candidateTotalPages.value || page === candidatePage.value || candidateLoading.value) {
    return;
  }
  void loadCandidates(page);
}

function changeCandidatePageSize(size: number) {
  if (size < 1 || size === candidatePageSize.value) {
    return;
  }
  candidatePageSize.value = size;
  void loadCandidates(1);
}

async function assignUser(userId: number) {
  if (!selectedGroup.value) {
    return;
  }
  relationshipPending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await assignUserGroupUser(selectedGroup.value.id, userId);
    selectedGroupUsers.value = await fetchUserGroupUsers(selectedGroup.value.id);
    message.value = '成员已添加';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '添加成员失败';
  } finally {
    relationshipPending.value = false;
  }
}

function requestRemoveUser(user: IamUser) {
  removeMemberTarget.value = user;
}

async function confirmRemoveUser() {
  if (!selectedGroup.value || !removeMemberTarget.value) {
    return;
  }
  relationshipPending.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    await revokeUserGroupUser(selectedGroup.value.id, removeMemberTarget.value.id);
    selectedGroupUsers.value = await fetchUserGroupUsers(selectedGroup.value.id);
    message.value = '成员已移除';
    removeMemberTarget.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '移除成员失败';
  } finally {
    relationshipPending.value = false;
  }
}

onMounted(loadGroups);
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="协作组管理"
      description="维护跨部门协作成员，用于协作、通知投递和业务成员圈选；协作组不承担角色和权限语义。"
      primary-label="新建协作组"
      @primary="createDrawerOpen = true"
    />

    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="admin-message error" role="alert">{{ errorMessage }}</p>

    <section class="admin-data-surface" aria-label="协作组列表">
      <header class="data-toolbar">
        <div>
          <h2>全部协作组<span>{{ totalElements }}</span></h2>
          <p>成员关系独立于部门层级和角色授权，可在详情中维护。</p>
        </div>
      </header>
      <div class="data-toolbar group-filter-bar">
        <label class="search-field"><span class="sr-only">搜索协作组</span><input v-model="filterForm.keyword" type="search" placeholder="搜索编码、名称或描述" @keyup.enter="searchGroups"></label>
        <select v-model="filterForm.status" aria-label="协作组状态筛选" @change="searchGroups">
          <option value="">全部状态</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button class="button-secondary" type="button" @click="resetFilters">重置</button>
      </div>
      <div v-if="userGroups.length === 0" class="admin-empty-state">
        <DashboardIcon name="user-group" />
        <h2>{{ hasFilter ? '没有匹配的协作组' : '当前还没有协作组' }}</h2>
        <p>{{ hasFilter ? '调整搜索关键词或筛选条件后再试。' : '创建第一个协作组，用于跨部门协作、通知投递和业务成员圈选。' }}</p>
        <button v-if="hasFilter" class="button-secondary" type="button" @click="resetFilters">清除筛选</button>
      </div>
      <div v-else class="responsive-table">
        <table>
          <thead><tr><th>协作组</th><th>状态</th><th>描述</th><th class="table-actions">操作</th></tr></thead>
          <tbody>
            <tr v-for="group in userGroups" :key="group.id" :class="{ selected: selectedGroup?.id === group.id }">
              <td><button class="table-primary-action" type="button" @click="selectGroup(group)"><strong>{{ group.name }}</strong><span>{{ group.code }}</span></button></td>
              <td><span class="status-badge" :class="group.status === 1 ? 'success' : 'danger'">{{ group.status === 1 ? '启用' : '禁用' }}</span></td>
              <td>{{ group.description || '未填写协作组说明' }}</td>
              <td class="table-actions"><button class="table-action" type="button" @click="selectGroup(group)">查看</button><button class="table-action danger" type="button" @click="requestDelete(group)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination
        v-if="totalElements > 0"
        :current="currentPage"
        :total="totalElements"
        :page-size="pageSize"
        @update:current="changePage"
        @update:page-size="changePageSize"
      />
    </section>

    <EntityDrawer :open="createDrawerOpen" :pending="submitting" title="新建协作组" description="协作组用于跨部门成员协作，不会授予角色或权限。" @close="!submitting && (createDrawerOpen = false)">
      <form class="drawer-form" @submit.prevent="submitCreateGroup">
        <label><span>协作组编码</span><input v-model="createForm.code" required maxlength="64" placeholder="协作组编码"></label>
        <label><span>协作组名称</span><input v-model="createForm.name" required maxlength="128" placeholder="协作组名称"></label>
        <label><span>描述</span><textarea v-model="createForm.description" maxlength="255" placeholder="说明协作组的使用场景"></textarea></label>
        <label><span>状态</span><select v-model.number="createForm.status" aria-label="协作组状态"><option :value="1">启用</option><option :value="0">禁用</option></select></label>
        <footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="createDrawerOpen = false">取消</button><button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在创建…' : '创建协作组' }}</button></footer>
      </form>
    </EntityDrawer>

    <EntityDrawer :open="detailDrawerOpen" :pending="submitting" wide :title="selectedGroup?.name || '协作组详情'" :description="selectedGroup?.code" @close="closeDetail">
      <template v-if="selectedGroup">
        <form class="drawer-form" @submit.prevent="submitUpdateGroup">
          <label><span>协作组名称</span><input v-model="editForm.name" required maxlength="128" placeholder="协作组名称"></label>
          <label><span>描述</span><textarea v-model="editForm.description" maxlength="255" placeholder="说明协作组的使用场景"></textarea></label>
          <label><span>状态</span><select v-model.number="editForm.status" aria-label="协作组状态"><option :value="1">启用</option><option :value="0">禁用</option></select></label>
          <button class="button-primary" type="submit" :disabled="submitting">{{ submitting ? '正在保存…' : '保存协作组' }}</button>
        </form>

        <section class="assignment-section">
          <header><div><h3>已分配成员 <span>{{ selectedGroupUsers.length }}</span></h3><p>成员仍保留其部门与角色边界；点击移除可解除协作关系。</p></div></header>
          <div v-if="selectedGroupUsers.length" class="assignment-list">
            <article v-for="user in selectedGroupUsers" :key="user.id"><div><strong>{{ user.displayName || user.username }}</strong><span>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}</span></div><button class="table-action danger" type="button" @click="requestRemoveUser(user)">移除</button></article>
          </div>
          <p v-else class="assignment-empty">当前没有成员。</p>
        </section>

        <section class="assignment-section">
          <header><div><h3>添加成员</h3><p>可翻页或按账号、显示名筛选；已加入的不再显示。</p></div></header>
          <label class="search-field"><span class="sr-only">筛选可添加成员</span><input v-model="candidateKeyword" type="search" placeholder="搜索账号或显示名，回车筛选" @keyup.enter="searchCandidates"></label>
          <div v-if="assignableUsers.length" class="assignment-list available">
            <article v-for="user in assignableUsers" :key="user.id"><div><strong>{{ user.displayName || user.username }}</strong><span>{{ user.username }}{{ user.departmentName ? ` · ${user.departmentName}` : '' }}</span></div><button class="table-action" type="button" :disabled="relationshipPending" @click="assignUser(user.id)">{{ relationshipPending ? '处理中…' : '添加' }}</button></article>
          </div>
          <p v-else-if="candidateLoading" class="assignment-empty">正在读取用户…</p>
          <p v-else-if="!candidateSearched" class="assignment-empty">正在准备用户列表…</p>
          <p v-else-if="candidateKeyword.trim()" class="assignment-empty">没有匹配的用户，调整关键词后再试。</p>
          <p v-else class="assignment-empty">没有可添加的成员。</p>
          <Pagination
            v-if="candidateTotal > 0"
            :current="candidatePage"
            :total="candidateTotal"
            :page-size="candidatePageSize"
            @update:current="changeCandidatePage"
            @update:page-size="changeCandidatePageSize"
          />
        </section>
      </template>
    </EntityDrawer>

    <ConfirmDialog
      :open="Boolean(removeMemberTarget)"
      title="移出协作组"
      :description="`将把“${removeMemberTarget?.displayName || removeMemberTarget?.username || ''}”移出当前协作组。协作组不授予权限，仅解除成员关系。`"
      :pending="relationshipPending"
      confirm-label="确认移除"
      @close="removeMemberTarget = null"
      @confirm="confirmRemoveUser"
    />

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除协作组"
      :description="`将删除“${deleteTarget?.name || ''}”及其成员关系。此操作无法撤销。`"
      :pending="deleting"
      confirm-label="确认删除"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </section>
</template>
