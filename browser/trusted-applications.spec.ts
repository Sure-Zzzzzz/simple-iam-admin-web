import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const applicationPage = {
  content: [{ id: 1, applicationCode: 'demo', applicationName: '示例应用', description: '用于展示。', icon: 'access-control', clientCount: 1, portalEnabled: false }],
  totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
};
const applicationDetail = {
  id: 1,
  applicationCode: 'demo',
  applicationName: '示例应用',
  description: '用于展示。',
  icon: 'access-control',
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

test('生产构建中可信应用目录提供管理能力', async ({ page }) => {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationPage }));
  await page.route('**/iam/admin/trusted-applications/1/permission-manifest', route => route.fulfill({ json: permissionManifest }));
  await page.route('**/iam/admin/trusted-applications/1', route => route.fulfill({ json: applicationDetail }));

  await page.goto('/app/iam/trusted-applications');
  await expect(page.getByRole('button', { name: '新建可信应用' })).toBeVisible();
  await expect(page.getByRole('button', { name: '管理' })).toBeVisible();

  await page.getByRole('button', { name: '示例应用' }).click();
  await expect(page.getByLabel('示例应用').getByRole('heading', { name: '门户集成' })).toBeVisible();
  await expect(page.getByLabel('示例应用').getByRole('heading', { name: '权限清单' })).toBeVisible();
  await expect(page.getByLabel('示例应用').getByRole('heading', { name: 'OAuth2 客户端' })).toBeVisible();
  await expect(page.getByLabel('示例应用').getByText('demo-web')).toBeVisible();
  await expect(page.getByRole('button', { name: '添加客户端' })).toBeVisible();
});

test('新建可信应用后一次性展示服务端生成的初始客户端密钥', async ({ page }) => {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationPage }));
  await page.route('**/iam/admin/trusted-applications/1', route => route.fulfill({ json: applicationDetail }));
  await page.route('**/iam/admin/trusted-applications', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { application: { id: 2, applicationCode: 'workflow' }, initialClientSecret: 'browser-once-secret' } });
    } else {
      await route.fulfill({ json: applicationPage });
    }
  });

  await page.goto('/app/iam/trusted-applications');
  await page.getByRole('button', { name: '新建可信应用' }).click();
  await page.getByPlaceholder('如 demo').fill('workflow');
  await page.getByPlaceholder('应用名称').fill('流程中心');
  await page.getByPlaceholder('OAuth2 client_id').fill('workflow-web');
  await page.getByPlaceholder('客户端名称').fill('流程中心 Web 端');
  await page.getByPlaceholder('https://app.example.com/login/oauth2/code/iam').fill('https://a.example.com/cb');
  await page.getByPlaceholder('openid profile message.read').fill('openid profile');
  await page.getByRole('button', { name: '创建应用' }).click();

  await expect(page.locator('.secret-reveal')).toContainText('workflow-web');
  await expect(page.locator('.secret-reveal')).toContainText('browser-once-secret');
  await expect(page.getByText('可信应用已创建：workflow，初始客户端密钥见抽屉内提示')).toBeVisible();
});

test('详情抽屉门户菜单编辑器随门户开关启用并整表保存', async ({ page }) => {
  let savedPayload: { portal?: { enabled?: boolean; menus?: unknown } } | null = null;
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationPage }));
  await page.route('**/iam/admin/trusted-applications/1/resource-verification-clients', route => route.fulfill({ json: [] }));
  await page.route('**/iam/admin/trusted-applications/1/permission-manifest', route => route.fulfill({ json: permissionManifest }));
  await page.route('**/iam/admin/trusted-applications/1', async route => {
    if (route.request().method() === 'PUT') {
      savedPayload = route.request().postDataJSON();
    }
    await route.fulfill({ json: applicationDetail });
  });

  await page.goto('/app/iam/trusted-applications');
  await page.getByRole('button', { name: '示例应用' }).click();
  await expect(page.getByLabel('示例应用').getByText('门户路由前缀：/app/demo')).toBeVisible();

  await expect(page.getByRole('button', { name: '添加菜单' })).toBeDisabled();
  await page.locator('label.checkbox-field input').check();
  await expect(page.getByRole('button', { name: '添加菜单' })).toBeEnabled();
  await page.getByPlaceholder('如 /app/iam/ 或完整 URL').fill('/app/demo/');
  await page.getByPlaceholder('如 /iam/').fill('/demo/');

  await page.getByRole('button', { name: '添加菜单' }).click();
  await page.getByPlaceholder('如 workspace').fill('workspace');
  await page.getByPlaceholder('如 工作台').fill('工作台');
  await page.getByPlaceholder('如 /organizations').fill('/workspace');
  await page.getByRole('button', { name: '保存应用资料' }).click();

  await expect(page.getByText('应用资料已更新')).toBeVisible();
  expect(savedPayload.portal.enabled).toBe(true);
  expect(savedPayload.portal.menus).toEqual([{ code: 'workspace', name: '工作台', route: '/workspace', sortOrder: 1 }]);
});

test('详情抽屉权限清单申报应整表提交并展示新版本', async ({ page }) => {
  const putBodies = [];
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/admin/trusted-applications/page?**', route => route.fulfill({ json: applicationPage }));
  await page.route('**/iam/admin/trusted-applications/1/resource-verification-clients', route => route.fulfill({ json: [] }));
  await page.route('**/iam/admin/trusted-applications/1', route => route.fulfill({ json: applicationDetail }));
  await page.route('**/iam/admin/trusted-applications/1/permission-manifest', async route => {
    if (route.request().method() === 'PUT') {
      putBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { ...permissionManifest, roles: ['app-admin', 'app-user'], manifestVersion: 3, manifestDigest: 'digest-3' } });
      return;
    }
    await route.fulfill({ json: permissionManifest });
  });

  await page.goto('/app/iam/trusted-applications');
  await page.getByRole('button', { name: '示例应用' }).click();

  const drawer = page.getByLabel('示例应用');
  await expect(drawer.locator('.manifest-stats')).toBeVisible();
  await expect(drawer.locator('.manifest-stats')).toContainText('v2');
  await expect(drawer.locator('.manifest-stats')).toContainText('DATA 资源');

  const manifestForm = page.locator('form.drawer-form', { hasText: '应用角色编码' });
  await expect(manifestForm.locator('textarea').nth(0)).toHaveValue('app-admin');
  await manifestForm.locator('textarea').nth(0).fill('app-admin\napp-user');
  await manifestForm.getByRole('button', { name: '保存权限清单' }).click();

  await expect(page.getByText('权限清单已保存（当前版本 v3）')).toBeVisible();
  expect(putBodies).toEqual([
    {
      roles: ['app-admin', 'app-user'],
      pagePermissions: ['demo:home:page'],
      apiPermissions: ['demo:order:api'],
      dataResources: [{ resource: 'demo:order', actions: ['read', 'write'], dimensions: ['departmentId'] }]
    }
  ]);
});
