import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import UsersView from './UsersView.vue';

const adminUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const departments = [
  { id: 10, code: 'tech', name: '技术部', parentId: null, parentName: null, sortOrder: 0, status: 1, createdAt: '', updatedAt: '' }
];
const usersPage = {
  content: [
    { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 10, departmentName: '技术部', identitySource: 'ldap-password', status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' },
    { id: 3, username: 'bob', displayName: '鲍勃', email: '', phone: '', departmentId: null, departmentName: null, identitySource: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }
  ],
  totalElements: 2,
  totalPages: 1,
  number: 0,
  size: 50
};
const roles = [
  { id: 1, code: 'iam_admin', name: 'IAM 管理员', description: '', builtIn: 1 },
  { id: 2, code: 'business_op', name: '业务运营', description: '', builtIn: 0 }
];
const applicationsPage = {
  content: [
    { id: 5, applicationCode: 'demo', applicationName: '示例应用', description: '用于展示。', icon: null, clientCount: 1, portalEnabled: false }
  ],
  totalElements: 1,
  totalPages: 1,
  page: 1,
  size: 100,
  numberOfElements: 1,
  first: true,
  last: true,
  empty: false
};
const providers = { providers: [{ code: 'ldap-password', displayName: 'LDAP 登录', type: 'ldap', enabled: true, description: null }] };
const permissionManifest = {
  applicationId: 5, roles: ['app-admin', 'app-viewer'], pagePermissions: ['page:home'], apiPermissions: ['api:read'],
  dataResources: [{ resource: 'app:order', actions: ['read'], dimensions: ['departmentId'] }],
  manifestVersion: 1, manifestDigest: 'digest-1', createdAt: '', updatedAt: ''
};
const dataGrantDocument = {
  protocol: 'simple-data-permission',
  version: '1.0',
  grants: [{ resource: 'app:order', actions: ['read'], all: false, constraints: [{ dimension: 'departmentId', operator: 'IN', values: ['D01'] }] }]
};
const activeAuthorization = { applicationId: 5, admitted: true, authorizationVersion: 2, manifestVersion: '1', status: 1, createdAt: '', updatedAt: '', revokedAt: null };
const revokedAuthorization = { applicationId: 5, admitted: true, authorizationVersion: 3, manifestVersion: '1', status: 0, createdAt: '', updatedAt: '', revokedAt: '2026-08-31T00:00:00Z' };
const authorizationDetail = {
  applicationId: 5, admitted: true, authorizationVersion: 2, manifestVersion: '1', status: 1,
  roles: ['app-admin', 'app-viewer'], pagePermissions: ['page:home'], apiPermissions: ['api:read'],
  dataGrantDocument, createdAt: '', updatedAt: '', revokedAt: null
};

function createRequestMock(handlers: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    const value = handlers[key] ?? handlers[`GET ${url}`];
    if (value === undefined) {
      return Promise.reject(new Error(`unexpected request: ${key}`));
    }
    return typeof value === 'function' ? value(url, init) : Promise.resolve(value);
  });
}

