import { expect, test } from '@playwright/test';

const delegateUser = { userId: 3, username: 'useradmin', displayName: '用户管理员', admin: false, authorities: ['ROLE_iam_user', 'iam:user:page', 'iam:user:api'] };
const usersPage = {
  content: [
    { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }
  ],
  totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
};
const roles = [
  { id: 1, code: 'iam_admin', name: 'IAM 管理员', description: '', builtIn: 1 }
];
const departments = [
  { id: 10, code: 'tech', name: '技术部', parentId: null, parentName: null, sortOrder: 0, status: 1, createdAt: '', updatedAt: '' }
];
const applicationsPage = {
  content: [], totalElements: 0, totalPages: 1, page: 1, size: 100, numberOfElements: 0, first: true, last: true, empty: true
};

async function mockDelegateSession(page) {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: delegateUser }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { providers: [] } }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: usersPage }));
  await page.route('**/iam/admin/roles', route => route.fulfill({ json: roles }));
  await page.route('**/iam/admin/departments', route => route.fulfill({ json: departments }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationsPage }));
}

test('委派用户：导航只留有权模块，有权页正常展示数据', async ({ page }) => {
  await mockDelegateSession(page);

  await page.goto('/app/iam/users');

  await expect(page.getByRole('cell', { name: 'alice' })).toBeVisible();
  await expect(page.locator('.iam-module-nav')).toContainText('用户管理');
  await expect(page.locator('.iam-module-nav')).not.toContainText('角色管理');
  await expect(page.locator('.iam-module-nav')).not.toContainText('仪表盘');
});

test('最小用户管理权限：不请求无权目录，用户列表仍可用', async ({ page }) => {
  const forbiddenCatalogRequests: string[] = [];
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: delegateUser }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: { providers: [] } }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: usersPage }));
  for (const pattern of ['**/iam/admin/roles', '**/iam/admin/departments', '**/iam/admin/trusted-applications/page?**']) {
    await page.route(pattern, route => {
      forbiddenCatalogRequests.push(route.request().url());
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: '权限不足' }) });
    });
  }

  await page.goto('/app/iam/users');

  await expect(page.getByRole('cell', { name: 'alice' })).toBeVisible();
  await expect(page.getByText('当前账号只具备部分用户管理范围')).toBeVisible();
  expect(forbiddenCatalogRequests).toEqual([]);
});

test('委派用户：直敲无权 URL 被 403 视图拦截', async ({ page }) => {
  await mockDelegateSession(page);

  await page.goto('/app/iam/roles');

  await expect(page.getByText('无权访问该页面')).toBeVisible();
  await expect(page.getByText('权限不足（403）')).toBeVisible();
});

test('委派用户：首页重定向到首个有权限页面', async ({ page }) => {
  await mockDelegateSession(page);

  await page.goto('/app/iam/');

  await expect(page).toHaveURL(/\/app\/iam\/users$/);
  await expect(page.getByRole('cell', { name: 'alice' })).toBeVisible();
});
