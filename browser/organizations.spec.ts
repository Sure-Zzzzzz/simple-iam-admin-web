import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const rootDepartment = { id: 10, code: 'headquarters', name: '总部', parentId: null, status: 1, sortOrder: 0 };
const childDepartment = { id: 11, code: 'research', name: '研发部', parentId: 10, status: 1, sortOrder: 0 };
const alice = { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 10, departmentName: '总部', status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const bob = { id: 3, username: 'bob', displayName: '鲍勃', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const noticeGroup = { id: 3, code: 'notice', name: '通知组', description: '', status: 1, createdAt: '', updatedAt: '' };
const opsGroup = { id: 7, code: 'ops', name: '运维组', description: '', status: 1, createdAt: '', updatedAt: '' };
const operatorRole = { id: 4, code: 'operator', name: '运营角色', description: '', builtIn: 0 };
const auditorRole = { id: 6, code: 'auditor', name: '审计角色', description: '', builtIn: 0 };

function makeWorkspace(members = { content: [alice], totalElements: 1, totalPages: 1, number: 0, size: 20 }) {
  return {
    department: { ...rootDepartment, parentName: null, createdAt: '', updatedAt: '' },
    directChildren: [{ ...childDepartment, parentName: '总部', createdAt: '', updatedAt: '' }],
    members
  };
}

function makeProfile() {
  return {
    user: alice,
    department: { ...rootDepartment, parentName: null, createdAt: '', updatedAt: '' },
    userGroups: [noticeGroup],
    roles: [{ ...operatorRole, source: 'direct' }],
    effectivePermissions: [{ id: 5, code: 'iam:user:page', name: '用户页面', type: 'page', source: 'direct' }]
  };
}

async function mockShell(page) {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { providers: [] } }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: { content: [alice, bob], totalElements: 2, totalPages: 1, number: 0, size: 100 } }));
}

async function mockWorkspaceBase(page, workspace = makeWorkspace()) {
  await page.route('**/iam/admin/departments', route => route.fulfill({
    json: [
      { ...rootDepartment, parentName: null, createdAt: '', updatedAt: '' },
      { ...childDepartment, parentName: '总部', createdAt: '', updatedAt: '' }
    ]
  }));
  await page.route('**/iam/admin/user-groups', route => route.fulfill({ json: [noticeGroup, opsGroup] }));
  await page.route('**/iam/admin/roles', route => route.fulfill({ json: [operatorRole, auditorRole] }));
  await page.route('**/iam/admin/organizations/tree', route => route.fulfill({
    json: [{ ...rootDepartment, directMemberCount: 1, children: [{ ...childDepartment, directMemberCount: 0, children: [] }] }]
  }));
  await page.route('**/iam/admin/organizations/departments/10/workspace**', route => route.fulfill({ json: workspace }));
  await page.route('**/iam/admin/departments/*/roles', route => route.fulfill({ json: [] }));
}

test('从空态创建根部门并继续创建下级部门', async ({ page }) => {
  await mockShell(page);
  const state = {
    departments: [] as object[],
    tree: [] as object[],
    workspace: makeWorkspace({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 })
  };
  await page.route('**/iam/admin/departments', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: state.departments });
    const body = route.request().postDataJSON();
    const created = { id: 10, code: body.code, name: body.name, parentId: body.parentId, status: 1, sortOrder: body.sortOrder };
    state.departments.push({ ...created, parentName: null, createdAt: '', updatedAt: '' });
    if (created.parentId === null) {
      state.tree = [{ ...created, directMemberCount: 0, children: [] }];
      state.workspace = makeWorkspace({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
      state.workspace.directChildren = [];
    } else {
      const rootNode = state.tree[0] as { children: object[] };
      rootNode.children.push({ ...created, directMemberCount: 0, children: [] });
      state.workspace = makeWorkspace();
      state.workspace.department = { ...rootDepartment, parentName: null, createdAt: '', updatedAt: '' };
    }
    return route.fulfill({ json: created });
  });
  await page.route('**/iam/admin/user-groups', route => route.fulfill({ json: [] }));
  await page.route('**/iam/admin/roles', route => route.fulfill({ json: [] }));
  await page.route('**/iam/admin/organizations/tree', route => route.fulfill({ json: state.tree }));
  await page.route('**/iam/admin/organizations/departments/10/workspace**', route => route.fulfill({ json: state.workspace }));
  await page.route('**/iam/admin/departments/*/roles', route => route.fulfill({ json: [] }));

  await page.goto('/app/iam/organizations');
  await expect(page.getByText('尚未创建根部门')).toBeVisible();

  await page.getByRole('button', { name: '创建首个根部门' }).click();
  const drawer = page.locator('.entity-drawer');
  await drawer.locator('input[placeholder="根部门编码"]').fill('headquarters');
  await drawer.locator('input[placeholder="根部门名称"]').fill('总部');
  await drawer.getByRole('button', { name: '创建部门' }).click();
  await expect(page.getByText('根部门已创建')).toBeVisible();
  await expect(page.locator('.organization-tree')).toContainText('总部');

  await page.getByRole('button', { name: '新建下级部门' }).click();
  await drawer.locator('input[placeholder="下级部门编码"]').fill('research');
  await drawer.locator('input[placeholder="下级部门名称"]').fill('研发部');
  await drawer.getByRole('button', { name: '创建部门' }).click();
  await expect(page.getByText('下级部门已创建')).toBeVisible();
  await expect(page.locator('.child-department-list')).toContainText('研发部');
  await expect(page.locator('.organization-tree')).toContainText('研发部');
});

