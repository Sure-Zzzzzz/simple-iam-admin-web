import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import TrustedApplicationsView from './TrustedApplicationsView.vue';

const adminUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const trustedApplications = [{
  id: 1,
  applicationCode: 'demo',
  applicationName: '示例应用',
  description: '用于展示统一接入能力。',
  icon: 'access-control',
  clientCount: 1,
  portalEnabled: false,
  builtIn: false
}];
const applicationDetail = {
  id: 1,
  applicationCode: 'demo',
  applicationName: '示例应用',
  description: '用于展示统一接入能力。',
  icon: 'access-control',
  builtIn: false,
  portal: { enabled: false, routePrefix: '/app/demo', menus: [] },
  clients: [{
    id: 11,
    clientId: 'demo-web',
    clientName: '示例 Web 端',
    clientType: 'CONFIDENTIAL',
    requireConsent: true,
    redirectUris: ['https://demo.example.com/cb'],
    scopes: ['openid', 'profile']
  }]
};

const portalApplicationDetail = {
  ...applicationDetail,
  portal: {
    enabled: true,
    routePrefix: '/app/demo',
    entry: '/app/demo/',
    apiBase: '/demo/',
    defaultEntry: null,
    configVersion: 2,
    menus: [{ code: 'workspace', name: '工作台', route: '/workspace', sortOrder: 1 }]
  }
};
const pageBody = {
  content: trustedApplications,
  totalElements: 1,
  totalPages: 1,
  page: 1,
  size: 10,
  numberOfElements: 1,
  first: true,
  last: true,
  empty: false
};
const resourceVerificationClients = [{
  clientId: 'demo-resource',
  applicationId: 1,
  status: 1,
  createdAt: '2026-08-31T08:00:00Z',
  updatedAt: '2026-08-31T08:00:00Z',
  revokedAt: null
}];
const permissionManifest = {
  applicationId: 1,
  roles: ['app-admin'],
  pagePermissions: ['demo:home:page'],
  apiPermissions: ['demo:order:api'],
  dataResources: [{ resource: 'demo:order', actions: ['read', 'write'], dimensions: ['departmentId'] }],
  manifestVersion: 2,
  manifestDigest: 'digest-2',
  createdAt: '2026-08-31T08:00:00Z',
  updatedAt: '2026-08-31T08:00:00Z'
};

const builtInApplicationDetail = {
  ...applicationDetail,
  id: 3,
  applicationCode: 'iam',
  applicationName: 'IAM 管理台',
  builtIn: true
};

function mountView() {
  return mount(TrustedApplicationsView);
}

function installBridge(request: ReturnType<typeof vi.fn>) {
  applyAdminBridge({
    currentUser: adminUser,
    request: createRuntimeRequest(request),
    refreshCurrentUser: async () => adminUser,
    refreshUnreadCount: async () => undefined,
    onUnauthorized: () => undefined
  });
}

function createRequestMock() {
  return vi.fn((url: string, init?: { method?: string; body?: string }) => {
    if (url === '/iam/admin/portal/login-landing') {
      return Promise.resolve({ applicationCode: null, version: 3 });
    }
    if (url === '/iam/admin/trusted-applications' && init?.method === 'POST') {
      return Promise.resolve({ application: { id: 2, applicationCode: 'workflow' }, initialClientSecret: 'app-once-secret' });
    }
    if (url === '/iam/admin/trusted-applications/1/clients' && init?.method === 'POST') {
      return Promise.resolve({ clientId: 'workflow-web', clientSecret: 'once-9f-secret' });
    }
    if (url === '/iam/admin/trusted-applications/1/resource-verification-clients' && init?.method === 'POST') {
      return Promise.resolve({ clientId: 'demo-resource-2', clientSecret: 'resource-once-secret' });
    }
    if (url.includes('/resource-verification-clients/') && url.endsWith('/secret') && init?.method === 'POST') {
      return Promise.resolve({ clientId: 'demo-resource', clientSecret: 'rotated-secret' });
    }
    if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') {
      return Promise.resolve(resourceVerificationClients);
    }
    if (url.endsWith('/permission-manifest') && init?.method === 'PUT') {
      return Promise.resolve({ ...permissionManifest, manifestVersion: 3 });
    }
    if (url.endsWith('/permission-manifest')) {
      return Promise.resolve(permissionManifest);
    }
    if (url === '/iam/admin/trusted-applications/1') {
      return Promise.resolve(applicationDetail);
    }
    if (url === '/iam/admin/trusted-applications/3') {
      return Promise.resolve(builtInApplicationDetail);
    }
    return Promise.resolve(pageBody);
  });
}

