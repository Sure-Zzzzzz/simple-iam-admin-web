import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UnauthorizedError,
  assignRolePermission,
  assignUserRole,
  configureAdminNavigator,
  assignUserGroupUser,
  createTrustedApplication,
  createTrustedApplicationClient,
  createDepartment,
  createMessage,
  createUser,
  createUserGroup,
  deleteTrustedApplication,
  deleteTrustedApplicationClient,
  deleteDepartment,
  deleteUser,
  deleteRoleAuthorizationRule,
  fetchActiveSessions,
  fetchAdminDashboard,
  fetchApplicationPermissionManifest,
  fetchDashboardRecentLogins,
  fetchTrustedApplication,
  fetchTrustedApplicationClients,
  fetchTrustedApplications,
  fetchCurrentUser,
  fetchDepartments,
  fetchRolePermissions,
  fetchRoleAuthorizationRule,
  fetchRoleMemberPage,
  fetchUserGroups,
  fetchUserGroupUsers,
  fetchRoles,
  fetchUserRoles,
  fetchUsers,
  grantUserApplication,
  permissionTypeLabel,
  putApplicationPermissionManifest,
  putRoleAuthorizationRule,
  resetUserPassword,
  revokeRolePermission,
  revokeUserSessions,
  revokeUserGroupUser,
  revokeUserRole,
  setAdminRequestBridge,
  updateTrustedApplication,
  updateTrustedApplicationClient,
  updateDepartment,
  updateUserGroup
} from './iamAuth';

