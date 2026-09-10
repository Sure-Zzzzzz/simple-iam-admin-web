import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from '../adminState';
import RolesView from './RolesView.vue';

const adminUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };

const roles = [
  { id: 1, code: 'business_op', name: '业务运营', description: '', builtIn: 0 },
  { id: 2, code: 'iam_admin', name: 'IAM 管理员', description: '', builtIn: 1 }
];
const rolePage = {
  content: roles, totalElements: roles.length, totalPages: 1,
  page: 1, size: 100, numberOfElements: roles.length, first: true, last: true, empty: false
};
const permissions = [
  { id: 10, code: 'iam:user:page', name: '用户管理页面', description: '', type: 'page', builtIn: 1 },
  { id: 11, code: 'iam:user:api', name: '用户管理接口', description: '', type: 'api', builtIn: 1 },
  { id: 12, code: 'iam:role:page', name: '角色管理页面', description: '', type: 'page', builtIn: 1 },
  { id: 13, code: 'iam:role:api', name: '角色管理接口', description: '', type: 'api', builtIn: 1 },
  { id: 14, code: 'iam:dashboard:api', name: '仪表盘统计接口', description: '', type: 'api', builtIn: 1 },
  { id: 15, code: 'iam:data:all', name: 'IAM全量数据', description: '', type: 'data', builtIn: 1 }
];
const members = [
  { id: 21, username: 'op-user', displayName: '运营甲', departmentName: '运营部', status: 1 },
  { id: 22, username: 'op-user-2', displayName: null, departmentName: null, status: 0 }
];
const memberPage = {
  content: members, totalElements: members.length, totalPages: 1,
  page: 1, size: 100, numberOfElements: members.length, first: true, last: true, empty: false
};
const emptyMemberPage = {
  content: [], totalElements: 0, totalPages: 0,
  page: 1, size: 100, numberOfElements: 0, first: true, last: true, empty: true
};
const trustedApps = [
  { id: 7, applicationCode: 'iam', applicationName: 'IAM 管理台', description: null, icon: null, clientCount: 1, portalEnabled: true, builtIn: true }
];
const trustedAppsPage = {
  content: trustedApps, totalElements: 1, totalPages: 1,
  page: 1, size: 100, numberOfElements: 1, first: true, last: true, empty: false
};

function bridgeWith(request: ReturnType<typeof vi.fn>) {
  applyAdminBridge({
    currentUser: adminUser,
    request: createRuntimeRequest(request),
    refreshCurrentUser: async () => adminUser,
    refreshUnreadCount: async () => undefined,
    onUnauthorized: () => undefined
  });
}

