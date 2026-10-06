import { expect, test, type Page } from '@playwright/test';

const openRoleId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const user = { subjectId: 'sid-admin', username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };

async function mockOpenRole(page: Page, conflict = false) {
  let revision = 5;
  let name = '客户应用角色';
  let ruleExists = true;
  const writes: { method: string; path: string; condition: string | undefined }[] = [];
  const role = () => ({ id: 20, code: 'open_demo', name, description: '', builtIn: 0,
    openRoleBinding: { openRoleId, applicationId: 7, rootDepartmentId: 10, revision, state: 'ACTIVE' } });
  const rule = { roleId: 20, applicationId: 7, pagePermissions: [], apiPermissions: [], dataGrantTemplate: null, createdAt: '', updatedAt: '' };
  const paged = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, page: 1, size: 100, numberOfElements: content.length, first: true, last: true, empty: !content.length });
  await page.route('**/iam/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/app/')) return route.continue();
    const method = request.method();
    if (method !== 'GET') {
      writes.push({ method, path, condition: request.headers()['if-match'] });
      if (conflict) {
        revision = 6;
        name = '最新客户角色';
        return route.fulfill({ status: 412, json: { message: '版本已变化' } });
      }
      revision++;
    }
    if (path === '/iam/web/auth/me') return route.fulfill({ json: user });
    if (path === '/iam/web/auth/csrf') return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'mock-csrf' } });
    if (path === '/iam/admin/roles/page') return route.fulfill({ json: paged([role()]) });
    if (path === '/iam/admin/roles/20') return route.fulfill({ json: role() });
    if (path.endsWith('/permissions') || path.endsWith('/departments')) return route.fulfill({ json: [] });
    if (path.endsWith('/users/page')) return route.fulfill({ json: paged([]) });
    if (path === '/iam/admin/trusted-applications/page') return route.fulfill({ json: paged([
      { id: 7, applicationCode: 'demo', applicationName: '客户应用', clientCount: 1, portalEnabled: true, builtIn: false },
      { id: 8, applicationCode: 'other', applicationName: '其他应用', clientCount: 1, portalEnabled: true, builtIn: false }
    ]) });
    if (path === '/iam/admin/trusted-applications/7/permission-manifest') return route.fulfill({ json: {
      applicationId: 7, roles: [], pagePermissions: [], apiPermissions: [], dataResources: [], manifestVersion: 1, manifestDigest: 'mock', createdAt: '', updatedAt: ''
    } });
    if (path === '/iam/admin/roles/20/authorization-rules/7') {
      if (method === 'DELETE') { ruleExists = false; return route.fulfill({ status: 204 }); }
      if (method === 'PUT') ruleExists = true;
      return ruleExists ? route.fulfill({ json: rule }) : route.fulfill({ status: 404 });
    }
    return route.abort();
  });
  return writes;
}

for (const width of [1280, 390]) {
  test(`受委托角色固定应用与规则版本闭环（${width}px）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockOpenRole(page);
    await page.goto('/app/iam/roles');
    await page.locator('.table-primary-action').click();
    const drawer = page.locator('.entity-drawer');
    await expect(drawer.locator('.open-role-details')).toContainText(openRoleId);
    await expect(drawer.getByText('其他应用（other）', { exact: true })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: '添加成员' })).toHaveCount(0);
    await expect(drawer.getByText('IAM 管理台权限', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`delegated-role-${width}.png`) });
    await drawer.getByRole('button', { name: '保存规则', exact: true }).click();
    await expect(drawer.locator('.open-role-details')).toContainText('版本6');
    await drawer.getByRole('button', { name: '删除此应用规则', exact: true }).click();
    await expect(drawer.locator('.open-role-details')).toContainText('版本7');
    expect(writes).toEqual([
      { method: 'PUT', path: '/iam/admin/roles/20/authorization-rules/7', condition: `"open-role:${openRoleId}:5"` },
      { method: 'DELETE', path: '/iam/admin/roles/20/authorization-rules/7', condition: `"open-role:${openRoleId}:6"` }
    ]);
    const overflow = await drawer.locator('.open-role-details').evaluate(element => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
  });
}

test('受委托角色写冲突后重新展示最新内容，写请求只发送一次', async ({ page }) => {
  const writes = await mockOpenRole(page, true);
  await page.goto('/app/iam/roles');
  await page.locator('.table-primary-action').click();
  const drawer = page.locator('.entity-drawer');
  await drawer.getByRole('button', { name: '保存基本信息', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请核对最新内容后重新确认操作');
  await expect(drawer.getByRole('heading', { name: '最新客户角色', exact: true })).toBeVisible();
  await expect(drawer.locator('.open-role-details')).toContainText('版本6');
  expect(writes).toEqual([{ method: 'PUT', path: '/iam/admin/roles/20', condition: `"open-role:${openRoleId}:5"` }]);
});