describe('admin iamAuth api', () => {
  afterEach(() => {
    setAdminRequestBridge(null);
    configureAdminNavigator();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetchUsers 应通过 portal bridge 使用 1 基分页读取用户且不包含密码哈希', async () => {
    const page = {
      content: [{ id: 1, username: 'admin', status: 1 }], totalElements: 1, totalPages: 1,
      page: 2, size: 20, numberOfElements: 1, first: false, last: true, empty: false
    };
    const bridge = vi.fn().mockResolvedValue(page);
    setAdminRequestBridge(bridge);

    await expect(fetchUsers({ page: 2, size: 20, status: 1, keyword: 'admin' })).resolves.toEqual(page);
    expect(bridge).toHaveBeenCalledWith('/iam/admin/users?page=2&size=20&status=1&keyword=admin', {});
    expect(JSON.stringify(page)).not.toContain('passwordHash');
  });

  it('createUser 应通过 portal bridge 提交 JSON 创建用户', async () => {
    const bridge = vi.fn().mockResolvedValue({ id: 2, username: 'user' });
    setAdminRequestBridge(bridge);
    const payload = { username: 'user', password: 'User@1234', displayName: '用户', email: '', phone: '', departmentId: null };

    await createUser(payload);

    expect(bridge).toHaveBeenCalledWith('/iam/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  });

  it('用户密码重置只提交新密码，删除走用户资源接口', async () => {
    const bridge = vi.fn().mockResolvedValue(undefined);
    setAdminRequestBridge(bridge);

    await resetUserPassword(1, 'New@1234');
    await deleteUser(1);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/users/1/reset-password', {
      method: 'PUT',
      body: JSON.stringify({ newPassword: 'New@1234' })
    });
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/users/1', { method: 'DELETE' });
  });

  it('fetchRoles 应通过 portal bridge 读取角色列表', async () => {
    const roles = [{ id: 1, code: 'iam_admin', name: 'IAM 管理员', description: null, builtIn: 1 }];
    const bridge = vi.fn().mockResolvedValue(roles);
    setAdminRequestBridge(bridge);

    await expect(fetchRoles()).resolves.toEqual(roles);
    expect(bridge).toHaveBeenCalledWith('/iam/admin/roles', {});
  });

  it('fetchRoleMemberPage 应通过 portal bridge 分页读取角色成员', async () => {
    const page = {
      content: [{ id: 2, username: 'op-user', displayName: '运营甲', departmentName: '运营部', status: 1 }],
      totalElements: 1, totalPages: 1, page: 1, size: 100, numberOfElements: 1, first: true, last: true, empty: false
    };
    const bridge = vi.fn().mockResolvedValue(page);
    setAdminRequestBridge(bridge);

    await expect(fetchRoleMemberPage(1, { page: 1, size: 100 })).resolves.toEqual(page);
    expect(bridge).toHaveBeenCalledWith('/iam/admin/roles/1/users/page?page=1&size=100', {});
  });

  it('站内信发送只调用管理端发送接口', async () => {
    const bridge = vi.fn().mockResolvedValue({ recipientCount: 2 });
    setAdminRequestBridge(bridge);

    await createMessage({ recipientUserIds: [2, 3], departmentIds: [4], userGroupIds: [5], includeChildDepartments: true, title: '通知', content: '内容' });

    expect(bridge).toHaveBeenCalledWith('/iam/admin/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientUserIds: [2, 3], departmentIds: [4], userGroupIds: [5], includeChildDepartments: true, title: '通知', content: '内容' })
    });
    expect(bridge.mock.calls.map(call => call[0])).not.toContain('/iam/web/messages');
  });

  it('部门和协作组接口应通过 portal bridge 调用对应 REST 资源', async () => {
    const bridge = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    setAdminRequestBridge(bridge);

    await fetchDepartments();
    await createDepartment({ code: 'tech', name: '技术部', parentId: null, sortOrder: 0, status: 1 });
    await updateDepartment(1, { name: '研发部', parentId: null, sortOrder: 1, status: 1 });
    await deleteDepartment(1);
    await fetchUserGroups();
    await createUserGroup({ code: 'ops', name: '运营组', description: '', status: 1 });
    await updateUserGroup(2, { name: '运营通知组', description: '通知', status: 1 });
    await fetchUserGroupUsers(2);
    await assignUserGroupUser(2, 3);
    await revokeUserGroupUser(2, 3);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/departments', {});
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/departments', { method: 'POST', body: JSON.stringify({ code: 'tech', name: '技术部', parentId: null, sortOrder: 0, status: 1 }) });
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/departments/1', { method: 'PUT', body: JSON.stringify({ name: '研发部', parentId: null, sortOrder: 1, status: 1 }) });
    expect(bridge).toHaveBeenNthCalledWith(4, '/iam/admin/departments/1', { method: 'DELETE' });
    expect(bridge).toHaveBeenNthCalledWith(5, '/iam/admin/user-groups', {});
    expect(bridge).toHaveBeenNthCalledWith(6, '/iam/admin/user-groups', { method: 'POST', body: JSON.stringify({ code: 'ops', name: '运营组', description: '', status: 1 }) });
    expect(bridge).toHaveBeenNthCalledWith(7, '/iam/admin/user-groups/2', { method: 'PUT', body: JSON.stringify({ name: '运营通知组', description: '通知', status: 1 }) });
    expect(bridge).toHaveBeenNthCalledWith(8, '/iam/admin/user-groups/2/users', {});
    expect(bridge).toHaveBeenNthCalledWith(9, '/iam/admin/user-groups/2/users/3', { method: 'POST' });
    expect(bridge).toHaveBeenNthCalledWith(10, '/iam/admin/user-groups/2/users/3', { method: 'DELETE' });
  });

  it('portal bridge 返回未登录时应触发统一未授权处理', async () => {
    const onUnauthorized = vi.fn();
    const bridge = vi.fn().mockRejectedValue(new UnauthorizedError());
    setAdminRequestBridge(bridge, onUnauthorized);

    await expect(fetchUsers()).rejects.toThrow('未登录');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('独立运行时未登录应跳回登录页并带 redirect', async () => {
    const navigate = vi.fn();
    configureAdminNavigator(navigate);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    window.history.pushState({}, '', '/app/iam/users?tab=roles');

    await expect(fetchCurrentUser()).rejects.toThrow('未登录');
    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fapp%2Fiam%2Fusers%3Ftab%3Droles');
  });

  it('角色-权限分配/撤销应通过 portal bridge 调用对应接口', async () => {
    const bridge = vi.fn()
      .mockResolvedValueOnce([{ id: 2, code: 'iam:role:api', name: '角色接口', description: null, type: 'api', builtIn: 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    setAdminRequestBridge(bridge);

    await expect(fetchRolePermissions(1)).resolves.toHaveLength(1);
    await assignRolePermission(1, 2);
    await revokeRolePermission(1, 2);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/roles/1/permissions', {});
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/roles/1/permissions/2', { method: 'POST' });
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/roles/1/permissions/2', { method: 'DELETE' });
  });

  it('用户-角色分配/撤销应通过 portal bridge 调用对应接口', async () => {
    const bridge = vi.fn()
      .mockResolvedValueOnce([{ id: 1, code: 'iam_admin', name: 'IAM 管理员', description: null, builtIn: 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    setAdminRequestBridge(bridge);

    await expect(fetchUserRoles(2)).resolves.toHaveLength(1);
    await assignUserRole(2, 1);
    await revokeUserRole(2, 1);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/users/2/roles', {});
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/users/2/roles/1', { method: 'POST' });
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/users/2/roles/1', { method: 'DELETE' });
  });

  it('权限清单 GET 已登记返回详情、未登记消息归一为 null，PUT 全量提交三类码与 DATA 资源', async () => {
    const manifest = {
      applicationId: 7, roles: ['app-admin'], pagePermissions: [], apiPermissions: ['app:order:api'],
      dataResources: [{ resource: 'iam:user', actions: ['read', 'write'], dimensions: ['departmentId'] }],
      manifestVersion: 3, manifestDigest: 'abc', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z'
    };
    const bridge = vi.fn()
      .mockResolvedValueOnce(manifest)
      .mockRejectedValueOnce(new Error('可信应用未登记权限清单：id=7'))
      .mockResolvedValueOnce({ ...manifest, manifestVersion: 4 });
    setAdminRequestBridge(bridge);

    await expect(fetchApplicationPermissionManifest(7)).resolves.toEqual(manifest);
    await expect(fetchApplicationPermissionManifest(7)).resolves.toBeNull();
    await putApplicationPermissionManifest(7, {
      roles: manifest.roles,
      pagePermissions: [],
      apiPermissions: manifest.apiPermissions,
      dataResources: manifest.dataResources
    });

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/trusted-applications/7/permission-manifest', {});
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/trusted-applications/7/permission-manifest', {
      method: 'PUT',
      body: JSON.stringify({
        roles: ['app-admin'],
        pagePermissions: [],
        apiPermissions: ['app:order:api'],
        dataResources: [{ resource: 'iam:user', actions: ['read', 'write'], dimensions: ['departmentId'] }]
      })
    });
  });

  it('grantUserApplication 提交体只含准入与四类授权内容，不携带 manifest 字段', async () => {
    const bridge = vi.fn().mockResolvedValue(undefined);
    setAdminRequestBridge(bridge);

    await grantUserApplication(2, 7, {
      roles: ['app-user'], pagePermissions: [], apiPermissions: [], dataGrantDocument: null
    });

    expect(bridge).toHaveBeenCalledWith('/iam/admin/users/2/application-authorizations/7', {
      method: 'PUT',
      body: JSON.stringify({ admitted: true, roles: ['app-user'], pagePermissions: [], apiPermissions: [], dataGrantDocument: null })
    });
  });

  it('角色授权规则 GET 有规则返回详情、404 空态归一为 null，PUT 提交两数组与数据授权模板，DELETE 幂等调用', async () => {
    const dataGrantTemplate = {
      protocol: 'simple-data-permission' as const,
      version: '1.0' as const,
      grants: [
        {
          resource: 'iam:user',
          actions: ['read'],
          all: false,
          constraints: [{ dimension: 'departmentId', operator: 'IN' as const, values: ['D01'] }]
        }
      ]
    };
    const rule = {
      roleId: 3,
      applicationId: 7,
      pagePermissions: ['iam:user:page'],
      apiPermissions: ['iam:user:api'],
      dataGrantTemplate,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    };
    const bridge = vi.fn()
      .mockResolvedValueOnce(rule)
      .mockRejectedValueOnce(Object.assign(new Error('资源不存在（404）'), { httpStatus: 404 }))
      .mockResolvedValueOnce(rule)
      .mockResolvedValueOnce(undefined);
    setAdminRequestBridge(bridge);

    await expect(fetchRoleAuthorizationRule(3, 7)).resolves.toEqual(rule);
    await expect(fetchRoleAuthorizationRule(3, 7)).resolves.toBeNull();
    await putRoleAuthorizationRule(3, 7, {
      pagePermissions: ['iam:user:page'],
      apiPermissions: ['iam:user:api'],
      dataGrantTemplate
    });
    await deleteRoleAuthorizationRule(3, 7);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/roles/3/authorization-rules/7', {});
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/roles/3/authorization-rules/7', {
      method: 'PUT',
      body: JSON.stringify({
        pagePermissions: ['iam:user:page'],
        apiPermissions: ['iam:user:api'],
        dataGrantTemplate
      })
    });
    expect(bridge).toHaveBeenNthCalledWith(4, '/iam/admin/roles/3/authorization-rules/7', { method: 'DELETE' });
  });

  it('permissionTypeLabel 应把英文枚举翻译为中文标签', () => {
    expect(permissionTypeLabel('page')).toBe('页面权限');
    expect(permissionTypeLabel('api')).toBe('接口权限');
    expect(permissionTypeLabel('data')).toBe('数据权限');
    expect(permissionTypeLabel(null)).toBe('-');
  });

  it('可信应用和嵌套 Client CRUD 应通过 portal bridge 调用对应接口', async () => {
    const createPayload = {
      applicationCode: 'demo', applicationName: '示例应用', description: '', icon: '',
      initialClient: {
        clientId: 'demo-client', clientName: '示例 Client', clientType: 'CONFIDENTIAL' as const,
        clientSecret: 'plain-secret', requireConsent: true, redirectUris: ['https://example.com/cb'],
        scopes: ['openid'], grantTypes: ['authorization_code'], authenticationMethods: ['client_secret_basic']
      }
    };
    const updatePayload = { applicationName: '示例应用2', description: '更新', icon: 'app' };
    const clientUpdatePayload = {
      clientName: '示例 Client2', requireConsent: false, redirectUris: ['https://example.com/cb'],
      scopes: ['openid', 'profile']
    };
    const trustedApplicationPage = {
      content: [{ id: 7, applicationCode: 'demo', applicationName: '示例应用', description: null, icon: null, clientCount: 1, portalEnabled: false }],
      totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
    };
    const bridge = vi.fn()
      .mockResolvedValueOnce(trustedApplicationPage)
      .mockResolvedValueOnce({ id: 7, ...updatePayload, clientCount: 1, portalEnabled: false })
      .mockResolvedValueOnce({ id: 7, ...updatePayload, clientCount: 1, portalEnabled: false })
      .mockResolvedValueOnce([{ id: 'uuid', clientId: 'demo-client', clientName: '示例 Client', clientType: 'CONFIDENTIAL', requireConsent: true, requireProofKey: false, redirectUris: [], scopes: [], grantTypes: ['authorization_code'], authenticationMethods: [], clientIdIssuedAt: null, secretPresent: true }])
      .mockResolvedValueOnce({ id: 'uuid-2', clientId: 'demo-client-2', clientSecret: 'plain-secret' })
      .mockResolvedValueOnce({ id: 'uuid', clientId: 'demo-client', clientType: 'CONFIDENTIAL', requireProofKey: false, secretPresent: true, ...clientUpdatePayload })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    setAdminRequestBridge(bridge);

    await expect(fetchTrustedApplications()).resolves.toEqual(trustedApplicationPage);
    await createTrustedApplication(createPayload);
    await updateTrustedApplication(7, updatePayload);
    await fetchTrustedApplicationClients(7);
    await createTrustedApplicationClient(7, { ...createPayload.initialClient, clientId: 'demo-client-2' });
    await updateTrustedApplicationClient(7, 'demo-client', clientUpdatePayload);
    await deleteTrustedApplicationClient(7, 'demo-client');
    await deleteTrustedApplication(7);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/trusted-applications/page?page=1&size=20', {});
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/trusted-applications', { method: 'POST', body: JSON.stringify(createPayload) });
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/trusted-applications/7', { method: 'PUT', body: JSON.stringify(updatePayload) });
    expect(bridge).toHaveBeenNthCalledWith(4, '/iam/admin/trusted-applications/7/clients', {});
    expect(bridge).toHaveBeenNthCalledWith(5, '/iam/admin/trusted-applications/7/clients', { method: 'POST', body: JSON.stringify({ ...createPayload.initialClient, clientId: 'demo-client-2' }) });
    expect(bridge).toHaveBeenNthCalledWith(6, '/iam/admin/trusted-applications/7/clients/demo-client', { method: 'PUT', body: JSON.stringify(clientUpdatePayload) });
    expect(bridge).toHaveBeenNthCalledWith(7, '/iam/admin/trusted-applications/7/clients/demo-client', { method: 'DELETE' });
    expect(bridge).toHaveBeenNthCalledWith(8, '/iam/admin/trusted-applications/7', { method: 'DELETE' });
  });

  it('fetchTrustedApplication 应按数字 applicationId 查询可信应用详情', async () => {
    const bridge = vi.fn().mockResolvedValue({ id: 7, applicationCode: 'demo', applicationName: '示例', description: null, icon: null, portal: null, clients: [] });
    setAdminRequestBridge(bridge);

    await fetchTrustedApplication(7);
    expect(bridge).toHaveBeenCalledWith('/iam/admin/trusted-applications/7', {});
  });

  it('仪表盘聚合、最近登录分页、会话查询与强制下线应调用对应管理端接口', async () => {
    const dashboard = {
      counts: { user: 1, department: 0, userGroup: 0, role: 0, permission: 0, trustedApplication: 0 },
      stats: { activeSessions: 1, todayLoggedInUsers: 1, lockedUsers: 0, disabledUsers: 0, usersWithoutDepartment: 0 }
    };
    const emptyPage = (page: number, size: number) => ({
      content: [], totalElements: 0, totalPages: 0, page, size, numberOfElements: 0, first: page <= 1, last: true, empty: true
    });
    const bridge = vi.fn()
      .mockResolvedValueOnce(dashboard)
      .mockResolvedValueOnce(emptyPage(2, 5))
      .mockResolvedValueOnce(emptyPage(1, 20))
      .mockResolvedValueOnce({ revoked: 2 });
    setAdminRequestBridge(bridge);

    await fetchAdminDashboard();
    await fetchDashboardRecentLogins({ page: 2, size: 5 });
    await fetchActiveSessions({ userId: 9, page: 1, size: 20 });
    await revokeUserSessions(9);

    expect(bridge).toHaveBeenNthCalledWith(1, '/iam/admin/dashboard', {});
    expect(bridge).toHaveBeenNthCalledWith(2, '/iam/admin/dashboard/recent-logins?page=2&size=5', {});
    expect(bridge).toHaveBeenNthCalledWith(3, '/iam/admin/sessions?page=1&size=20&userId=9', {});
    expect(bridge).toHaveBeenNthCalledWith(4, '/iam/admin/sessions/users/9/revoke', { method: 'PUT' });
  });

  it('fetchUsers 应把最近登录与锁定筛选序列化为 ISO-8601 查询参数', async () => {
    const bridge = vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 1, size: 100, numberOfElements: 0, first: true, last: true, empty: true });
    setAdminRequestBridge(bridge);

    await fetchUsers({ page: 1, size: 100, lastLoginAfter: '2026-09-01T00:00:00.000Z', lockedUntilAfter: '2026-09-01T08:00:00.000Z' });

    expect(bridge).toHaveBeenCalledWith(
      '/iam/admin/users?page=1&size=100&lastLoginAfter=2026-09-01T00%3A00%3A00.000Z&lockedUntilAfter=2026-09-01T08%3A00%3A00.000Z',
      {}
    );
  });

  it('独立运行时后端 JSON 错误体应提取 message 抛出，纯文本错误体保持原文', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/iam/web/auth/csrf') {
        return { ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token' }) };
      }
      if (url === '/iam/admin/departments/16') {
        return { ok: false, status: 409, text: () => Promise.resolve(JSON.stringify({ timestamp: '2026-09-01T12:00:00Z', message: '部门存在子部门，不能删除：research' })) };
      }
      return { ok: false, status: 502, text: () => Promise.resolve('上游网关暂时不可用') };
    }));

    await expect(deleteDepartment(16)).rejects.toThrow('部门存在子部门，不能删除：research');
    await expect(deleteDepartment(17)).rejects.toThrow('上游网关暂时不可用');
  });

  it('独立运行时 200 空 body 成功响应应按无数据处理而非解析报错', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/iam/web/auth/csrf') {
        return { ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token' }) };
      }
      return { ok: true, status: 200, text: () => Promise.resolve('') };
    }));

    await expect(assignUserRole(2, 6)).resolves.toBeUndefined();
  });
});
