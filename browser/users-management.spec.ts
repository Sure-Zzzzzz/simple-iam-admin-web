import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const departments = [
  { id: 10, code: 'tech', name: '技术部', parentId: null, parentName: null, sortOrder: 0, status: 1, createdAt: '', updatedAt: '' }
];
const usersPage = {
  content: [
    { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 10, departmentName: '技术部', identitySource: 'ldap-password', status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }
  ],
  totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
};
const roles = [
  { id: 1, code: 'iam_admin', name: 'IAM 管理员', description: '', builtIn: 1 }
];
const userRoles = [
  { id: 2, code: 'app-user', name: '应用用户', description: '', builtIn: 0 }
];
const applicationsPage = {
  content: [
    { id: 5, applicationCode: 'demo', applicationName: '示例应用', description: '用于展示。', icon: null, clientCount: 1, portalEnabled: false }
  ],
  totalElements: 1, totalPages: 1, page: 1, size: 100, numberOfElements: 1, first: true, last: true, empty: false
};
const providers = { providers: [
  { code: 'ldap-password', displayName: 'LDAP 登录', type: 'ldap', enabled: true, description: null }
] };
const permissionManifest = {
  applicationId: 5,
  roles: ['app-admin', 'app-viewer', 'app-user'],
  pagePermissions: ['demo:home:page'],
  apiPermissions: [],
  dataResources: [{ resource: 'demo:order', actions: ['read'], dimensions: ['departmentId'] }],
  manifestVersion: 1,
  manifestDigest: 'digest-1',
  createdAt: '',
  updatedAt: ''
};
const activeAuthorization = { applicationId: 5, admitted: true, authorizationVersion: 2, manifestVersion: '1', status: 1, createdAt: '', updatedAt: '', revokedAt: null };
const revokedAuthorization = { applicationId: 5, admitted: true, authorizationVersion: 3, manifestVersion: '1', status: 0, createdAt: '', updatedAt: '', revokedAt: '2026-08-31T00:00:00Z' };

async function mockBase(page, authorizationList, onPut) {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: providers }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: usersPage }));
  await page.route('**/iam/admin/roles', route => route.fulfill({ json: roles }));
  await page.route('**/iam/admin/departments', route => route.fulfill({ json: departments }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationsPage }));
  await page.route('**/iam/admin/trusted-applications/5/permission-manifest', route => route.fulfill({ json: permissionManifest }));
  await page.route('**/iam/admin/users/2/roles', route => route.fulfill({ json: userRoles }));
  await page.route('**/iam/admin/users/2/application-authorizations**', route => {
    const method = route.request().method();
    if (method === 'PUT') {
      authorizationList.value = [activeAuthorization];
      if (onPut) {
        onPut(route.request().postDataJSON());
      }
    } else if (method === 'DELETE') {
      authorizationList.value = [revokedAuthorization];
    }
    return route.fulfill({ json: method === 'GET' ? authorizationList.value : {} });
  });
}

test('用户管理页展示用户与身份来源', async ({ page }) => {
  await mockBase(page, { value: [] });

  await page.goto('/app/iam/users');

  await expect(page.getByRole('cell', { name: 'alice' })).toBeVisible();
  await expect(page.getByText('LDAP')).toBeVisible();
});

test('授权准入应经抽屉从权限清单勾选并提交授权内容', async ({ page }) => {
  const putBodies = [];
  await mockBase(page, { value: [] }, body => putBodies.push(body));

  await page.goto('/app/iam/users');
  await page.locator('tbody button').first().click();
  await expect(page.locator('.app-auth-list.available')).toContainText('示例应用');

  await page.getByRole('button', { name: '+ 授权准入' }).click();

  const drawer = page.locator('.entity-drawer').filter({
    has: page.getByRole('heading', { name: /^授权：/ })
  });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('应用角色编码（已勾选 0/3）');
  await drawer.locator('.picker-options label', { hasText: 'app-admin' }).locator('input').check();
  await drawer.locator('.picker-options label', { hasText: 'app-viewer' }).locator('input').check();
  await expect(drawer).toContainText('当前无数据授权');
  await drawer.getByRole('button', { name: '保存授权' }).click();

  await expect(page.locator('.app-auth-list.available article')).toHaveCount(0);
  await expect(page.getByText('已授权应用')).toBeVisible();
  expect(putBodies).toEqual([
    {
      admitted: true,
      roles: ['app-admin', 'app-viewer'],
      pagePermissions: [],
      apiPermissions: [],
      dataGrantDocument: null
    }
  ]);
});

test('撤销授权应经确认框操作且确认框渲染在子应用容器内', async ({ page }) => {
  await mockBase(page, { value: [activeAuthorization] });

  await page.goto('/app/iam/users');
  await page.locator('tbody button').first().click();
  await page.getByRole('button', { name: '撤销授权' }).click();

  await expect(page.locator('.confirm-dialog')).toBeVisible();
  const insideAppRoot = await page.evaluate(() => {
    const dialog = document.querySelector('.confirm-dialog');
    return dialog ? Boolean(dialog.closest('.iam-admin-app')) : null;
  });
  expect(insideAppRoot).toBe(true);

  await page.locator('.confirm-dialog .button-danger').click();

  await expect(page.getByRole('button', { name: '重新授权' })).toBeVisible();
});

test('绑定外部身份应提交登录方式与外部标识', async ({ page }) => {
  let bindBody = null;
  await mockBase(page, { value: [] });
  const localUsersPage = { ...usersPage, content: [{ ...usersPage.content[0], identitySource: null }] };
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: localUsersPage }));
  await page.route('**/iam/admin/users/2/external-identity', route => {
    bindBody = route.request().postDataJSON();
    return route.fulfill({ json: {} });
  });

  await page.goto('/app/iam/users');
  await page.locator('tbody button').first().click();

  const bindForm = page.locator('form', { hasText: '绑定外部身份' });
  await bindForm.locator('select').selectOption('ldap-password');
  await bindForm.locator('input').fill('uid=alice,ou=people,dc=example');
  await bindForm.getByRole('button', { name: '绑定外部身份' }).click();

  await expect(page.getByText('外部身份已绑定')).toBeVisible();
  expect(bindBody).toEqual({ providerCode: 'ldap-password', externalId: 'uid=alice,ou=people,dc=example' });
});