describe('RolesView', () => {
  beforeEach(() => {
    applyAdminBridge();
  });

  afterEach(() => {
    applyAdminBridge();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('列表走分页接口并在详情抽屉渲染角色成员', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(1, '/iam/admin/roles/page?page=1&size=100', {});
    expect(request).toHaveBeenNthCalledWith(2, '/iam/admin/permissions', {});

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(3, '/iam/admin/roles/1/permissions', {});
    expect(request).toHaveBeenNthCalledWith(4, '/iam/admin/roles/1/users/page?page=1&size=100', {});
    expect(request).toHaveBeenNthCalledWith(6, '/iam/admin/trusted-applications/page?page=1&size=100', {});
    expect(document.body.textContent).toContain('角色成员');
    expect(document.body.textContent).toContain('运营甲');
    expect(document.body.textContent).toContain('运营部');
  });

  // 打开角色抽屉会默认选中第一个可信应用，manifest+rule 两个请求固定占用第 7/8 位
  const defaultSelectManifest = {
    applicationId: 7,
    roles: [],
    pagePermissions: [],
    apiPermissions: [],
    dataResources: [],
    manifestVersion: 1,
    manifestDigest: 'digest',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  };
  const notFound404 = () => Object.assign(new Error('资源不存在（404）'), { httpStatus: 404 });

  function findPermissionGroupLabel(text: string): HTMLLabelElement {
    const picker = document.querySelectorAll<HTMLDivElement>('.assignment-section .picker-options')[0];
    const label = Array.from(picker.querySelectorAll<HTMLLabelElement>('label'))
      .find(item => item.textContent?.includes(text));
    expect(label).toBeTruthy();
    return label!;
  }

  it('权限按模块分组：page+api 成对模块合并一行，不成对模块单独成行不硬凑', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404());
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const picker = document.querySelectorAll<HTMLDivElement>('.assignment-section .picker-options')[0];
    const labels = Array.from(picker.querySelectorAll('label')).map(label => label.textContent?.trim());
    expect(labels).toContain('用户管理（页面 + 接口）');
    expect(labels).toContain('角色管理（页面 + 接口）');
    expect(labels).toContain('仪表盘统计（接口权限）');
    expect(labels).toContain('IAM全量数据（数据权限）');
    expect(labels.length).toBe(4);
  });

  it('权限模块行应展示权限说明，成对模块拼接两段说明，未填写说明的码不展示提示行', async () => {
    const describedPermissions = permissions.map(permission => {
      if (permission.code === 'iam:user:page') {
        return { ...permission, description: '查看用户管理菜单和页面' };
      }
      if (permission.code === 'iam:user:api') {
        return { ...permission, description: '调用用户管理相关接口' };
      }
      return permission;
    });
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(describedPermissions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404());
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const userGroupLabel = findPermissionGroupLabel('用户管理');
    expect(userGroupLabel.querySelector('.picker-option-hint')?.textContent)
      .toBe('查看用户管理菜单和页面 / 调用用户管理相关接口');

    const dashboardLabel = findPermissionGroupLabel('仪表盘统计');
    expect(dashboardLabel.querySelector('.picker-option-hint')).toBeFalsy();
  });

  it('合并开关勾选：组内缺的码逐个补发，全部生效后开关转为完全勾选', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([permissions[0], permissions[1]]);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const userGroupLabel = findPermissionGroupLabel('用户管理');
    expect(userGroupLabel.classList.contains('partly-checked')).toBe(true);
    const checkbox = userGroupLabel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(9, '/iam/admin/roles/1/permissions/11', { method: 'POST' });
    expect(request).toHaveBeenNthCalledWith(10, '/iam/admin/roles/1/permissions', {});
    expect(document.body.textContent).toContain('已为「用户管理」分配页面 + 接口');
  });

  it('合并开关取消：组内已绑的码逐个撤销，失败保留已生效项不回滚', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0], permissions[1]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('撤销失败'))
      .mockResolvedValueOnce([permissions[1]]);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const userGroupLabel = findPermissionGroupLabel('用户管理');
    expect(userGroupLabel.classList.contains('partly-checked')).toBe(false);
    const checkbox = userGroupLabel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(true);
    checkbox.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(9, '/iam/admin/roles/1/permissions/10', { method: 'DELETE' });
    expect(request).toHaveBeenNthCalledWith(10, '/iam/admin/roles/1/permissions/11', { method: 'DELETE' });
    expect(request).toHaveBeenNthCalledWith(11, '/iam/admin/roles/1/permissions', {});
    expect(document.body.textContent).toContain('以下权限撤销失败：iam:user:api');
  });

  it('角色效果预览：按类型汇总已分配权限，并按应用列出该角色将投影的权限', async () => {
    const rule = {
      roleId: 1,
      applicationId: 7,
      pagePermissions: ['iam:user:page', 'iam:role:page'],
      apiPermissions: ['iam:user:api'],
      dataGrantTemplate: {
        protocol: 'simple-data-permission',
        version: '1.0',
        grants: [{ resource: 'iam:user', actions: ['read'], all: false, constraints: [] }]
      },
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z'
    };
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0], permissions[4], permissions[5]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockResolvedValueOnce(rule);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('可访问页面（1）');
    expect(document.body.textContent).toContain('用户管理页面');
    expect(document.body.textContent).toContain('纯接口权限（1）');
    expect(document.body.textContent).toContain('仪表盘统计接口');
    expect(document.body.textContent).toContain('数据权限（1）');
    expect(document.body.textContent).toContain('IAM全量数据');
    expect(document.body.textContent).toContain('IAM 管理台 —— 页面 × 2、接口 × 1、数据授权 × 1');
  });

  it('角色对某应用无授权规则时（404）：投影预览按空态呈现，不弹错误提示', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404());
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('该角色在各应用均未配置授权规则。');
    expect(document.body.textContent).not.toContain('加载角色效果预览失败');
    expect(document.querySelector('[role="alert"]')).toBeFalsy();
  });

  it('两套编辑器标题与预览分区应各自独立，投影规则区块带显著视觉标记', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404());
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('IAM 管理台权限');
    expect(document.body.textContent).toContain('业务应用投影规则');
    expect(document.body.textContent).not.toContain('权限分配');
    expect(document.body.textContent).not.toContain('应用授权规则');

    const projectionSection = document.querySelector('.assignment-section--projection');
    expect(projectionSection).toBeTruthy();
    expect(projectionSection!.textContent).toContain('影响其他应用');
    expect(projectionSection!.textContent).toContain('该角色将投影的权限');
    expect(projectionSection!.querySelector('.status-badge.warning')).toBeTruthy();

    const iamPermissionSection = Array.from(document.querySelectorAll<HTMLElement>('.assignment-section'))
      .find(section => section.querySelector('h3')?.textContent?.includes('IAM 管理台权限'));
    expect(iamPermissionSection).toBeTruthy();
    expect(iamPermissionSection!.textContent).toContain('可访问页面');
    expect(iamPermissionSection!.textContent).toContain('纯接口权限');
    expect(iamPermissionSection!.textContent).not.toContain('该角色将投影的权限');
  });

  it('新建角色应提交 POST 并刷新列表', async () => {
    const createdRole = { id: 3, code: 'auditor', name: '审计员', description: '', builtIn: 0 };
    const refreshedPage = {
      content: [...roles, createdRole], totalElements: 3, totalPages: 1,
      page: 1, size: 100, numberOfElements: 3, first: true, last: true, empty: false
    };
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce(createdRole)
      .mockResolvedValueOnce(refreshedPage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(emptyMemberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage);
    bridgeWith(request);

    mount(RolesView, { attachTo: document.body });
    await flushPromises();

    const createButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('新建角色'));
    expect(createButton).toBeTruthy();
    createButton!.click();
    await flushPromises();

    const drawerInputs = document.querySelectorAll<HTMLInputElement>('.drawer-form input');
    const codeInput = Array.from(drawerInputs).find(input => input.placeholder?.includes('business_operator'));
    const nameInput = Array.from(drawerInputs).find(input => input.placeholder?.includes('业务运营'));
    expect(codeInput).toBeTruthy();
    expect(nameInput).toBeTruthy();
    codeInput!.value = 'auditor';
    codeInput!.dispatchEvent(new Event('input'));
    nameInput!.value = '审计员';
    nameInput!.dispatchEvent(new Event('input'));
    await flushPromises();

    const submitButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.drawer-form button[type="submit"]'))
      .find(button => button.textContent?.includes('创建角色'));
    expect(submitButton).toBeTruthy();
    submitButton!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(3, '/iam/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ code: 'auditor', name: '审计员', description: '' })
    });
    expect(document.body.textContent).toContain('角色创建成功');
  });

  it('删除角色前应拉取成员数并在确认框提示影响面', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce({ content: [], totalElements: 2, totalPages: 1, page: 1, size: 1, numberOfElements: 0, first: true, last: true, empty: true })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions);
    bridgeWith(request);

    mount(RolesView, { attachTo: document.body });
    await flushPromises();

    const deleteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('tbody .table-action.danger'));
    expect(deleteButtons.length).toBe(1);
    deleteButtons[0].click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(3, '/iam/admin/roles/1/users/page?page=1&size=1', {});
    expect(document.body.textContent).toContain('2 名成员将在下次请求时失去对应权限');

    const confirmButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog button'))
      .find(button => button.textContent?.includes('删除'));
    expect(confirmButton).toBeTruthy();
    confirmButton!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(4, '/iam/admin/roles/1', { method: 'DELETE' });
    expect(document.body.textContent).toContain('角色已删除');
  });

  it('内置角色行不渲染删除按钮', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions);
    bridgeWith(request);

    mount(RolesView, { attachTo: document.body });
    await flushPromises();

    const dangerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('tbody .table-action.danger'));
    expect(dangerButtons.length).toBe(1);
    const firstRow = document.querySelectorAll('tbody tr')[0];
    const secondRow = document.querySelectorAll('tbody tr')[1];
    expect(firstRow!.textContent).toContain('业务运营');
    expect(secondRow!.textContent).toContain('IAM 管理员');
  });

  it('应用授权应默认选中第一个应用按清单勾选保存规则，404 空态按空规则呈现', async () => {
    const manifest = {
      applicationId: 7,
      roles: [],
      pagePermissions: ['iam:user:page', 'iam:role:page'],
      apiPermissions: ['iam:user:api'],
      dataResources: [{ resource: 'iam:user', actions: ['read', 'write'], dimensions: ['departmentId'] }],
      manifestVersion: 1,
      manifestDigest: 'digest',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    };
    const savedRule = {
      roleId: 1,
      applicationId: 7,
      pagePermissions: ['iam:user:page'],
      apiPermissions: [],
      dataGrantTemplate: null,
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z'
    };
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(manifest)
      .mockRejectedValueOnce(Object.assign(new Error('资源不存在（404）'), { httpStatus: 404 }))
      .mockResolvedValueOnce(savedRule);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    // 打开抽屉即默认选中第一个应用，清单与规则自动加载
    expect(request).toHaveBeenNthCalledWith(7, '/iam/admin/trusted-applications/7/permission-manifest', {});
    expect(request).toHaveBeenNthCalledWith(8, '/iam/admin/roles/1/authorization-rules/7', {});
    expect(document.body.textContent).toContain('尚未配置规则，勾选后保存即创建');

    const checkbox = Array.from(document.querySelectorAll<HTMLInputElement>('.picker-options input[type="checkbox"]'))
      .find(input => input.parentElement?.textContent?.includes('iam:user:page'));
    expect(checkbox).toBeTruthy();
    checkbox!.click();
    await flushPromises();

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.drawer-form button[type="submit"]'))
      .find(button => button.textContent?.includes('保存规则'));
    expect(saveButton).toBeTruthy();
    saveButton!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(9, '/iam/admin/roles/1/authorization-rules/7', {
      method: 'PUT',
      body: JSON.stringify({ pagePermissions: ['iam:user:page'], apiPermissions: [], dataGrantTemplate: null })
    });
    expect(document.body.textContent).toContain('已保存 1 个应用的授权规则');
  });

  it('数据授权模板应按清单申报下拉编辑并组装提交', async () => {
    const manifest = {
      applicationId: 7,
      roles: [],
      pagePermissions: [],
      apiPermissions: [],
      dataResources: [
        { resource: 'iam:user', actions: ['read', 'write'], dimensions: ['departmentId'] },
        { resource: 'iam:order', actions: ['read'], dimensions: [] }
      ],
      manifestVersion: 1,
      manifestDigest: 'digest',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    };
    const savedRule = {
      roleId: 1,
      applicationId: 7,
      pagePermissions: [],
      apiPermissions: [],
      dataGrantTemplate: null,
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z'
    };
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(manifest)
      .mockRejectedValueOnce(Object.assign(new Error('资源不存在（404）'), { httpStatus: 404 }))
      .mockResolvedValueOnce(savedRule);
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    const addGrant = Array.from(document.querySelectorAll<HTMLButtonElement>('.rule-grant-list button'))
      .find(button => button.textContent?.includes('添加数据授权'));
    expect(addGrant).toBeTruthy();
    addGrant!.click();
    await flushPromises();

    const card = document.querySelector('.rule-grant-card')!;
    expect((card.querySelector('select') as HTMLSelectElement).value).toBe('iam:user');

    const readCheck = Array.from(card.querySelectorAll<HTMLInputElement>('.picker-options input[type="checkbox"]'))
      .find(input => input.parentElement?.textContent?.includes('read'));
    expect(readCheck).toBeTruthy();
    readCheck!.click();
    await flushPromises();

    const addConstraint = Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('添加约束'));
    expect(addConstraint).toBeTruthy();
    addConstraint!.click();
    await flushPromises();

    const constraintRow = card.querySelector('.rule-constraint-row')!;
    expect((constraintRow.querySelector('select') as HTMLSelectElement).value).toBe('departmentId');
    const valueInput = constraintRow.querySelector('input') as HTMLInputElement;
    valueInput.value = 'D01, D02';
    valueInput.dispatchEvent(new Event('input'));
    await flushPromises();

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.drawer-form button[type="submit"]'))
      .find(button => button.textContent?.includes('保存规则'));
    saveButton!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(9, '/iam/admin/roles/1/authorization-rules/7', {
      method: 'PUT',
      body: JSON.stringify({
        pagePermissions: [],
        apiPermissions: [],
        dataGrantTemplate: {
          protocol: 'simple-data-permission',
          version: '1.0',
          grants: [
            {
              resource: 'iam:user',
              actions: ['read'],
              all: false,
              constraints: [{ dimension: 'departmentId', operator: 'IN', values: ['D01', 'D02'] }]
            }
          ]
        }
      })
    });
  });

  it('应用多选应出现页签切换并批量保存全部勾选应用的规则', async () => {
    const manifestFor = (applicationId: number) => ({
      applicationId,
      roles: [],
      pagePermissions: applicationId === 7 ? ['iam:user:page'] : ['aksk:credential:page'],
      apiPermissions: [],
      dataResources: [],
      manifestVersion: 1,
      manifestDigest: 'digest',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    });
    const savedFor = (applicationId: number) => ({
      roleId: 1,
      applicationId,
      pagePermissions: [],
      apiPermissions: [],
      dataGrantTemplate: null,
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z'
    });
    const twoAppsPage = {
      content: [
        ...trustedApps,
        { id: 8, applicationCode: 'aksk', applicationName: 'AKSK 凭证管理台', description: null, icon: null, clientCount: 1, portalEnabled: true, builtIn: false }
      ],
      totalElements: 2, totalPages: 1, page: 1, size: 100, numberOfElements: 2, first: true, last: true, empty: false
    };
    const notFound = () => Object.assign(new Error('资源不存在（404）'), { httpStatus: 404 });
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(twoAppsPage)
      .mockResolvedValueOnce(manifestFor(7))
      .mockRejectedValueOnce(notFound())
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce(manifestFor(8))
      .mockResolvedValueOnce(savedFor(7))
      .mockResolvedValueOnce(savedFor(8));
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    // 打开抽屉即默认选中第一个应用（7）并按共享缓存预取全部可信应用（7、8）的已保存规则用于效果预览
    expect(request).toHaveBeenNthCalledWith(7, '/iam/admin/trusted-applications/7/permission-manifest', {});
    expect(request).toHaveBeenNthCalledWith(8, '/iam/admin/roles/1/authorization-rules/7', {});
    expect(request).toHaveBeenNthCalledWith(9, '/iam/admin/roles/1/authorization-rules/8', {});

    // 再勾选第二个应用（8）才会拉取其权限清单；规则已被预览预取缓存命中，不重复打接口
    const appCheckbox = Array.from(document.querySelectorAll<HTMLInputElement>('.picker-group .picker-options input[type="checkbox"]'))
      .find(input => input.parentElement?.textContent?.includes('AKSK'));
    expect(appCheckbox).toBeTruthy();
    appCheckbox!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(10, '/iam/admin/trusted-applications/8/permission-manifest', {});

    const tabs = Array.from(document.querySelectorAll('.rule-app-tabs button'));
    expect(tabs.length).toBe(2);
    expect(tabs[1]!.textContent).toContain('AKSK');

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.drawer-form button[type="submit"]'))
      .find(button => button.textContent?.includes('保存规则'));
    expect(saveButton!.textContent).toContain('2 个应用');
    saveButton!.click();
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(11, '/iam/admin/roles/1/authorization-rules/7', {
      method: 'PUT',
      body: JSON.stringify({ pagePermissions: [], apiPermissions: [], dataGrantTemplate: null })
    });
    expect(request).toHaveBeenNthCalledWith(12, '/iam/admin/roles/1/authorization-rules/8', {
      method: 'PUT',
      body: JSON.stringify({ pagePermissions: [], apiPermissions: [], dataGrantTemplate: null })
    });
    expect(document.body.textContent).toContain('已保存 2 个应用的授权规则');
  });

  it('角色详情应展示继承来源部门且为只读', async () => {
    const departments = [
      { id: 10, code: 'headquarters', name: '总部', parentId: null, parentName: null, status: 1, sortOrder: 0, createdAt: '', updatedAt: '' },
      { id: 11, code: 'research', name: '研发部', parentId: 10, parentName: '总部', status: 1, sortOrder: 0, createdAt: '', updatedAt: '' }
    ];
    const request = vi.fn()
      .mockResolvedValueOnce(rolePage)
      .mockResolvedValueOnce(permissions)
      .mockResolvedValueOnce([permissions[0]])
      .mockResolvedValueOnce(memberPage)
      .mockResolvedValueOnce(departments)
      .mockResolvedValueOnce(trustedAppsPage)
      .mockResolvedValueOnce(defaultSelectManifest)
      .mockRejectedValueOnce(notFound404());
    bridgeWith(request);

    const wrapper = mount(RolesView, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('tbody button').trigger('click');
    await flushPromises();

    expect(request).toHaveBeenCalledWith('/iam/admin/roles/1/departments', {});
    const section = Array.from(document.querySelectorAll<HTMLElement>('.assignment-section'))
      .find(section => section.querySelector('h3')?.textContent?.includes('继承来源部门'));
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain('总部');
    expect(section!.textContent).toContain('研发部');
    expect(section!.querySelector('button')).toBeFalsy();
    expect(section!.textContent).toContain('请到组织与成员中维护部门角色挂载关系');
  });
});