async function clickButton(wrapper: ReturnType<typeof mountView>, text: string) {
  const button = wrapper.findAll('button').find(candidate => candidate.text() === text);
  expect(button, `按钮应存在：${text}`).toBeTruthy();
  await button!.trigger('click');
}

describe('TrustedApplicationsView', () => {
  beforeEach(() => applyAdminBridge());

  afterEach(() => {
    applyAdminBridge();
    vi.restoreAllMocks();
  });

  it('展示应用资料、客户端数、门户可见状态与入口操作', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/trusted-applications/page?page=1&size=10', {});
    expect(wrapper.text()).toContain('示例应用');
    expect(wrapper.text()).toContain('demo');
    expect(wrapper.text()).toContain('门户已隐藏');
    expect(wrapper.text()).toContain('1 个');
    expect(wrapper.text()).toContain('管理');
    expect(wrapper.text()).toContain('新建可信应用');
  });

  it('新建可信应用应提交应用资料与初始客户端并一次性展示服务端生成的密钥', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await clickButton(wrapper, '新建可信应用');

    const form = wrapper.get('form.drawer-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('workflow');
    await inputs[1].setValue('流程中心');
    await inputs[2].setValue('workflow-web');
    await inputs[3].setValue('流程中心 Web 端');
    await inputs[4].setValue('openid profile');
    await form.findAll('textarea')[1].setValue('https://a.example.com/cb\nhttps://b.example.com/cb');
    await form.trigger('submit');
    await flushPromises();

    const createCall = request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications' && init?.method === 'POST');
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall![1]!.body!)).toEqual({
      applicationCode: 'workflow',
      applicationName: '流程中心',
      description: '',
      icon: 'default',
      initialClient: {
        clientId: 'workflow-web',
        clientName: '流程中心 Web 端',
        clientType: 'CONFIDENTIAL',
        requireConsent: true,
        redirectUris: ['https://a.example.com/cb', 'https://b.example.com/cb'],
        scopes: ['openid', 'profile'],
        grantTypes: ['authorization_code', 'refresh_token'],
        authenticationMethods: ['client_secret_basic']
      }
    });
    const reveal = wrapper.get('.secret-reveal');
    expect(reveal.text()).toContain('workflow-web');
    expect(reveal.text()).toContain('app-once-secret');
    expect(wrapper.text()).toContain('可信应用已创建：workflow，初始客户端密钥见抽屉内提示');
  });

  it('新建可信应用选择公共客户端时不展示密钥回显', async () => {
    const request = vi.fn((url: string, init?: { method?: string; body?: string }) => {
      if (url === '/iam/admin/trusted-applications' && init?.method === 'POST') {
        return Promise.resolve({ application: { id: 2, applicationCode: 'workflow' }, initialClientSecret: null });
      }
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await clickButton(wrapper, '新建可信应用');

    const form = wrapper.get('form.drawer-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('workflow');
    await inputs[1].setValue('流程中心');
    await inputs[2].setValue('workflow-web');
    await inputs[3].setValue('流程中心 Web 端');
    await inputs[4].setValue('openid profile');
    await form.findAll('select')[1].setValue('PUBLIC');
    await form.findAll('textarea')[1].setValue('https://a.example.com/cb');
    await form.trigger('submit');
    await flushPromises();

    const payload = JSON.parse(request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications' && init?.method === 'POST')![1]!.body!);
    expect(payload.initialClient.clientType).toBe('PUBLIC');
    expect(payload.initialClient.authenticationMethods).toEqual(['none']);
    expect(wrapper.find('.secret-reveal').exists()).toBe(false);
    expect(wrapper.text()).toContain('可信应用已创建：workflow');
    expect(wrapper.text()).not.toContain('初始客户端密钥见抽屉内提示');
  });

  it('打开详情提供资料编辑、门户集成与客户端管理', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/trusted-applications/1', {});
    expect(request).toHaveBeenCalledWith('/iam/admin/trusted-applications/1/resource-verification-clients', {});
    expect(request).toHaveBeenCalledWith('/iam/admin/trusted-applications/1/permission-manifest', {});
    const text = wrapper.text();
    expect(text).toContain('基本资料');
    expect(text).toContain('门户集成');
    expect(text).toContain('权限清单');
    expect(text).toContain('OAuth2 客户端');
    expect(text).toContain('demo-web');
    expect(text).toContain('门户路由前缀：/app/demo');
    expect(text).toContain('资源校验客户端');
    expect(text).toContain('demo-resource');
    expect(text).toContain('生效中');
    expect(text).toContain('添加客户端');
    expect(text).toContain('删除可信应用');
  });

  it('权限清单申报应回显当前版本并整表提交三类码', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    const stats = wrapper.get('.manifest-stats');
    expect(stats.text()).toContain('清单版本');
    expect(stats.text()).toContain('v2');
    expect(stats.text()).toContain('DATA 资源');

    const manifestForm = wrapper.findAll('form.drawer-form').find(form => form.text().includes('应用角色编码'));
    expect(manifestForm).toBeTruthy();
    const textareas = manifestForm!.findAll('textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('app-admin');
    await textareas[0].setValue('app-admin\napp-user');
    await manifestForm!.trigger('submit');
    await flushPromises();

    const putCall = request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/permission-manifest' && init?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1]!.body!)).toEqual({
      roles: ['app-admin', 'app-user'],
      pagePermissions: ['demo:home:page'],
      apiPermissions: ['demo:order:api'],
      dataResources: [{ resource: 'demo:order', actions: ['read', 'write'], dimensions: ['departmentId'] }]
    });
    expect(wrapper.text()).toContain('权限清单已保存（当前版本 v3）');
  });

  it('DATA 资源申报应支持多行粘贴并按三段格式解析提交', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    const manifestForm = wrapper.findAll('form.drawer-form').find(form => form.text().includes('应用角色编码'));
    expect(manifestForm).toBeTruthy();
    const resourceTextarea = manifestForm!.findAll('textarea')
      .find(textarea => (textarea.element as HTMLTextAreaElement).placeholder.includes('demo:order |'));
    expect(resourceTextarea).toBeTruthy();
    expect((resourceTextarea!.element as HTMLTextAreaElement).value).toBe('demo:order | read, write | departmentId');

    await resourceTextarea!.setValue('demo:order | read, write | departmentId\ndemo:asset | read, export | orgId, region');
    await manifestForm!.trigger('submit');
    await flushPromises();

    const putCall = request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/permission-manifest' && init?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1]!.body!).dataResources).toEqual([
      { resource: 'demo:order', actions: ['read', 'write'], dimensions: ['departmentId'] },
      { resource: 'demo:asset', actions: ['read', 'export'], dimensions: ['orgId', 'region'] }
    ]);
  });

  it('DATA 资源行格式非法应报行号且不发 PUT', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    const manifestForm = wrapper.findAll('form.drawer-form').find(form => form.text().includes('应用角色编码'));
    const resourceTextarea = manifestForm!.findAll('textarea')
      .find(textarea => (textarea.element as HTMLTextAreaElement).placeholder.includes('demo:order |'));
    await resourceTextarea!.setValue('demo:order | read\ndemo:asset | read | orgId');
    await manifestForm!.trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('DATA 资源第 1 行格式应为');
    expect(request.mock.calls.filter(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/permission-manifest' && init?.method === 'PUT')).toHaveLength(0);
  });

  it('内置应用详情不提供删除入口并提示走门户集成下线', async () => {
    const request = vi.fn((url: string) => {
      if (url === '/iam/admin/trusted-applications/3') {
        return Promise.resolve(builtInApplicationDetail);
      }
      if (url === '/iam/admin/trusted-applications/3/resource-verification-clients') {
        return Promise.resolve([]);
      }
      if (url.endsWith('/permission-manifest')) {
        return Promise.resolve(permissionManifest);
      }
      return Promise.resolve({
        ...pageBody,
        content: [{
          ...trustedApplications[0],
          id: 3,
          applicationCode: 'iam',
          applicationName: 'IAM 管理台',
          builtIn: true
        }]
      });
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('内置应用');
    expect(text).toContain('不支持删除');
    expect(wrapper.findAll('button').some(button => button.text() === '删除可信应用')).toBe(false);
  });

  it('新建资源校验客户端成功后应一次性展示密钥', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await clickButton(wrapper, '新建资源校验客户端');

    const forms = wrapper.findAll('form.drawer-form');
    const form = forms[forms.length - 1];
    await form.get('input').setValue('demo-resource-2');
    await form.trigger('submit');
    await flushPromises();

    const createCall = request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/resource-verification-clients' && init?.method === 'POST');
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall![1]!.body!)).toEqual({ clientId: 'demo-resource-2' });
    expect(wrapper.get('.secret-reveal').text()).toContain('resource-once-secret');
  });

  it('轮换资源校验客户端密钥后应展示新密钥并刷新列表', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await clickButton(wrapper, '轮换密钥');

    await clickButton(wrapper, '确认轮换');
    await flushPromises();

    expect(request.mock.calls.some(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/resource-verification-clients/demo-resource/secret'
      && init?.method === 'POST')).toBe(true);
    expect(wrapper.get('.secret-reveal').text()).toContain('rotated-secret');
    expect(wrapper.text()).toContain('资源校验客户端密钥已轮换，旧密钥立即失效');
  });

  it('添加客户端成功后应一次性展示密钥', async () => {
    const request = createRequestMock();
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await clickButton(wrapper, '添加客户端');

    const forms = wrapper.findAll('form.drawer-form');
    const form = forms[forms.length - 1];
    const inputs = form.findAll('input');
    await inputs[0].setValue('workflow-web');
    await inputs[1].setValue('流程中心 Web 端');
    await inputs[2].setValue('openid');
    await form.findAll('textarea')[0].setValue('https://workflow.example.com/cb');
    await form.trigger('submit');
    await flushPromises();

    const clientCall = request.mock.calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/clients' && init?.method === 'POST');
    expect(clientCall).toBeTruthy();
    const payload = JSON.parse(clientCall![1]!.body!);
    expect(payload.grantTypes).toEqual(['authorization_code', 'refresh_token']);
    expect(payload.authenticationMethods).toEqual(['client_secret_basic']);
    expect(payload.clientSecret).toBeUndefined();
    expect(wrapper.get('.secret-reveal').text()).toContain('once-9f-secret');
  });

  it('门户菜单编辑器应将旧平铺菜单迁为 PAGE，并以 menuTree 整树提交', async () => {
    const request = vi.fn((url: string) => {
      if (url === '/iam/admin/trusted-applications/1') {
        return Promise.resolve(portalApplicationDetail);
      }
      if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') {
        return Promise.resolve([]);
      }
      if (url.endsWith('/permission-manifest')) {
        return Promise.resolve(permissionManifest);
      }
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    const existingNodes = wrapper.findAll('.menu-tree-node');
    expect(existingNodes).toHaveLength(1);
    expect(existingNodes[0].attributes('aria-current')).toBe('true');
    expect((wrapper.get('.menu-node-editor select').element as HTMLSelectElement).value).toBe('PAGE');
    expect((wrapper.get('.menu-node-editor').findAll('input')[1].element as HTMLInputElement).value).toBe('工作台');

    await clickButton(wrapper, '新增根级页面');
    const newInputs = wrapper.get('.menu-node-editor').findAll('input');
    await newInputs[0].setValue('billing');
    await newInputs[1].setValue('账单中心');
    await newInputs[2].setValue('/billing');
    await wrapper.get('[aria-label="用户与组织"]').trigger('click');

    await wrapper.findAll('.menu-tree-node')[0].trigger('click');
    await wrapper.get('[aria-label="移除当前节点"]').trigger('click');

    await wrapper.get('form.drawer-form').trigger('submit');
    await flushPromises();

    const calls = request.mock.calls as unknown as Array<[string, { method?: string; body?: string } | undefined]>;
    const updateCall = calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/portal/configuration' && init?.method === 'PUT');
    expect(updateCall).toBeTruthy();
    const payload = JSON.parse(updateCall![1]!.body!);
    expect(payload.enabled).toBe(true);
    expect(payload.defaultEntry).toBeNull();
    expect(payload.configVersion).toBe(2);
    expect(payload.menuTree).toEqual([{
      code: 'billing', name: '账单中心', nodeType: 'PAGE', icon: 'users', route: '/billing', requiredPagePermission: null, presentationMode: 'STANDARD', sortOrder: 1, children: []
    }]);
  });

  it('页面菜单选择沉浸展示时应完整提交展示模式', async () => {
    const request = vi.fn((url: string) => {
      if (url === '/iam/admin/trusted-applications/1') return Promise.resolve(portalApplicationDetail);
      if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') return Promise.resolve([]);
      if (url.endsWith('/permission-manifest')) return Promise.resolve(permissionManifest);
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await wrapper.get('select[aria-label="门户展示"]').setValue('IMMERSIVE');
    await wrapper.get('form.drawer-form').trigger('submit');
    await flushPromises();

    const calls = request.mock.calls as unknown as Array<[string, { method?: string; body?: string } | undefined]>;
    const updateCall = calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/portal/configuration' && init?.method === 'PUT');
    expect(updateCall).toBeTruthy();
    expect(JSON.parse(updateCall![1]!.body!).menuTree[0].presentationMode).toBe('IMMERSIVE');
  });

  it('默认页面、静态子路径和无深链登录首页应按独立乐观锁契约提交', async () => {
    const request = vi.fn((url: string, init?: { method?: string }) => {
      if (url === '/iam/admin/trusted-applications/1') return Promise.resolve(portalApplicationDetail);
      if (url === '/iam/admin/portal/login-landing') {
        return init?.method === 'PUT'
          ? Promise.resolve({ applicationCode: 'demo', version: 6 })
          : Promise.resolve({ applicationCode: null, version: 5 });
      }
      if (url === '/iam/admin/trusted-applications/1/portal/configuration') return Promise.resolve(portalApplicationDetail.portal);
      if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') return Promise.resolve([]);
      if (url.endsWith('/permission-manifest')) return Promise.resolve(permissionManifest);
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await wrapper.get('select[aria-label="默认页面"]').setValue('workspace');
    await wrapper.get('.portal-default-entry input').setValue('/workspace/overview');
    await wrapper.get('.portal-login-landing-field input').setValue(true);
    await wrapper.get('form.drawer-form').trigger('submit');
    await flushPromises();

    const calls = request.mock.calls as unknown as Array<[string, { method?: string; body?: string } | undefined]>;
    const configurationCall = calls.find(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/portal/configuration' && init?.method === 'PUT');
    expect(JSON.parse(configurationCall![1]!.body!).defaultEntry).toEqual({
      pageMenuCode: 'workspace', entryPath: '/workspace/overview'
    });
    const landingCall = calls.find(([url, init]) =>
      url === '/iam/admin/portal/login-landing' && init?.method === 'PUT');
    expect(JSON.parse(landingCall![1]!.body!)).toEqual({ applicationCode: 'demo', version: 5 });
  });

  it('门户菜单存在不完整 PAGE 时应阻断提交', async () => {
    const request = vi.fn((url: string) => {
      if (url === '/iam/admin/trusted-applications/1') {
        return Promise.resolve(portalApplicationDetail);
      }
      if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') {
        return Promise.resolve([]);
      }
      if (url.endsWith('/permission-manifest')) {
        return Promise.resolve(permissionManifest);
      }
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();

    await clickButton(wrapper, '新增根级页面');
    await wrapper.get('.menu-node-editor input').setValue('billing');
    await wrapper.get('form.drawer-form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('每个菜单都需填写编码和名称');
    const calls = request.mock.calls as unknown as Array<[string, { method?: string; body?: string } | undefined]>;
    expect(calls.some(([url, init]) =>
      url === '/iam/admin/trusted-applications/1/portal/configuration' && init?.method === 'PUT')).toBe(false);
  });

  it('门户菜单保存失败应在右上角通知中显示服务端错误', async () => {
    const request = vi.fn((url: string, init?: { method?: string }) => {
      if (url === '/iam/admin/trusted-applications/1') {
        return Promise.resolve(portalApplicationDetail);
      }
      if (url === '/iam/admin/trusted-applications/1/portal/configuration' && init?.method === 'PUT') {
        return Promise.reject(new Error('菜单配置保存失败'));
      }
      if (url === '/iam/admin/trusted-applications/1/resource-verification-clients') return Promise.resolve([]);
      if (url.endsWith('/permission-manifest')) return Promise.resolve(permissionManifest);
      return Promise.resolve(pageBody);
    });
    installBridge(request);

    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('.table-primary-action').trigger('click');
    await flushPromises();
    await wrapper.get('form.drawer-form').trigger('submit');
    await flushPromises();

    const notice = wrapper.get('.operation-notice');
    expect(notice.attributes('role')).toBe('alert');
    expect(notice.text()).toContain('Portal 配置未保存：菜单配置保存失败');
    const closeButton = notice.get('button[aria-label="关闭提示"]');
    expect(closeButton.element).toBeInstanceOf(HTMLButtonElement);
    await closeButton.trigger('click');
    expect(wrapper.find('.operation-notice').exists()).toBe(false);
  });
});