async function mountView(request: ReturnType<typeof createRequestMock>, query: Record<string, string> = {}) {
  applyAdminBridge({
    currentUser: adminUser,
    request: createRuntimeRequest(request),
    refreshCurrentUser: async () => adminUser,
    refreshUnreadCount: async () => undefined,
    onUnauthorized: () => undefined
  });
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/users', component: { template: '<div />' } }]
  });
  await router.push({ path: '/users', query });
  const wrapper = mount(UsersView, { attachTo: document.body, global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

function grantDrawerOf(wrapper: VueWrapper) {
  const drawer = wrapper.findAll('.entity-drawer')
    .find(drawer => /(授权|编辑)：/.test(drawer.find('h2').text()));
  expect(drawer).toBeTruthy();
  return drawer!;
}

const baseHandlers = {
  'GET /iam/admin/users?page=1&size=10': usersPage,
  'GET /iam/admin/roles': roles,
  'GET /iam/admin/departments': departments,
  'GET /iam/admin/trusted-applications/page?page=1&size=100': applicationsPage,
  'GET /iam/web/auth/providers': providers,
  'GET /iam/admin/users/2/roles': [roles[1]],
  'GET /iam/admin/users/3/roles': [],
  'GET /iam/admin/users/2/application-authorizations': [],
  'GET /iam/admin/users/3/application-authorizations': []
};

describe('UsersView', () => {
  beforeEach(() => {
    applyAdminBridge();
  });

  afterEach(() => {
    applyAdminBridge();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('创建用户应携带所选部门并展示 LDAP 身份来源', async () => {
    const created = vi.fn().mockReturnValue({ ...usersPage.content[0] });
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10': vi.fn()
        .mockReturnValueOnce(usersPage)
        .mockReturnValueOnce({ ...usersPage, content: [{ ...usersPage.content[0], username: 'bob' }] }),
      'POST /iam/admin/users': created,
      'GET /iam/admin/users/2/roles': [],
      'GET /iam/admin/users/3/roles': []
    });

    const wrapper = await mountView(request);
    await wrapper.get('.admin-page-actions .button-primary').trigger('click');
    await flushPromises();
    const createForm = wrapper.get('.drawer-form');
    const inputs = createForm.findAll('input');
    await inputs[0].setValue('bob');
    await inputs[1].setValue('User@1234');
    await createForm.find('select').setValue('10');
    await createForm.trigger('submit.prevent');
    await flushPromises();

    expect(created).toHaveBeenCalledWith('/iam/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'bob',
        password: 'User@1234',
        displayName: '',
        email: '',
        phone: '',
        departmentId: 10
      })
    });
    expect(wrapper.text()).toContain('技术部');
    expect(wrapper.text()).toContain('LDAP');
  });

  it('分配角色后应调用 assignUserRole 并刷新已分配列表', async () => {
    let calls = 0;
    const request = createRequestMock({
      ...baseHandlers,
      'POST /iam/admin/users/2/roles/2': { },
      'GET /iam/admin/users/2/roles': () => (++calls === 1 ? [roles[0]] : roles)
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const assignButton = wrapper.findAll('.tag-list button').find(btn => btn.text().includes('business_op'));
    expect(assignButton).toBeTruthy();
    await assignButton!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users/2/roles/2', { method: 'POST' });
    expect(wrapper.text()).toContain('无可分配角色');
  });

  it('授权应用应从清单勾选提交授权内容并刷新授权列表', async () => {
    let granted = false;
    const putBodies: unknown[] = [];
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/trusted-applications/5/permission-manifest': permissionManifest,
      'GET /iam/admin/users/2/application-authorizations': () => (granted ? [activeAuthorization] : []),
      'PUT /iam/admin/users/2/application-authorizations/5': () => {
        granted = true;
        putBodies.push(null);
        return { applicationId: 5, authorizationVersion: 1 };
      }
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const grantButton = wrapper.findAll('.app-auth-list.available button').find(btn => btn.text().includes('授权准入'));
    expect(grantButton).toBeTruthy();
    await grantButton!.trigger('click');
    await flushPromises();

    const drawer = grantDrawerOf(wrapper);
    expect(drawer.text()).toContain('此处为该用户的手工授权，角色规则变更会触发投影重算。');
    const pickerGroups = drawer.findAll('.picker-group');
    expect(pickerGroups).toHaveLength(3);
    const roleChecks = pickerGroups[0].findAll('input[type="checkbox"]');
    expect(roleChecks.map(check => check.element.nextElementSibling?.textContent?.trim())).toEqual(['app-admin', 'app-viewer']);
    await roleChecks[0].trigger('change');
    await roleChecks[1].trigger('change');
    await pickerGroups[1].find('input[type="checkbox"]').trigger('change');
    await drawer.get('button[type="submit"]').trigger('submit.prevent');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users/2/application-authorizations/5', {
      method: 'PUT',
      body: JSON.stringify({
        admitted: true,
        roles: ['app-admin', 'app-viewer'],
        pagePermissions: ['page:home'],
        apiPermissions: [],
        dataGrantDocument: null
      })
    });
    expect(putBodies).toHaveLength(1);
    expect(wrapper.text()).toContain('已授权应用');
    expect(wrapper.findAll('.app-auth-list.available article')).toHaveLength(0);
  });

  it('编辑授权应回显详情勾选并全量替换提交', async () => {
    let saved = false;
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/trusted-applications/5/permission-manifest': permissionManifest,
      'GET /iam/admin/users/2/application-authorizations': () => [activeAuthorization],
      'GET /iam/admin/users/2/application-authorizations/5': authorizationDetail,
      'PUT /iam/admin/users/2/application-authorizations/5': () => {
        saved = true;
        return { applicationId: 5, authorizationVersion: 3 };
      }
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const editButton = wrapper.findAll('.app-auth-list:not(.available) button').find(btn => btn.text().includes('编辑授权'));
    expect(editButton).toBeTruthy();
    await editButton!.trigger('click');
    await flushPromises();

    const drawer = grantDrawerOf(wrapper);
    const pickerGroups = drawer.findAll('.picker-group');
    const roleChecks = pickerGroups[0].findAll('input[type="checkbox"]');
    expect((roleChecks[0].element as HTMLInputElement).checked).toBe(true);
    expect((roleChecks[1].element as HTMLInputElement).checked).toBe(true);
    expect((pickerGroups[1].find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect((pickerGroups[2].find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect(drawer.text()).toContain('数据授权（由角色规则生成并集投影');
    expect(drawer.text()).toContain('app:order');
    expect(drawer.text()).toContain('departmentId IN (D01)');
    expect(drawer.findAll('textarea')).toHaveLength(0);

    await roleChecks[1].trigger('change');
    await drawer.get('button[type="submit"]').trigger('submit.prevent');
    await flushPromises();

    expect(saved).toBe(true);
    expect(request).toHaveBeenCalledWith('/iam/admin/users/2/application-authorizations/5', {
      method: 'PUT',
      body: JSON.stringify({
        admitted: true,
        roles: ['app-admin'],
        pagePermissions: ['page:home'],
        apiPermissions: ['api:read'],
        dataGrantDocument
      })
    });
  });

  it('应用未登记清单时授权抽屉应提示先申报且禁用提交', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/trusted-applications/5/permission-manifest': () =>
        Promise.reject(new Error('可信应用未登记权限清单：id=5')),
      'GET /iam/admin/users/2/application-authorizations': []
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const grantButton = wrapper.findAll('.app-auth-list.available button').find(btn => btn.text().includes('授权准入'));
    await grantButton!.trigger('click');
    await flushPromises();

    const drawer = grantDrawerOf(wrapper);
    expect(drawer.text()).toContain('尚未登记权限清单');
    expect(drawer.find('.picker-group').exists()).toBe(false);
    expect(drawer.find('button[type="submit"]').exists()).toBe(false);
    expect(request.mock.calls.filter(([url, init]) => url === '/iam/admin/users/2/application-authorizations/5' && init?.method === 'PUT')).toHaveLength(0);
  });

  it('新建授权时数据授权区只读展示空态且无任何输入入口', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/trusted-applications/5/permission-manifest': permissionManifest,
      'GET /iam/admin/users/2/application-authorizations': []
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const grantButton = wrapper.findAll('.app-auth-list.available button').find(btn => btn.text().includes('授权准入'));
    await grantButton!.trigger('click');
    await flushPromises();

    const drawer = grantDrawerOf(wrapper);
    expect(drawer.findAll('textarea')).toHaveLength(0);
    expect(drawer.text()).toContain('数据授权（由角色规则生成并集投影');
    expect(drawer.text()).toContain('当前无数据授权');
  });

  it('撤销应用授权应经确认框 DELETE 并刷新授权列表', async () => {
    let revoked = false;
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users/2/application-authorizations': () => (revoked ? [revokedAuthorization] : [activeAuthorization]),
      'DELETE /iam/admin/users/2/application-authorizations/5': () => {
        revoked = true;
        return undefined;
      }
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const revokeButton = wrapper.findAll('.app-auth-list:not(.available) button').find(btn => btn.text().includes('撤销授权'));
    expect(revokeButton).toBeTruthy();
    await revokeButton!.trigger('click');
    await flushPromises();

    const confirmButton = wrapper.find('.confirm-dialog .button-danger');
    expect(confirmButton.exists()).toBe(true);
    await confirmButton.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/users/2/application-authorizations/5', { method: 'DELETE' });
    expect(wrapper.text()).toContain('重新授权');
  });

  it('平台管理员抽屉应展示特权说明并禁用撤销按钮，普通用户无说明可撤销', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users/2/roles': [roles[0]],
      'GET /iam/admin/users/2/application-authorizations': [activeAuthorization]
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const note = wrapper.find('.platform-admin-note');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('平台管理员');
    expect(note.text()).toContain('摘除 iam_admin');

    const revokeButton = wrapper.findAll('.app-auth-list:not(.available) button')
      .find(btn => btn.text().includes('撤销授权'));
    expect(revokeButton).toBeTruthy();
    expect((revokeButton!.element as HTMLButtonElement).disabled).toBe(true);

    const editButton = wrapper.findAll('.app-auth-list:not(.available) button')
      .find(btn => btn.text().includes('编辑授权'));
    expect(editButton).toBeTruthy();
    expect((editButton!.element as HTMLButtonElement).disabled).toBe(false);

    const plainRequest = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users/2/application-authorizations': [activeAuthorization]
    });
    const plainWrapper = await mountView(plainRequest);
    await plainWrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(plainWrapper.find('.platform-admin-note').exists()).toBe(false);
    const plainRevoke = plainWrapper.findAll('.app-auth-list:not(.available) button')
      .find(btn => btn.text().includes('撤销授权'));
    expect((plainRevoke!.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('绑定外部身份应提交登录方式与外部标识', async () => {
    const bound = vi.fn();
    const request = createRequestMock({
      ...baseHandlers,
      'POST /iam/admin/users/3/external-identity': bound
    });

    const wrapper = await mountView(request);
    const detailButtons = wrapper.findAll('tbody tr').map(row => row.findAll('button')[0]);
    await detailButtons[1].trigger('click');
    await flushPromises();

    const bindForm = wrapper.findAll('form').find(form => form.text().includes('绑定外部身份'));
    expect(bindForm).toBeTruthy();
    await bindForm!.find('select').setValue('ldap-password');
    await bindForm!.find('input').setValue('uid=bob,ou=people,dc=example');
    await bindForm!.trigger('submit.prevent');
    await flushPromises();

    expect(bound).toHaveBeenCalledWith('/iam/admin/users/3/external-identity', {
      method: 'POST',
      body: JSON.stringify({ providerCode: 'ldap-password', externalId: 'uid=bob,ou=people,dc=example' })
    });
    expect(wrapper.text()).toContain('外部身份已绑定');
  });

  it('解绑外部身份应经确认框 DELETE 并刷新', async () => {
    const unbound = vi.fn();
    const request = createRequestMock({
      ...baseHandlers,
      'DELETE /iam/admin/users/2/external-identity': unbound
    });

    const wrapper = await mountView(request);
    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const unbindButton = wrapper.find('.external-identity-bound button');
    expect(unbindButton.exists()).toBe(true);
    await unbindButton.trigger('click');
    await flushPromises();

    const confirmButton = wrapper.find('.confirm-dialog .button-danger');
    await confirmButton.trigger('click');
    await flushPromises();

    expect(unbound).toHaveBeenCalledWith('/iam/admin/users/2/external-identity', { method: 'DELETE' });
    expect(wrapper.text()).toContain('外部身份已解绑');
  });

  it('从锁定卡下钻进入应初始化锁定筛选并按锁定口径请求', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:00:00Z'));
    try {
      const lockedIso = new Date('2026-09-01T10:00:00Z').toISOString();
      const request = createRequestMock({
        ...baseHandlers,
        [`GET /iam/admin/users?page=1&size=10&lockedUntilAfter=${encodeURIComponent(lockedIso)}`]: usersPage
      });

      const wrapper = await mountView(request, { locked: '1' });

      const viewSelect = wrapper.findAll('.user-filter-bar select')[1];
      expect((viewSelect.element as HTMLSelectElement).value).toBe('locked');
      expect(request.mock.calls.some(([url]) => String(url).includes('lockedUntilAfter='))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('从未挂部门卡下钻进入应初始化未挂部门筛选并按口径请求', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10&noDepartment=true': usersPage
    });

    const wrapper = await mountView(request, { noDepartment: '1' });

    const viewSelect = wrapper.findAll('.user-filter-bar select')[1];
    expect((viewSelect.element as HTMLSelectElement).value).toBe('noDepartment');
    expect(request.mock.calls.some(([url]) => String(url).includes('noDepartment=true'))).toBe(true);
  });

  it('从今日登录卡下钻进入应按本地当日零点口径请求', async () => {
    vi.useFakeTimers();
    const anchor = new Date('2026-09-01T10:00:00Z');
    vi.setSystemTime(anchor);
    try {
      const expectedTodayIso = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).toISOString();
      const request = createRequestMock({
        ...baseHandlers,
        [`GET /iam/admin/users?page=1&size=10&lastLoginAfter=${encodeURIComponent(expectedTodayIso)}`]: usersPage
      });

      const wrapper = await mountView(request, { lastLogin: 'today' });

      const viewSelect = wrapper.findAll('.user-filter-bar select')[1];
      expect((viewSelect.element as HTMLSelectElement).value).toBe('today');
      expect(request.mock.calls.some(([url]) => String(url).includes('lastLoginAfter='))).toBe(true);
      expect(wrapper.text()).toContain('爱丽丝');
    } finally {
      vi.useRealTimers();
    }
  });

  it('状态筛选切换后应带状态参数重新请求，重置后恢复默认请求', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10&status=0': { ...usersPage, content: [] }
    });

    const wrapper = await mountView(request);
    const statusSelect = wrapper.findAll('.user-filter-bar select')[0];
    await statusSelect.setValue('0');
    await flushPromises();

    expect(request.mock.calls.some(([url]) => String(url).includes('status=0'))).toBe(true);
    expect(wrapper.text()).toContain('暂无符合条件的用户');

    await wrapper.get('.user-filter-bar .button-secondary').trigger('click');
    await flushPromises();

    expect((statusSelect.element as HTMLSelectElement).value).toBe('');
    expect(request.mock.calls.filter(([url]) => String(url) === '/iam/admin/users?page=1&size=10')).toHaveLength(2);
  });

  it('用户表应展示邮箱、手机号、状态徽标与时间列，锁定用户显示锁定截止', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10': {
        ...usersPage,
        content: [
          {
            ...usersPage.content[0],
            email: 'alice@example.com',
            phone: '13800000001',
            lastLoginAt: '2026-09-01T08:30:00Z',
            createdAt: '2026-01-15T02:00:00Z'
          },
          { ...usersPage.content[1], lockedUntil: '2099-01-01T00:00:00Z', status: 1 }
        ]
      }
    });

    const wrapper = await mountView(request);

    const headers = wrapper.findAll('thead th').map(th => th.text());
    expect(headers).toEqual(['用户', '部门', '邮箱', '手机号', '身份来源', '状态', '最近登录', '创建时间', '操作']);
    expect(wrapper.text()).toContain('alice@example.com');
    expect(wrapper.text()).toContain('13800000001');
    expect(wrapper.text()).toContain('锁定至');
    expect(wrapper.find('tbody .status-badge.success').exists()).toBe(true);
    expect(wrapper.findAll('.user-table .col-login, .user-table .col-created').length).toBeGreaterThanOrEqual(2);
  });

  it('锁定用户行应展示解锁操作，点击后调用解锁端点并刷新列表', async () => {
    const lockedPage = {
      ...usersPage,
      content: [
        { ...usersPage.content[0], lockedUntil: '2099-01-01T00:00:00Z' },
        usersPage.content[1]
      ]
    };
    const unlocked = vi.fn().mockReturnValue(null);
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10': () => lockedPage,
      'PUT /iam/admin/users/2/unlock': unlocked
    });

    const wrapper = await mountView(request);

    const rows = wrapper.findAll('tbody tr');
    const aliceRow = rows.find(row => row.text().includes('alice'))!;
    const bobRow = rows.find(row => row.text().includes('bob'))!;
    expect(aliceRow.text()).toContain('解锁');
    expect(bobRow.text()).not.toContain('解锁');

    await aliceRow.findAll('button').find(button => button.text() === '解锁')!.trigger('click');
    await flushPromises();

    expect(unlocked).toHaveBeenCalledWith('/iam/admin/users/2/unlock', { method: 'PUT' });
    expect(wrapper.text()).toContain('已解锁 alice');
  });

  it('普通、禁用、锁定三类用户行均展示删除入口，删除经确认框 DELETE 并刷新列表', async () => {
    const deleteSpy = vi.fn().mockReturnValue(undefined);
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10': {
        ...usersPage,
        content: [
          { ...usersPage.content[0], username: 'plain-user' },
          { ...usersPage.content[1], username: 'disabled-user', status: 0 },
          { ...usersPage.content[0], id: 4, username: 'locked-user', lockedUntil: '2099-01-01T00:00:00Z' }
        ]
      },
      'DELETE /iam/admin/users/4': deleteSpy
    });

    const wrapper = await mountView(request);
    const rows = wrapper.findAll('tbody tr');
    for (const row of rows) {
      expect(row.text()).toContain('删除');
    }

    const lockedRow = rows.find(row => row.text().includes('locked-user'))!;
    await lockedRow.findAll('button').find(button => button.text() === '删除')!.trigger('click');
    await flushPromises();

    const dialog = wrapper.get('.confirm-dialog');
    expect(dialog.text()).toContain('locked-user');
    expect(dialog.text()).toContain('不可恢复');
    await dialog.get('.button-danger').trigger('click');
    await flushPromises();

    expect(deleteSpy).toHaveBeenCalledWith('/iam/admin/users/4', { method: 'DELETE' });
    expect(wrapper.text()).toContain('已删除用户 locked-user');
  });

  it('删除详情抽屉正打开的用户后应关闭抽屉并提示成功', async () => {
    const deleteSpy = vi.fn().mockReturnValue(undefined);
    const request = createRequestMock({
      ...baseHandlers,
      'GET /iam/admin/users?page=1&size=10': {
        ...usersPage,
        content: [{ ...usersPage.content[1], id: 7, username: 'disabled-user', status: 0 }]
      },
      'DELETE /iam/admin/users/7': deleteSpy,
      'GET /iam/admin/users/7/roles': [],
      'GET /iam/admin/users/7/application-authorizations': []
    });

    const wrapper = await mountView(request);
    const row = wrapper.get('tbody tr');
    await row.findAll('button')[0].trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('disabled-user');

    await row.findAll('button').find(button => button.text() === '删除')!.trigger('click');
    await flushPromises();
    await wrapper.get('.confirm-dialog .button-danger').trigger('click');
    await flushPromises();

    expect(deleteSpy).toHaveBeenCalledWith('/iam/admin/users/7', { method: 'DELETE' });
    expect(wrapper.text()).toContain('已删除用户 disabled-user');
  });

  it('删除被服务端拒绝（如最后一个管理员）时应展示错误且不发成功提示', async () => {
    const request = createRequestMock({
      ...baseHandlers,
      'DELETE /iam/admin/users/2': () => Promise.reject(new Error('最后一个可用管理员不可删除'))
    });

    const wrapper = await mountView(request);
    const row = wrapper.findAll('tbody tr')[0];
    await row.findAll('button').find(button => button.text() === '删除')!.trigger('click');
    await flushPromises();
    await wrapper.get('.confirm-dialog .button-danger').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('最后一个可用管理员不可删除');
    expect(wrapper.text()).not.toContain('已删除用户');
  });
});