test('编辑部门应提交改名并提示成功', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  let putBody = null;
  await page.route('**/iam/admin/departments/10', route => {
    if (route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...rootDepartment, name: putBody.name } });
    }
    return route.fulfill({ json: rootDepartment });
  });

  await page.goto('/app/iam/organizations');
  await page.getByRole('button', { name: '编辑部门' }).click();
  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('编辑部门');
  await drawer.locator('input[placeholder="部门名称"]').fill('集团总部');
  await drawer.getByRole('button', { name: '保存修改' }).click();

  await expect(page.getByText('部门已更新')).toBeVisible();
  expect(putBody).toEqual({ name: '集团总部', parentId: null, sortOrder: 0, status: 1 });
});

test('删除部门被拒时应展示后端保护文案', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  await page.route('**/iam/admin/departments/10', route => route.fulfill({
    status: 409,
    contentType: 'text/plain',
    body: '部门 headquarters 下仍有直属成员，无法删除'
  }));

  await page.goto('/app/iam/organizations');
  await page.getByRole('button', { name: '删除部门' }).click();
  await expect(page.locator('.confirm-dialog')).toContainText('删除会被拒绝');
  await page.getByRole('button', { name: '确认删除' }).click();

  await expect(page.getByText('部门 headquarters 下仍有直属成员，无法删除')).toBeVisible();
});

test('成员筛选与分页应携带查询参数并展示页码', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page, makeWorkspace({ content: [alice], totalElements: 21, totalPages: 2, number: 0, size: 20 }));
  const workspaceUrls: string[] = [];
  await page.route('**/iam/admin/organizations/departments/10/workspace**', route => {
    const url = route.request().url();
    workspaceUrls.push(url);
    const pageNum = Number(new URL(url).searchParams.get('page') || '1');
    return route.fulfill({ json: makeWorkspace({ content: [alice], totalElements: 21, totalPages: 2, number: pageNum - 1, size: 20 }) });
  });

  await page.goto('/app/iam/organizations');
  await expect(page.locator('.pagination button.active')).toHaveText('1');

  const filterBar = page.locator('.user-filter-bar');
  await filterBar.locator('input[type="search"]').fill('alice');
  await filterBar.locator('input[type="search"]').press('Enter');
  await expect(page.locator('.pagination button.active')).toHaveText('1');
  expect(workspaceUrls.at(-1)).toContain('keyword=alice');

  await filterBar.locator('select').selectOption('1');
  await expect(page.locator('.pagination button.active')).toHaveText('1');
  expect(workspaceUrls.at(-1)).toContain('page=1');
  expect(workspaceUrls.at(-1)).toContain('status=1');
  expect(workspaceUrls.at(-1)).toContain('keyword=alice');

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.pagination button.active')).toHaveText('2');
  expect(workspaceUrls.at(-1)).toContain('page=2');
});

