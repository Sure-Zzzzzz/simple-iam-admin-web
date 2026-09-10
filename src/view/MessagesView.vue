<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AdminPageHeader from '../components/AdminPageHeader.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EntityDrawer from '../components/EntityDrawer.vue';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import {
  createMessage,
  fetchDepartments,
  fetchMessageBatch,
  fetchMessageBatchRecipients,
  fetchMessageBatches,
  fetchUserGroups,
  fetchUsers,
  type IamDepartment,
  type IamUser,
  type IamUserGroup,
  type MessageBatchDetail,
  type MessageBatchRecipient,
  type MessageBatchSummary
} from '../api/iamAuth';

const users = ref<IamUser[]>([]);
const departments = ref<IamDepartment[]>([]);
const userGroups = ref<IamUserGroup[]>([]);
const loading = ref(false);
const message = ref('');
const errorMessage = ref('');
const composeDrawerOpen = ref(false);
const sendConfirmationOpen = ref(false);
const submitting = ref(false);

const batches = ref<MessageBatchSummary[]>([]);
const batchesLoading = ref(false);
const batchesError = ref('');
const batchPage = ref(1);
const batchTotalPages = ref(1);
const batchTotal = ref(0);

const detailDrawerOpen = ref(false);
const detailLoading = ref(false);
const detailBatch = ref<MessageBatchDetail | null>(null);
const detailRecipients = ref<MessageBatchRecipient[]>([]);
const recipientsPage = ref(1);
const recipientsTotalPages = ref(1);
const recipientsTotal = ref(0);

const userKeyword = ref('');
const userResults = ref<IamUser[]>([]);
const userSearching = ref(false);
const selectedUsers = ref<IamUser[]>([]);
const departmentKeyword = ref('');
const groupKeyword = ref('');

const form = reactive({
  recipientUserIds: [] as number[],
  departmentIds: [] as number[],
  userGroupIds: [] as number[],
  includeChildDepartments: false,
  title: '',
  content: ''
});

const filteredDepartments = computed(() => filterByKeyword(departments.value, departmentKeyword.value,
  item => `${item.name} · ${item.code}`));
const filteredUserGroups = computed(() => filterByKeyword(userGroups.value, groupKeyword.value,
  item => `${item.name} · ${item.code}`));

const confirmDescription = computed(() => {
  const parts: string[] = [];
  if (form.recipientUserIds.length > 0) {
    parts.push(`${form.recipientUserIds.length} 位用户`);
  }
  if (form.departmentIds.length > 0) {
    parts.push(`${form.departmentIds.length} 个部门${form.includeChildDepartments ? '（含子部门）' : ''}`);
  }
  if (form.userGroupIds.length > 0) {
    parts.push(`${form.userGroupIds.length} 个协作组`);
  }
  return parts.length > 0
    ? `将发送给：${parts.join('、')}。发送后立即投递，暂不支持撤回。`
    : '';
});

function filterByKeyword<T>(items: T[], keyword: string, toText: (item: T) => string): T[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter(item => toText(item).toLowerCase().includes(normalized));
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [departmentList, groupList] = await Promise.all([
      fetchDepartments(),
      fetchUserGroups()
    ]);
    departments.value = departmentList;
    userGroups.value = groupList;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    loading.value = false;
  }
}

const batchPageSize = ref(10);

async function loadBatches(page = 1) {
  batchesLoading.value = true;
  batchesError.value = '';
  try {
    const result = await fetchMessageBatches({ page, size: batchPageSize.value });
    batches.value = result.content;
    batchPage.value = result.page;
    batchTotalPages.value = result.totalPages;
    batchTotal.value = result.totalElements;
  } catch (error) {
    batchesError.value = error instanceof Error ? error.message : '';
  } finally {
    batchesLoading.value = false;
  }
}

function changeBatchPage(page: number) {
  if (page < 1 || page > batchTotalPages.value || page === batchPage.value || batchesLoading.value) {
    return;
  }
  void loadBatches(page);
}

function changeBatchPageSize(size: number) {
  if (size < 1 || size === batchPageSize.value || batchesLoading.value) {
    return;
  }
  batchPageSize.value = size;
  void loadBatches(1);
}

const recipientsPageSize = ref(10);

