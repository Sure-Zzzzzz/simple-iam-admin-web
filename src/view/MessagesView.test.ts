import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import MessagesView from './MessagesView.vue';

const usersPage = {
  content: [{ id: 2, username: 'user', displayName: '用户', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }],
  totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
};
const departments = [{ id: 3, code: 'tech', name: '技术部', parentId: null, parentName: null, sortOrder: 0, status: 1, createdAt: '', updatedAt: '' }];
const userGroups = [{ id: 4, code: 'ops', name: '运营组', description: null, status: 1, createdAt: '', updatedAt: '' }];
const batchSummary = {
  sendBatchId: 'batch-1', title: '系统维护通知', senderUsername: 'admin',
  targetUserCount: 2, targetDepartmentCount: 1, targetUserGroupCount: 1, targetIncludeChildDepartments: true,
  recipientCount: 20, readCount: 5, createdAt: '2026-08-31T10:00:00Z'
};
const batchesPage = { content: [batchSummary], totalElements: 1, totalPages: 1, page: 1, size: 10, numberOfElements: 1, first: true, last: true, empty: false };
const batchDetail = { ...batchSummary, content: '今晚 22 点系统维护，预计 1 小时。' };
const recipientsPageOne = {
  content: [{ userId: 2, username: 'user', displayName: '用户', readAt: '2026-08-31T11:00:00Z' }],
  totalElements: 11, totalPages: 2, page: 1, size: 10, numberOfElements: 1, first: true, last: false, empty: false
};
const recipientsPageTwo = {
  content: [{ userId: 5, username: 'reader2', displayName: '读者二', readAt: null }],
  totalElements: 11, totalPages: 2, page: 2, size: 10, numberOfElements: 1, first: false, last: true, empty: false
};

function applyBridge(request: ReturnType<typeof vi.fn>) {
  applyAdminBridge({
    currentUser: { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] },
    request: createRuntimeRequest(request),
    refreshCurrentUser: async () => ({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }),
    refreshUnreadCount: vi.fn().mockResolvedValue(undefined),
    onUnauthorized: () => undefined
  });
}

function teleported(selector: string) {
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`未找到 Teleport 内容：${selector}`);
  }
  return new DOMWrapper(element);
}

function bridgeRequest() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/iam/admin/users?page=1&size=20') return Promise.resolve(usersPage);
    if (url.startsWith('/iam/admin/users?page=1&size=20&keyword=')) return Promise.resolve(usersPage);
    if (url === '/iam/admin/departments') return Promise.resolve(departments);
    if (url === '/iam/admin/user-groups') return Promise.resolve(userGroups);
    if (url === '/iam/admin/messages/page?page=1&size=10') return Promise.resolve(batchesPage);
    if (url === '/iam/admin/messages/batch-1') return Promise.resolve(batchDetail);
    if (url === '/iam/admin/messages/batch-1/recipients?page=1&size=10') return Promise.resolve(recipientsPageOne);
    if (url === '/iam/admin/messages/batch-1/recipients?page=2&size=10') return Promise.resolve(recipientsPageTwo);
    return Promise.resolve(undefined);
  });
}

async function openComposeDrawer(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('.admin-page-actions .button-primary').trigger('click');
  await flushPromises();
  return teleported('.entity-drawer');
}