test('成员画像可维护部门归属与协作组角色关系', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  const state = { profile: makeProfile() };
  await page.route('**/iam/admin/organizations/users/2/profile', route => route.fulfill({ json: state.profile }));
  const operations: string[] = [];
  await page.route('**/iam/admin/user-groups/*/users/2', route => {
    const groupId = Number(route.request().url().match(/user-groups\/(\d+)/)![1]);
    if (route.request().method() === 'POST') {
      operations.push(`POST user-group ${groupId}`);
      state.profile = { ...state.profile, userGroups: [...state.profile.userGroups, opsGroup] };
    } else {
      operations.push(`DELETE user-group ${groupId}`);
      state.profile = { ...state.profile, userGroups: state.profile.userGroups.filter(group => group.id !== groupId) };
    }
    return route.fulfill({ json: {} });
  });
  await page.route('**/iam/admin/users/2/roles/*', route => {
    const roleId = Number(route.request().url().match(/roles\/(\d+)/)![1]);
    if (route.request().method() === 'POST') {
      operations.push(`POST role ${roleId}`);
      state.profile = { ...state.profile, roles: [...state.profile.roles, auditorRole] };
    } else {
      operations.push(`DELETE role ${roleId}`);
      state.profile = { ...state.profile, roles: state.profile.roles.filter(role => role.id !== roleId) };
    }
    return route.fulfill({ json: {} });
  });
  let userPutBody = null;
  await page.route('**/iam/admin/users/2', route => {
    if (route.request().method() === 'PUT') {
      userPutBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...alice, departmentId: userPutBody.departmentId, departmentName: '研发部' } });
    }
    return route.fulfill({ json: alice });
  });

  await page.goto('/app/iam/organizations');
  await page.locator('tbody button').first().click();
  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('爱丽丝');

  await drawer.locator('select').selectOption('11');
  await drawer.getByRole('button', { name: '保存成员资料' }).click();
  await expect(page.getByText('成员资料与所属部门已更新')).toBeVisible();
  expect(userPutBody).toMatchObject({ departmentId: 11, clearDepartment: false });

  const sections = drawer.locator('.assignment-section');
  await sections.nth(0).locator('.assignment-list.available').getByRole('button', { name: '添加' }).click();
  await expect(page.getByText('成员已加入协作组')).toBeVisible();

  await drawer.locator('.assignment-list article', { hasText: '通知组' }).getByRole('button', { name: '移除' }).click();
  await page.getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByText('成员已移出协作组')).toBeVisible();

  await sections.nth(1).locator('.assignment-list.available').getByRole('button', { name: '添加' }).click();
  await expect(page.getByText('直接角色已分配')).toBeVisible();

  await drawer.locator('.assignment-list article', { hasText: '运营角色' }).getByRole('button', { name: '移除' }).click();
  await page.getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByText('成员的直接角色已移除', { exact: false })).toBeVisible();

  expect(operations).toEqual(['POST user-group 7', 'DELETE user-group 3', 'POST role 6', 'DELETE role 4']);
});

test('画像有效权限只读并可跳转用户管理', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  await page.route('**/iam/admin/organizations/users/2/profile', route => route.fulfill({ json: makeProfile() }));

  await page.goto('/app/iam/organizations');
  await page.locator('tbody button').first().click();
  const drawer = page.locator('.entity-drawer');

  const permissionSection = drawer.locator('.assignment-section').last();
  await expect(permissionSection).toContainText('iam:user:page · 页面权限');
  await expect(permissionSection).toContainText('仅供查看，不能在这里直接修改');
  await expect(permissionSection.getByRole('button')).toHaveCount(0);

  await drawer.getByRole('button', { name: '在用户管理中查看' }).click();
  await expect(page).toHaveURL(/\/app\/iam\/users\?keyword=alice$/);
});

test('添加已有成员应把未分配用户挂到当前部门', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  let putBody = null;
  await page.route('**/iam/admin/users/3', route => {
    if (route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...bob, departmentId: 10, departmentName: '总部' } });
    }
    return route.fulfill({ json: bob });
  });

  await page.goto('/app/iam/organizations');
  await page.getByRole('button', { name: '添加成员' }).click();
  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('选择要加入本部门的成员');
  await expect(drawer.locator('.member-option')).toHaveCount(1);
  await expect(drawer.locator('.member-option')).toContainText('bob');

  await drawer.locator('.member-option').getByRole('checkbox').check();
  await expect(drawer).toContainText('已选 1 人');
  await drawer.getByRole('button', { name: '添加选中的 1 名成员' }).click();

  await expect(page.getByText('已把 1 名成员加入总部')).toBeVisible();
  expect(putBody).toMatchObject({ displayName: '鲍勃', email: '', phone: '', departmentId: 10, clearDepartment: false });
});

test('移除成员应清空归属且不影响账号', async ({ page }) => {
  await mockShell(page);
  await mockWorkspaceBase(page);
  let putBody = null;
  await page.route('**/iam/admin/users/2', route => {
    if (route.request().method() === 'PUT') {
      putBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...alice, departmentId: null, departmentName: null } });
    }
    return route.fulfill({ json: alice });
  });

  await page.goto('/app/iam/organizations');
  await page.locator('.responsive-table tbody tr', { hasText: 'alice' }).getByRole('button', { name: '移除' }).click();
  const dialog = page.locator('.confirm-dialog');
  await expect(dialog).toContainText('移出部门');
  await expect(dialog).toContainText('爱丽丝');
  await expect(dialog).toContainText('不会删除账号');

  await dialog.getByRole('button', { name: '确认移出' }).click();
  await expect(page.getByText('已将 爱丽丝 移出部门')).toBeVisible();
  expect(putBody).toMatchObject({ displayName: '爱丽丝', departmentId: null, clearDepartment: true });
});
