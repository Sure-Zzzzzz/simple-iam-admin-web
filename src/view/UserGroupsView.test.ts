import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import UserGroupsView from './UserGroupsView.vue';

const opsGroup = { id: 1, code: 'ops', name: '运营组', description: '运营通知', status: 1, createdAt: '', updatedAt: '' };
const alice = { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 1, departmentName: '总部', status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const bob = { id: 3, username: 'bob', displayName: '鲍勃', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };

function makeGroupsPage(page = 1) {
  return {
    content: page === 1 ? [opsGroup] : [{ ...opsGroup, id: 9, code: 'next', name: '第二页组' }],
    totalElements: 11,
    totalPages: 2,
    page,
    size: 10,
    numberOfElements: 1,
    first: page === 1,
    last: page !== 1,
    empty: false
  };
}

const usersPage = { content: [alice, bob], totalElements: 11, totalPages: 2, page: 1, size: 10, numberOfElements: 2, first: true, last: false, empty: false };
const carol = { id: 4, username: 'carol', displayName: '卡罗尔', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const usersPage2 = { content: [carol], totalElements: 11, totalPages: 2, page: 2, size: 10, numberOfElements: 1, first: false, last: true, empty: false };

function applyBridge(request: ReturnType<typeof vi.fn>) {
  applyAdminBridge({
    currentUser: { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] },
    request: createRuntimeRequest(request),
    refreshCurrentUser: async () => ({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }),
    refreshUnreadCount: async () => undefined,
    onUnauthorized: () => undefined
  });
}

function teleported(selector: string) {
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`未找到抽屉内容：${selector}`);
  }
  return new DOMWrapper(element);
}

function baseRequest(handlers: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if (handlers[url] !== undefined) {
      return Promise.resolve(typeof handlers[url] === 'function' ? (handlers[url] as () => unknown)() : handlers[url]);
    }
    return Promise.resolve(makeGroupsPage());
  });
}