describe('MessagesView', () => {
  beforeEach(() => applyAdminBridge());
  afterEach(() => {
    applyAdminBridge();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('加载发送历史批次并按人话渲染目标与已读进度', async () => {
    const request = bridgeRequest();
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('系统维护通知');
    expect(wrapper.text()).toContain('2 位用户 · 1 个部门（含子部门） · 1 个协作组');
    expect(wrapper.text()).toContain('已读 5/20');
    expect(wrapper.text()).toContain('个人收件箱与已读状态在统一应用门户查看');
    expect(request.mock.calls.map(call => call[0])).not.toContain('/iam/web/messages');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('未选择任一目标时不应提交站内信', async () => {
    const request = bridgeRequest();
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();
    const drawer = await openComposeDrawer(wrapper);
    await drawer.get('form').trigger('submit.prevent');

    expect(wrapper.text()).toContain('至少选择一个发送目标');
    expect(request.mock.calls.filter(call => call[0] === '/iam/admin/messages')).toHaveLength(0);
  });

  it('按协作组发送应提交多目标请求、汇总确认文案并在发送后打开批次详情', async () => {
    const request = bridgeRequest();
    request.mockImplementation((url: string) => {
      if (url === '/iam/admin/messages') return Promise.resolve({ sendBatchId: 'batch-1', recipientCount: 2 });
      if (url === '/iam/admin/users?page=1&size=20') return Promise.resolve(usersPage);
      if (url === '/iam/admin/departments') return Promise.resolve(departments);
      if (url === '/iam/admin/user-groups') return Promise.resolve(userGroups);
      if (url === '/iam/admin/messages/page?page=1&size=10') return Promise.resolve(batchesPage);
      if (url === '/iam/admin/messages/batch-1') return Promise.resolve(batchDetail);
      if (url === '/iam/admin/messages/batch-1/recipients?page=1&size=10') return Promise.resolve(recipientsPageOne);
      return Promise.resolve(undefined);
    });
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();
    const drawer = await openComposeDrawer(wrapper);
    await drawer.findAll('.picker-options')[2].get('input[type=checkbox]').setValue(true);
    await drawer.get('input[placeholder="标题"]').setValue('群发通知');
    await drawer.get('textarea').setValue('通知内容');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(teleported('.confirm-dialog').text()).toContain('将发送给：1 个协作组');
    const confirmButton = teleported('.confirm-dialog').findAll('button').find(button => button.text().includes('确认发送'));
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientUserIds: [], departmentIds: [], userGroupIds: [4], includeChildDepartments: false, title: '群发通知', content: '通知内容' })
    });
    expect(wrapper.text()).toContain('站内信已发送给 2 位用户');
    expect(request.mock.calls.filter(call => call[0] === '/iam/admin/messages/page?page=1&size=10').length).toBeGreaterThanOrEqual(2);
    const detailDrawer = teleported('.entity-drawer');
    expect(detailDrawer.text()).toContain('今晚 22 点系统维护，预计 1 小时。');
    expect(detailDrawer.text()).toContain('20 人，已读 5 人');
  });

  it('用户目标支持关键词搜索并以 chips 展示与移除已选', async () => {
    const request = bridgeRequest();
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();
    const drawer = await openComposeDrawer(wrapper);

    await drawer.get('input[placeholder="搜索用户名 / 展示名 / 邮箱"]').setValue('用户');
    await drawer.get('input[placeholder="搜索用户名 / 展示名 / 邮箱"]').trigger('keyup', { key: 'Enter' });
    await flushPromises();
    expect(request.mock.calls.some(call => decodeURIComponent(String(call[0])) === '/iam/admin/users?page=1&size=20&keyword=用户')).toBe(true);

    await drawer.findAll('.picker-options')[0].get('input[type=checkbox]').setValue(true);
    expect(drawer.get('.tag-list').text()).toContain('用户 ×');

    await drawer.get('.tag-list button').trigger('click');
    expect(drawer.find('.tag-list').exists()).toBe(false);
  });

  it('部门与协作组目标支持本地过滤', async () => {
    const request = bridgeRequest();
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();
    const drawer = await openComposeDrawer(wrapper);

    await drawer.get('input[placeholder="搜索部门名称 / 编码"]').setValue('不存在');
    expect(drawer.findAll('.picker-options')[1].text()).toContain('无匹配部门');
    await drawer.get('input[placeholder="搜索部门名称 / 编码"]').setValue('');
    expect(drawer.findAll('.picker-options')[1].text()).toContain('技术部');

    await drawer.get('input[placeholder="搜索协作组名称 / 编码"]').setValue('ops');
    expect(drawer.findAll('.picker-options')[2].text()).toContain('运营组');
  });

  it('批次详情抽屉展示收件人已读状态并支持翻页', async () => {
    const request = bridgeRequest();
    applyBridge(request);
    const wrapper = mount(MessagesView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.table-action').trigger('click');
    await flushPromises();

    const detailDrawer = teleported('.entity-drawer');
    expect(detailDrawer.text()).toContain('系统维护通知');
    expect(detailDrawer.text()).toContain('用户');
    expect(detailDrawer.text()).toContain('已读');

    const nextButton = detailDrawer.get('.pagination').findAll('button').find(button => button.text() === '下一页');
    expect(nextButton).toBeTruthy();
    await nextButton!.trigger('click');
    await flushPromises();
    expect(request.mock.calls.some(call => call[0] === '/iam/admin/messages/batch-1/recipients?page=2&size=10')).toBe(true);
    expect(teleported('.entity-drawer').text()).toContain('读者二');
    expect(teleported('.entity-drawer').text()).toContain('未读');
  });
});
