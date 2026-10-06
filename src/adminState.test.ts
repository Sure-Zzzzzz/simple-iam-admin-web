import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAdminBridge, createRuntimeRequest } from './adminState';
import { assignDepartmentRole, deleteRole, deleteRoleAuthorizationRule, putRoleAuthorizationRule, revokeDepartmentRole, updateRole, type OpenRoleBinding } from './api/iamAuth';

const binding: OpenRoleBinding = { openRoleId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', applicationId: 7, rootDepartmentId: 10, revision: 4, state: 'ACTIVE' };
const rolePayload = { name: '客户应用角色', description: '' };
const rulePayload = { pagePermissions: ['demo.home'], apiPermissions: [], dataGrantTemplate: null };

const conditionalWrites = [
  { name: '修改角色', path: '/iam/admin/roles/20', method: 'PUT', body: rolePayload, write: () => updateRole(20, rolePayload, binding) },
  { name: '删除角色', path: '/iam/admin/roles/20', method: 'DELETE', write: () => deleteRole(20, binding) },
  { name: '保存授权规则', path: '/iam/admin/roles/20/authorization-rules/7', method: 'PUT', body: rulePayload, write: () => putRoleAuthorizationRule(20, 7, rulePayload, binding) },
  { name: '清除授权规则', path: '/iam/admin/roles/20/authorization-rules/7', method: 'DELETE', write: () => deleteRoleAuthorizationRule(20, 7, binding) },
  { name: '部门挂载角色', path: '/iam/admin/departments/10/roles/20', method: 'POST', write: () => assignDepartmentRole(10, 20, binding) },
  { name: '部门撤销角色', path: '/iam/admin/departments/10/roles/20', method: 'DELETE', write: () => revokeDepartmentRole(10, 20, binding) }
];

describe('管理端请求桥', () => {
  afterEach(() => { applyAdminBridge(); });

  it.each(conditionalWrites)('$name经两层请求桥透传强条件头，不添加或替换读到的版本', async ({ path, method, body, write }) => {
    const transport = vi.fn().mockResolvedValue(undefined);
    applyAdminBridge({ request: createRuntimeRequest(transport) });
    await write();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenLastCalledWith(path, {
      method, headers: { 'if-match': '"open-role:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:4"' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  });

  it('普通角色不添加条件头，保留已有请求形态', async () => {
    const transport = vi.fn().mockResolvedValue(undefined);
    applyAdminBridge({ request: createRuntimeRequest(transport) });
    await updateRole(20, { name: '普通角色', description: '' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenLastCalledWith('/iam/admin/roles/20', {
      method: 'PUT', body: JSON.stringify({ name: '普通角色', description: '' })
    });
  });
});