describe('UserGroupsView', () => {
  beforeEach(() => applyAdminBridge());
  afterEach(() => {
    applyAdminBridge();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('列表应渲染分页数据与页码文案', async () => {
    const request = baseRequest();
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups/page?page=1&size=10', {});
    expect(wrapper.text()).toContain('运营组');
    const pagination = wrapper.get('.pagination');
    expect(pagination.find('button.active').text()).toBe('1');
    expect(pagination.text()).toContain('下一页');
  });

  it('筛选与翻页应携带服务端查询参数并回到对应页', async () => {
    const urls: string[] = [];
    const request = vi.fn().mockImplementation((url: string) => {
      urls.push(url);
      const pageNum = Number(url.split('page=')[1]?.split('&')[0] || '1');
      return Promise.resolve(makeGroupsPage(pageNum));
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();

    const bar = wrapper.get('.group-filter-bar');
    await bar.get('input[type="search"]').setValue('ops');
    await bar.get('input[type="search"]').trigger('keyup.enter');
    await flushPromises();
    expect(urls.at(-1)).toBe('/iam/admin/user-groups/page?page=1&size=10&keyword=ops');

    await bar.get('select').setValue('1');
    await flushPromises();
    expect(urls.at(-1)).toBe('/iam/admin/user-groups/page?page=1&size=10&status=1&keyword=ops');

    const nextPage = wrapper.get('.pagination').findAll('button').find(button => button.text() === '下一页');
    expect(nextPage).toBeTruthy();
    await nextPage!.trigger('click');
    await flushPromises();
    expect(urls.at(-1)).toBe('/iam/admin/user-groups/page?page=2&size=10&status=1&keyword=ops');
    expect(wrapper.get('.pagination button.active').text()).toBe('2');

    const resetButton = bar.findAll('button').find(button => button.text() === '重置');
    expect(resetButton).toBeTruthy();
    await resetButton!.trigger('click');
    await flushPromises();
    expect(urls.at(-1)).toBe('/iam/admin/user-groups/page?page=1&size=10');
  });

  it('没有协作组时应展示空态文案', async () => {
    const request = baseRequest({
      '/iam/admin/user-groups/page?page=1&size=10': { content: [], totalElements: 0, totalPages: 0, page: 1, size: 10, numberOfElements: 0, first: true, last: true, empty: true }
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('.admin-empty-state').text()).toContain('当前还没有协作组');
  });

  it('创建协作组应在抽屉中提交编码、名称、描述和状态', async () => {
    const created = { id: 5, code: 'dev', name: '研发组', description: '研发通知', status: 1, createdAt: '', updatedAt: '' };
    const request = baseRequest();
    request.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/user-groups') {
        return Promise.resolve(created);
      }
      if (url === '/iam/admin/user-groups/5/users') {
        return Promise.resolve([]);
      }
      return Promise.resolve(makeGroupsPage());
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.admin-page-actions .button-primary').trigger('click');

    const drawer = teleported('.entity-drawer');
    const inputs = drawer.findAll('input');
    await inputs[0].setValue('dev');
    await inputs[1].setValue('研发组');
    await drawer.get('textarea').setValue('研发通知');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups', {
      method: 'POST',
      body: JSON.stringify({ code: 'dev', name: '研发组', description: '研发通知', status: 1 })
    });
    expect(wrapper.text()).toContain('协作组创建成功');
  });

  it('创建被拒时应展示后端错误文案', async () => {
    const request = baseRequest();
    request.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return Promise.reject(new Error('协作组编码已存在'));
      }
      return Promise.resolve(makeGroupsPage());
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.admin-page-actions .button-primary').trigger('click');

    const drawer = teleported('.entity-drawer');
    const inputs = drawer.findAll('input');
    await inputs[0].setValue('ops');
    await inputs[1].setValue('重复组');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.get('.admin-message.error').text()).toContain('协作组编码已存在');
  });

  it('编辑协作组应预填并提交更新', async () => {
    const updated = { ...opsGroup, name: '运营组改', description: '运营通知改' };
    const request = baseRequest({
      '/iam/admin/user-groups/1/users': [alice]
    });
    request.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'PUT' && url === '/iam/admin/user-groups/1') {
        return Promise.resolve(updated);
      }
      if (url === '/iam/admin/user-groups/1/users') {
        return Promise.resolve([alice]);
      }
      return Promise.resolve(makeGroupsPage());
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('tbody .table-primary-action').trigger('click');
    await flushPromises();

    const drawer = teleported('.entity-drawer');
    expect(drawer.findAll('input')[0].element.value).toBe('运营组');
    await drawer.findAll('input')[0].setValue('运营组改');
    await drawer.get('textarea').setValue('运营通知改');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups/1', {
      method: 'PUT',
      body: JSON.stringify({ name: '运营组改', description: '运营通知改', status: 1 })
    });
    expect(wrapper.text()).toContain('协作组已更新');
  });

  it('删除协作组应经确认框并展示成功提示', async () => {
    const request = baseRequest();
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('tbody .table-action.danger').trigger('click');
    await flushPromises();

    const confirmButton = teleported('.confirm-dialog').findAll('button').find(button => button.text().includes('确认删除'));
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups/1', { method: 'DELETE' });
    expect(wrapper.text()).toContain('协作组已删除');
  });

  it('成员候选应默认展示用户并按关键字筛选后排除已加入成员', async () => {
    let groupUsers: Array<typeof alice | typeof bob> = [alice];
    const request = baseRequest();
    request.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/user-groups/1/users/3') {
        return Promise.resolve(undefined);
      }
      if (init?.method === 'DELETE' && url === '/iam/admin/user-groups/1/users/2') {
        return Promise.resolve(undefined);
      }
      if (url.startsWith('/iam/admin/users?')) {
        const pageNum = Number(new URL(url, 'http://localhost').searchParams.get('page') || '1');
        return Promise.resolve(pageNum >= 2 ? usersPage2 : usersPage);
      }
      if (url === '/iam/admin/user-groups/1/users') {
        return Promise.resolve(groupUsers);
      }
      return Promise.resolve(makeGroupsPage());
    });
    applyBridge(request);

    const wrapper = mount(UserGroupsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('tbody .table-primary-action').trigger('click');
    await flushPromises();

    let drawer = teleported('.entity-drawer');
    expect(request).toHaveBeenCalledWith('/iam/admin/users?page=1&size=10', {});
    const defaultAvailable = drawer.get('.assignment-list.available');
    expect(defaultAvailable.text()).toContain('鲍勃');
    expect(defaultAvailable.text()).not.toContain('爱丽丝');

    const candidateFooter = drawer.get('.assignment-section .pagination');
    expect(candidateFooter.find('button.active').text()).toBe('1');
    const nextButton = candidateFooter.findAll('button').find(button => button.text().includes('下一页'));
    expect(nextButton).toBeTruthy();
    await nextButton!.trigger('click');
    await flushPromises();
    expect(request).toHaveBeenCalledWith('/iam/admin/users?page=2&size=10', {});
    drawer = teleported('.entity-drawer');
    expect(drawer.get('.assignment-list.available').text()).toContain('卡罗尔');

    const searchInput = drawer.findAll('.assignment-section')[1].get('input[type="search"]');
    await searchInput.setValue('bob');
    await searchInput.trigger('keyup.enter');
    await flushPromises();
    expect(request).toHaveBeenCalledWith('/iam/admin/users?page=1&size=10&keyword=bob', {});

    drawer = teleported('.entity-drawer');
    const available = drawer.get('.assignment-list.available');
    expect(available.text()).toContain('鲍勃');
    expect(available.text()).not.toContain('爱丽丝');

    const addButton = available.findAll('button').find(button => button.text().includes('添加'));
    expect(addButton).toBeTruthy();
    groupUsers = [alice, bob];
    await addButton!.trigger('click');
    await flushPromises();
    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups/1/users/3', { method: 'POST' });
    expect(wrapper.text()).toContain('成员已添加');

    drawer = teleported('.entity-drawer');
    const revokeButton = drawer.findAll('.assignment-list:not(.available) button').find(button => button.text().includes('移除'));
    expect(revokeButton).toBeTruthy();
    await revokeButton!.trigger('click');
    await flushPromises();

    const confirmButton = teleported('.confirm-dialog').findAll('button').find(button => button.text().includes('确认移除'));
    expect(confirmButton).toBeTruthy();
    groupUsers = [bob];
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/user-groups/1/users/2', { method: 'DELETE' });
    expect(wrapper.text()).toContain('成员已移除');
  });
});
