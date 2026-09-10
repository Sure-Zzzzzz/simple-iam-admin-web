import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import OrganizationsView from './OrganizationsView.vue';

const adminUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const root = {
  id: 10, code: 'headquarters', name: '总部', parentId: null, status: 1, sortOrder: 0, directMemberCount: 1,
  children: [{ id: 11, code: 'research', name: '研发部', parentId: 10, status: 1, sortOrder: 0, directMemberCount: 0, children: [] }]
};
const workspace = {
  department: { id: 10, code: 'headquarters', name: '总部', parentId: null, parentName: null, status: 1, sortOrder: 0, createdAt: '', updatedAt: '' },
  directChildren: [{ id: 11, code: 'research', name: '研发部', parentId: 10, parentName: '总部', status: 1, sortOrder: 0, createdAt: '', updatedAt: '' }],
  members: {
    content: [{ id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 10, departmentName: '总部', status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }],
    totalElements: 1, totalPages: 1, number: 0, size: 50
  }
};
const profile = {
  user: workspace.members.content[0],
  department: workspace.department,
  userGroups: [{ id: 3, code: 'notice', name: '通知组', description: '', status: 1, createdAt: '', updatedAt: '' }],
  roles: [
    { id: 4, code: 'operator', name: '运营角色', description: '', builtIn: 0, source: 'direct' as const },
    { id: 9, code: 'auditor', name: '审计角色', description: '', builtIn: 0, source: 'department_inherited' as const }
  ],
  effectivePermissions: [
    { id: 5, code: 'iam:user:page', name: '用户页面', type: 'page' as const, source: 'direct' as const },
    { id: 6, code: 'iam:user:api', name: '用户接口', type: 'api' as const, source: 'department_inherited' as const }
  ]
};

const stubRouter = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
});

function mountView() {
  return mount(OrganizationsView, {
    global: { plugins: [stubRouter], stubs: { Teleport: { template: '<div><slot /></div>' } } }
  });
}

const usersPage = {
  content: [
    workspace.members.content[0],
    { id: 3, username: 'bob', displayName: '鲍勃', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }
  ],
  totalElements: 2, totalPages: 1, number: 0, size: 100
};

function requestForWorkbench(url: string, init?: { method?: string }) {
  if (init?.method === 'PUT' && url === '/iam/admin/departments/10') return Promise.resolve({ ...workspace.department });
  if (init?.method === 'DELETE' && url === '/iam/admin/departments/10') return Promise.resolve(undefined);
  if (url === '/iam/admin/departments') return Promise.resolve([workspace.department, workspace.directChildren[0]]);
  if (url === '/iam/admin/user-groups') return Promise.resolve(profile.userGroups);
  if (url === '/iam/admin/roles') return Promise.resolve(profile.roles);
  if (url === '/iam/admin/organizations/tree') return Promise.resolve([root]);
  if (url === '/iam/admin/departments/10/roles') return Promise.resolve([]);
  if (url === '/iam/admin/organizations/departments/10/workspace?page=1&size=10') return Promise.resolve(workspace);
  if (url === '/iam/admin/organizations/users/2/profile') return Promise.resolve(profile);
  if (url === '/iam/admin/users?page=1&size=100') return Promise.resolve(usersPage);
  return Promise.resolve(undefined);
}