async function openBatchDetail(sendBatchId: string, page = 1) {
  detailDrawerOpen.value = true;
  detailLoading.value = true;
  detailBatch.value = null;
  detailRecipients.value = [];
  try {
    const [detail, recipientPage] = await Promise.all([
      fetchMessageBatch(sendBatchId),
      fetchMessageBatchRecipients(sendBatchId, { page, size: recipientsPageSize.value })
    ]);
    detailBatch.value = detail;
    detailRecipients.value = recipientPage.content;
    recipientsPage.value = recipientPage.page;
    recipientsTotalPages.value = recipientPage.totalPages;
    recipientsTotal.value = recipientPage.totalElements;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载批次详情失败';
    detailDrawerOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

async function loadRecipients(page: number) {
  if (!detailBatch.value) {
    return;
  }
  detailLoading.value = true;
  try {
    const result = await fetchMessageBatchRecipients(detailBatch.value.sendBatchId, { page, size: recipientsPageSize.value });
    detailRecipients.value = result.content;
    recipientsPage.value = result.page;
    recipientsTotalPages.value = result.totalPages;
    recipientsTotal.value = result.totalElements;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '';
  } finally {
    detailLoading.value = false;
  }
}

function changeRecipientPage(page: number) {
  if (page < 1 || page > recipientsTotalPages.value
      || page === recipientsPage.value || detailLoading.value) {
    return;
  }
  void loadRecipients(page);
}

function changeRecipientPageSize(size: number) {
  if (size < 1 || size === recipientsPageSize.value || detailLoading.value) {
    return;
  }
  recipientsPageSize.value = size;
  void loadRecipients(1);
}

async function searchUsers() {
  userSearching.value = true;
  try {
    const keyword = userKeyword.value.trim();
    const result = await fetchUsers({ page: 1, size: 20, ...(keyword ? { keyword } : {}) });
    users.value = result.content;
    userResults.value = result.content;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索用户失败';
  } finally {
    userSearching.value = false;
  }
}

function toggleUser(user: IamUser) {
  const index = form.recipientUserIds.indexOf(user.id);
  if (index >= 0) {
    form.recipientUserIds.splice(index, 1);
    selectedUsers.value = selectedUsers.value.filter(item => item.id !== user.id);
  } else {
    form.recipientUserIds.push(user.id);
    if (!selectedUsers.value.some(item => item.id === user.id)) {
      selectedUsers.value.push(user);
    }
  }
}

function removeSelectedUser(userId: number) {
  form.recipientUserIds = form.recipientUserIds.filter(id => id !== userId);
  selectedUsers.value = selectedUsers.value.filter(item => item.id !== userId);
}

function toggleId(list: number[], id: number) {
  const index = list.indexOf(id);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(id);
  }
}

function resetForm() {
  Object.assign(form, {
    recipientUserIds: [],
    departmentIds: [],
    userGroupIds: [],
    includeChildDepartments: false,
    title: '',
    content: ''
  });
  selectedUsers.value = [];
  userKeyword.value = '';
  departmentKeyword.value = '';
  groupKeyword.value = '';
}

function closeComposeDrawer() {
  if (!submitting.value) {
    composeDrawerOpen.value = false;
    resetForm();
  }
}

function openComposeDrawer() {
  composeDrawerOpen.value = true;
  if (userResults.value.length === 0) {
    void searchUsers();
  }
}

function requestSendMessage() {
  message.value = '';
  errorMessage.value = '';
  if (form.recipientUserIds.length === 0 && form.departmentIds.length === 0 && form.userGroupIds.length === 0) {
    errorMessage.value = '至少选择一个发送目标';
    return;
  }
  sendConfirmationOpen.value = true;
}

async function submitMessage() {
  submitting.value = true;
  message.value = '';
  errorMessage.value = '';
  try {
    const response = await createMessage({
      recipientUserIds: form.recipientUserIds,
      departmentIds: form.departmentIds,
      userGroupIds: form.userGroupIds,
      includeChildDepartments: form.includeChildDepartments,
      title: form.title,
      content: form.content
    });
    resetForm();
    sendConfirmationOpen.value = false;
    composeDrawerOpen.value = false;
    message.value = `站内信已发送给 ${response.recipientCount} 位用户`;
    await loadBatches(1);
    await openBatchDetail(response.sendBatchId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送站内信失败';
  } finally {
    submitting.value = false;
  }
}

function formatTarget(batch: MessageBatchSummary): string {
  const parts: string[] = [];
  if (batch.targetUserCount > 0) {
    parts.push(`${batch.targetUserCount} 位用户`);
  }
  if (batch.targetDepartmentCount > 0) {
    parts.push(`${batch.targetDepartmentCount} 个部门${batch.targetIncludeChildDepartments ? '（含子部门）' : ''}`);
  }
  if (batch.targetUserGroupCount > 0) {
    parts.push(`${batch.targetUserGroupCount} 个协作组`);
  }
  return parts.length > 0 ? parts.join(' · ') : '未记录';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

onMounted(() => {
  void loadPage();
  void loadBatches();
});
</script>

<template>
  <section class="management-page">
    <AdminPageHeader
      title="站内信"
      description="向用户、部门或协作组投递站内信；个人收件箱与已读状态在统一应用门户查看。"
      primary-label="发送站内信"
      @primary="openComposeDrawer"
    />

    <p v-if="message" class="admin-message success" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="admin-message error" role="alert">{{ errorMessage }}</p>

    <section class="admin-data-surface" aria-label="已发送批次" :aria-busy="batchesLoading">
      <header class="data-toolbar">
        <div>
          <h2>发送历史</h2>
          <p>按发送批次聚合；已读数随门户收件箱阅读实时累计。</p>
        </div>
      </header>
      <p v-if="batchesError" class="admin-message error" role="alert">
        {{ batchesError }}
        <button type="button" @click="loadBatches(batchPage)">重试</button>
      </p>
      <div v-else class="responsive-table">
        <table>
          <thead>
            <tr>
              <th>标题</th>
              <th>发送人</th>
              <th>发送目标</th>
              <th>收件人</th>
              <th>发送时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="batchesLoading && batches.length === 0">
              <td colspan="6" class="table-empty">正在加载发送历史...</td>
            </tr>
            <tr v-else-if="batches.length === 0">
              <td colspan="6" class="table-empty">尚未发送过站内信。</td>
            </tr>
            <tr v-for="batch in batches" v-else :key="batch.sendBatchId">
              <td>{{ batch.title }}</td>
              <td>{{ batch.senderUsername }}</td>
              <td>{{ formatTarget(batch) }}</td>
              <td>已读 {{ batch.readCount }}/{{ batch.recipientCount }}</td>
              <td>{{ formatDateTime(batch.createdAt) }}</td>
              <td class="table-actions"><button class="table-action" type="button" @click="openBatchDetail(batch.sendBatchId)">查看</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination
        v-if="batchTotal > 0"
        :current="batchPage"
        :total="batchTotal"
        :page-size="batchPageSize"
        @update:current="changeBatchPage"
        @update:page-size="changeBatchPageSize"
      />
    </section>

    <EntityDrawer :open="detailDrawerOpen" :pending="detailLoading" wide title="批次详情" description="发送时展开的收件人快照，已读状态随门户阅读实时累计。" @close="!detailLoading && (detailDrawerOpen = false)">
      <template v-if="detailBatch">
        <dl class="message-batch-meta">
          <div><dt>标题</dt><dd>{{ detailBatch.title }}</dd></div>
          <div><dt>发送人</dt><dd>{{ detailBatch.senderUsername }}</dd></div>
          <div><dt>发送目标</dt><dd>{{ formatTarget(detailBatch) }}</dd></div>
          <div><dt>收件人</dt><dd>{{ detailBatch.recipientCount }} 人，已读 {{ detailBatch.readCount }} 人</dd></div>
          <div><dt>发送时间</dt><dd>{{ formatDateTime(detailBatch.createdAt) }}</dd></div>
          <div><dt>内容</dt><dd class="message-batch-content">{{ detailBatch.content }}</dd></div>
        </dl>
        <h3 class="drawer-section-title">收件人（{{ recipientsTotal }}）</h3>
        <div class="responsive-table">
          <table>
            <thead>
              <tr><th>用户</th><th>用户名</th><th>状态</th><th>阅读时间</th></tr>
            </thead>
            <tbody>
              <tr v-if="detailRecipients.length === 0">
                <td colspan="4" class="table-empty">暂无收件人。</td>
              </tr>
              <tr v-for="recipient in detailRecipients" :key="recipient.userId">
                <td>{{ recipient.displayName }}</td>
                <td>{{ recipient.username }}</td>
                <td><span class="status-badge" :class="recipient.readAt ? '' : 'danger'">{{ recipient.readAt ? '已读' : '未读' }}</span></td>
                <td>{{ recipient.readAt ? formatDateTime(recipient.readAt) : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination
          v-if="recipientsTotal > 0"
          :current="recipientsPage"
          :total="recipientsTotal"
          :page-size="recipientsPageSize"
          @update:current="changeRecipientPage"
          @update:page-size="changeRecipientPageSize"
        />
      </template>
      <p v-else class="table-empty">正在加载批次详情...</p>
    </EntityDrawer>

    <EntityDrawer :open="composeDrawerOpen" :pending="submitting" title="发送站内信" description="发送目标会在投递时展开为收件人快照。" @close="closeComposeDrawer">
      <form class="drawer-form" @submit.prevent="requestSendMessage">
        <fieldset class="recipient-fieldset">
          <legend>选择发送目标</legend>
          <p>至少选择用户、部门或协作组中的一种目标。</p>
          <div class="picker-group">
            <span class="picker-group-title">指定用户{{ userSearching ? '（搜索中…）' : '' }}</span>
            <input v-model="userKeyword" type="search" placeholder="搜索用户名 / 展示名 / 邮箱" @keyup.enter="searchUsers">
            <div class="picker-options">
              <label v-for="user in userResults" :key="user.id">
                <input type="checkbox" :checked="form.recipientUserIds.includes(user.id)" @change="toggleUser(user)">
                {{ user.displayName || user.username }}（{{ user.username }}）</label>
              <p v-if="userResults.length === 0" class="picker-empty">无匹配用户，调整关键词后回车再搜。</p>
            </div>
            <div v-if="selectedUsers.length > 0" class="tag-list">
              <button v-for="user in selectedUsers" :key="user.id" type="button" @click="removeSelectedUser(user.id)">
                {{ user.displayName || user.username }} ×
              </button>
            </div>
          </div>
          <div class="picker-group">
            <span class="picker-group-title">部门</span>
            <input v-model="departmentKeyword" type="search" placeholder="搜索部门名称 / 编码">
            <div class="picker-options">
              <label v-for="department in filteredDepartments" :key="department.id">
                <input type="checkbox" :checked="form.departmentIds.includes(department.id)" @change="toggleId(form.departmentIds, department.id)">
                {{ department.name }}（{{ department.code }}）              </label>
              <p v-if="filteredDepartments.length === 0" class="picker-empty">无匹配部门。</p>
            </div>
            <label class="checkbox-field"><input v-model="form.includeChildDepartments" type="checkbox"> 部门目标包含子部门</label>
          </div>
          <div class="picker-group">
            <span class="picker-group-title">协作组</span>
            <input v-model="groupKeyword" type="search" placeholder="搜索协作组名称 / 编码">
            <div class="picker-options">
              <label v-for="group in filteredUserGroups" :key="group.id">
                <input type="checkbox" :checked="form.userGroupIds.includes(group.id)" @change="toggleId(form.userGroupIds, group.id)">
                {{ group.name }}（{{ group.code }}）              </label>
              <p v-if="filteredUserGroups.length === 0" class="picker-empty">无匹配协作组。</p>
            </div>
          </div>
        </fieldset>
        <label><span>标题</span><input v-model="form.title" required maxlength="128" placeholder="标题"></label>
        <label><span>内容</span><textarea v-model="form.content" required maxlength="2000" placeholder="内容"></textarea></label>
        <footer class="drawer-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeComposeDrawer">取消</button><button class="button-primary" type="submit" :disabled="submitting">确认发送</button></footer>
      </form>
    </EntityDrawer>

    <ConfirmDialog
      :open="sendConfirmationOpen"
      title="确认发送站内信"
      :description="confirmDescription"
      :pending="submitting"
      confirm-label="确认发送"
      variant="confirm"
      @close="sendConfirmationOpen = false"
      @confirm="submitMessage"
    />
  </section>
</template>