describe('OrganizationsView', () => {
  beforeEach(() => applyAdminBridge());
  afterEach(() => {
    applyAdminBridge();
    vi.restoreAllMocks();
  });

  it('应加载部门树并展示当前部门直属成员和子部门', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });

    const wrapper = mountView();
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/organizations/tree', {});
    expect(request).toHaveBeenCalledWith('/iam/admin/organizations/departments/10/workspace?page=1&size=10', {});
    expect(wrapper.text()).toContain('总部');
    expect(wrapper.text()).toContain('直属成员');
    expect(wrapper.text()).toContain('研发部');
    expect(wrapper.text()).toContain('alice');
  });

  it('打开成员关系后应展示只读有效权限', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/organizations/users/2/profile', {});
    expect(wrapper.get('.drawer-header h2').text()).toBe('爱丽丝');
    expect(wrapper.text()).toContain('通知组');
    expect(wrapper.text()).toContain('运营角色');
    expect(wrapper.text()).toContain('iam:user:page · 页面权限');
    expect(wrapper.text()).toContain('仅供查看，不能在这里直接修改');
  });

  it('创建下级部门成功后应关闭抽屉并重置表单', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const createDepartmentButton = wrapper.findAll('button').find(button => button.text() === '新建下级部门');
    expect(createDepartmentButton).toBeTruthy();
    await createDepartmentButton!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    await drawer.find('input[placeholder="下级部门编码"]').setValue('platform');
    await drawer.find('input[placeholder="下级部门名称"]').setValue('平台部');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments', {
      method: 'POST',
      body: JSON.stringify({ code: 'platform', name: '平台部', parentId: 10, sortOrder: 0, status: 1, memberIds: [] })
    });
    expect(wrapper.find('.entity-drawer').exists()).toBe(false);
  });

  it('创建部门时勾选已有成员应随创建提交 memberIds', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/departments') {
        return Promise.resolve({ id: 12, code: 'platform', name: '平台部', parentId: 10, status: 1, sortOrder: 0 });
      }
      return requestForWorkbench(url);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const createDepartmentButton = wrapper.findAll('button').find(button => button.text() === '新建下级部门');
    await createDepartmentButton!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    await flushPromises();

    const memberCheckboxes = drawer.findAll('.member-option input[type="checkbox"]');
    expect(memberCheckboxes.length).toBe(2);
    expect(drawer.text()).toContain('alice');
    await memberCheckboxes[1].setValue(true);
    expect(drawer.text()).toContain('已选 1 人');

    await drawer.find('input[placeholder="下级部门编码"]').setValue('platform');
    await drawer.find('input[placeholder="下级部门名称"]').setValue('平台部');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments', {
      method: 'POST',
      body: JSON.stringify({ code: 'platform', name: '平台部', parentId: 10, sortOrder: 0, status: 1, memberIds: [3] })
    });
  });

  it('没有根部门时应展示组织空态而不渲染工作区', async () => {
    const request = vi.fn().mockImplementation((url: string) => {
      if (url === '/iam/admin/departments') return Promise.resolve([]);
      if (url === '/iam/admin/user-groups') return Promise.resolve([]);
      if (url === '/iam/admin/roles') return Promise.resolve([]);
      if (url === '/iam/admin/organizations/tree') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('尚未创建根部门');
    expect(wrapper.find('.organization-tree').exists()).toBe(false);
  });

  it('空态下创建首个根部门应提交 parentId 为 null', async () => {
    const createdRoot = { id: 20, code: 'headquarters', name: '总部', parentId: null, status: 1, sortOrder: 0 };
    let treeCalls = 0;
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/departments') return Promise.resolve(createdRoot);
      if (url === '/iam/admin/departments') return Promise.resolve(treeCalls > 0 ? [createdRoot] : []);
      if (url === '/iam/admin/user-groups') return Promise.resolve([]);
      if (url === '/iam/admin/roles') return Promise.resolve([]);
      if (url === '/iam/admin/organizations/tree') {
        treeCalls += 1;
        return Promise.resolve(treeCalls > 1 ? [{ ...createdRoot, directMemberCount: 0, children: [] }] : []);
      }
      if (url === '/iam/admin/departments/20/roles') return Promise.resolve([]);
      if (url === '/iam/admin/organizations/departments/20/workspace?page=1&size=10') return Promise.resolve({
        department: { ...createdRoot, parentName: null, createdAt: '', updatedAt: '' },
        directChildren: [],
        members: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 }
      });
      return Promise.resolve(undefined);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('.admin-empty-state .button-primary').trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    expect(drawer.get('.drawer-header h2').text()).toBe('创建根部门');
    await drawer.find('input[placeholder="根部门编码"]').setValue('headquarters');
    await drawer.find('input[placeholder="根部门名称"]').setValue('总部');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments', {
      method: 'POST',
      body: JSON.stringify({ code: 'headquarters', name: '总部', parentId: null, sortOrder: 0, status: 1, memberIds: [] })
    });
    expect(wrapper.text()).toContain('根部门已创建');
  });

  it('编辑部门应预填当前值并提交 PUT 更新', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const editButton = wrapper.findAll('button').find(button => button.text() === '编辑部门');
    expect(editButton).toBeTruthy();
    await editButton!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    expect(drawer.get('.drawer-header h2').text()).toBe('编辑部门');
    const nameInput = drawer.find('input[placeholder="部门名称"]');
    expect((nameInput.element as HTMLInputElement).value).toBe('总部');
    await nameInput.setValue('集团总部');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments/10', {
      method: 'PUT',
      body: JSON.stringify({ name: '集团总部', parentId: null, sortOrder: 0, status: 1 })
    });
    expect(wrapper.text()).toContain('部门已更新');
  });

  it('编辑部门时上级部门下拉应排除自身与后代', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '编辑部门')!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    const parentSelect = drawer.findAll('select')[0];
    const options = parentSelect.findAll('option');
    expect(options.length).toBe(1);
    expect(options[0].text()).toBe('未分配（作为根部门）');
  });

  it('删除部门应经确认后提交 DELETE 并关闭确认框', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '删除部门')!.trigger('click');
    expect(wrapper.text()).toContain('将删除部门“总部”');
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments/10', { method: 'DELETE' });
    expect(wrapper.text()).toContain('部门“总部”已删除');
  });

  it('删除被拒时应展示后端保护文案', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE' && url === '/iam/admin/departments/10') {
        return Promise.reject(new Error('部门 headquarters 下仍有直属成员，无法删除'));
      }
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '删除部门')!.trigger('click');
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('部门 headquarters 下仍有直属成员，无法删除');
  });

  it('成员筛选应携带 keyword 与 status 请求第一页', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const filterBar = wrapper.get('.user-filter-bar');
    await filterBar.find('input[type="search"]').setValue('alice');
    await filterBar.find('select').setValue('1');
    await filterBar.get('select').trigger('change');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/organizations/departments/10/workspace?page=1&size=10&status=1&keyword=alice', {});
  });

  it('成员分页应展示页码并翻页请求对应页', async () => {
    const pageOneWorkspace = {
      ...workspace,
      members: { ...workspace.members, totalElements: 21, totalPages: 2, number: 0 }
    };
    const pageTwoWorkspace = {
      ...workspace,
      members: { ...workspace.members, totalElements: 21, totalPages: 2, number: 1 }
    };
    const request = vi.fn().mockImplementation((url: string) => {
      if (url === '/iam/admin/organizations/departments/10/workspace?page=1&size=10') return Promise.resolve(pageOneWorkspace);
      if (url === '/iam/admin/organizations/departments/10/workspace?page=2&size=10') return Promise.resolve(pageTwoWorkspace);
      return requestForWorkbench(url);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const footer = wrapper.get('.pagination');
    expect(footer.find('button.active').text()).toBe('1');
    await footer.findAll('button').find(button => button.text() === '下一页')!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/organizations/departments/10/workspace?page=2&size=10', {});
    expect(wrapper.get('.pagination button.active').text()).toBe('2');
  });

  it('创建成员应提交邮箱与手机号', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/users') {
        return Promise.resolve({ id: 9, username: 'carol', displayName: '卡罗尔', departmentId: 10 });
      }
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '创建成员')!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    expect(drawer.text()).toContain('8-64 位，需包含大写字母、小写字母、数字与特殊字符');
    await drawer.find('input[placeholder="用户名"]').setValue('carol');
    await drawer.find('input[placeholder="初始密码"]').setValue('Str0ng!pass');
    await drawer.find('input[placeholder="显示名"]').setValue('卡罗尔');
    await drawer.find('input[placeholder="user@example.com"]').setValue('carol@example.com');
    await drawer.find('input[placeholder="手机号"]').setValue('13800000000');
    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'carol', password: 'Str0ng!pass', displayName: '卡罗尔', email: 'carol@example.com', phone: '13800000000', departmentId: 10 })
    });
    expect(wrapper.text()).toContain('成员已创建并归属当前部门');
  });

  it('添加已有成员应把选中用户挂到当前部门', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'PUT' && url === '/iam/admin/users/3') return Promise.resolve({ ...usersPage.content[1], departmentId: 10, departmentName: '总部' });
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '添加成员')!.trigger('click');
    await flushPromises();
    const drawer = wrapper.get('.entity-drawer');
    expect(drawer.text()).toContain('选择要加入本部门的成员');
    const bobOption = drawer.findAll('.member-option').find(option => option.text().includes('bob'))!;
    expect(bobOption.text()).toContain('未分配部门');
    await bobOption.find('input[type="checkbox"]').setValue(true);
    expect(drawer.text()).toContain('已选 1 人');

    await drawer.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users/3', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '鲍勃', email: '', phone: '', departmentId: 10, clearDepartment: false })
    });
    expect(wrapper.text()).toContain('已把 1 名成员加入总部');
  });

  it('移除成员应清空归属且不影响账号', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'PUT' && url === '/iam/admin/users/2') return Promise.resolve({ ...workspace.members.content[0], departmentId: null, departmentName: null });
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('.table-action.danger').find(button => button.text() === '移除')!.trigger('click');
    const dialog = wrapper.get('.confirm-dialog');
    expect(dialog.text()).toContain('移出部门');
    expect(dialog.text()).toContain('爱丽丝');
    expect(dialog.text()).toContain('不会删除账号');

    await dialog.findAll('button').find(button => button.text() === '确认移出')!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users/2', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '爱丽丝', email: '', phone: '', departmentId: null, clearDepartment: true })
    });
    expect(wrapper.text()).toContain('已将 爱丽丝 移出部门');
  });

  it('绑定成员搜索应携带 keyword 拉取候选', async () => {
    const request = vi.fn().mockImplementation((url: string) => {
      if (url === '/iam/admin/users?page=1&size=100&keyword=bob') return Promise.resolve({ content: [usersPage.content[1]], totalElements: 1, totalPages: 1, number: 0, size: 100 });
      return requestForWorkbench(url);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '新建下级部门')!.trigger('click');
    const drawer = wrapper.get('.entity-drawer');
    await flushPromises();
    await drawer.get('.search-field input').setValue('bob');
    await drawer.get('.search-field input').trigger('keyup.enter');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users?page=1&size=100&keyword=bob', {});
    expect(drawer.text()).toContain('bob');
    expect(drawer.text()).not.toContain('alice');
  });

  it('部门树搜索应按名称过滤节点', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const treeAside = wrapper.get('.organization-tree');
    expect(treeAside.text()).toContain('总部');
    expect(treeAside.text()).toContain('研发部');
    await treeAside.get('.search-field input').setValue('研发');
    expect(treeAside.text()).not.toContain('总部');
    expect(treeAside.text()).toContain('研发部');
  });

  it('画像可分配区应支持按关键词过滤协作组', async () => {
    const allGroups = [
      ...profile.userGroups,
      { id: 7, code: 'ops', name: '运维组', description: '', status: 1, createdAt: '', updatedAt: '' },
      { id: 8, code: 'dev', name: '开发组', description: '', status: 1, createdAt: '', updatedAt: '' }
    ];
    const request = vi.fn().mockImplementation((url: string) => {
      if (url === '/iam/admin/user-groups') return Promise.resolve(allGroups);
      return requestForWorkbench(url);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();
    const drawer = wrapper.get('.entity-drawer');
    const availableSection = drawer.findAll('.assignment-list.available')[0];
    expect(availableSection.text()).toContain('运维组');
    expect(availableSection.text()).toContain('开发组');
    await availableSection.get('.search-field input').setValue('开发');
    expect(availableSection.text()).not.toContain('运维组');
    expect(availableSection.text()).toContain('开发组');
  });

  it('画像中跳转用户管理应携带用户名关键词', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/users', component: { template: '<div />' } },
        { path: '/organizations', component: OrganizationsView }
      ]
    });
    await router.push('/organizations');
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mount(OrganizationsView, {
      attachTo: document.body,
      global: { plugins: [router], stubs: { Teleport: { template: '<div><slot /></div>' } } }
    });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === '在用户管理中查看')!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/users');
    expect(router.currentRoute.value.query.keyword).toBe('alice');
    wrapper.unmount();
  });

  it('部门角色区应展示已挂载角色并支持挂载', async () => {
    const operatorRole = { id: 4, code: 'operator', name: '运营角色', description: '', builtIn: 0 };
    const auditorRole = { id: 9, code: 'auditor', name: '审计角色', description: '', builtIn: 0 };
    let mounted = [auditorRole];
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && url === '/iam/admin/departments/10/roles/4') {
        mounted = [...mounted, operatorRole];
        return Promise.resolve(undefined);
      }
      if (url === '/iam/admin/departments/10/roles') return Promise.resolve(mounted);
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    const section = wrapper.findAll('.assignment-section').find(item => item.find('h3').text().includes('部门角色'));
    expect(section).toBeTruthy();
    expect(section!.text()).toContain('审计角色');
    expect(section!.text()).toContain('运营角色');
    expect(request).toHaveBeenCalledWith('/iam/admin/departments/10/roles', {});
    await section!.findAll('button').find(button => button.text() === '挂载')!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments/10/roles/4', { method: 'POST' });
    expect(wrapper.text()).toContain('角色已挂载到部门，部门全体成员将继承该角色');
    expect(wrapper.findAll('.assignment-section').find(item => item.find('h3').text().includes('部门角色'))!.text()).toContain('运营角色');
  });

  it('撤销部门角色应经确认后提交 DELETE 并刷新', async () => {
    const auditorRole = { id: 9, code: 'auditor', name: '审计角色', description: '', builtIn: 0 };
    let mounted = [auditorRole];
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE' && url === '/iam/admin/departments/10/roles/9') {
        mounted = [];
        return Promise.resolve(undefined);
      }
      if (url === '/iam/admin/departments/10/roles') return Promise.resolve(mounted);
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '撤销')!.trigger('click');
    expect(wrapper.text()).toContain('将撤销部门角色“审计角色”');
    expect(wrapper.text()).toContain('若该角色为系统保留的最后管理员角色，撤销可能被拒绝');
    await wrapper.findAll('button').find(button => button.text() === '确认移除')!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/departments/10/roles/9', { method: 'DELETE' });
    expect(wrapper.text()).toContain('部门角色已撤销，该部门成员将不再继承此角色');
  });

  it('撤销部门角色被保护拒绝时应原样展示后端文案', async () => {
    const request = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE' && url === '/iam/admin/departments/10/roles/2') {
        return Promise.reject(new Error('撤销后系统将没有可用的 iam_admin 管理员，已拒绝'));
      }
      if (url === '/iam/admin/departments/10/roles') {
        return Promise.resolve([{ id: 2, code: 'iam_admin', name: 'IAM 管理员', description: '', builtIn: 1 }]);
      }
      return requestForWorkbench(url, init);
    });
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === '撤销')!.trigger('click');
    await wrapper.findAll('button').find(button => button.text() === '确认移除')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('撤销后系统将没有可用的 iam_admin 管理员，已拒绝');
  });

  it('画像有效角色应标注来源且部门继承角色不可移除', async () => {
    const request = vi.fn().mockImplementation(requestForWorkbench);
    applyAdminBridge({ currentUser: adminUser, request: createRuntimeRequest(request), refreshCurrentUser: async () => adminUser, refreshUnreadCount: async () => undefined, onUnauthorized: () => undefined });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const drawer = wrapper.get('.entity-drawer');
    expect(drawer.text()).toContain('个人直接');
    expect(drawer.text()).toContain('部门继承');
    expect(drawer.text()).toContain('iam:user:api · 接口权限 · 部门继承');
    const roleSection = wrapper.findAll('.assignment-section').find(item => item.find('h3').text().includes('有效角色'));
    expect(roleSection).toBeTruthy();
    const removeButtons = roleSection!.findAll('button').filter(button => button.text() === '移除');
    expect(removeButtons.length).toBe(1);
  });
});
