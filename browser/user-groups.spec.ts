import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const providers = { providers: [
  { code: 'local-password', displayName: '账号密码登录', type: 'password', enabled: true, description: null }
] };
const opsGroup = { id: 1, code: 'ops', name: '运营组', description: '运营通知', status: 1, createdAt: '', updatedAt: '' };
const alice = { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: 10, departmentName: '技术部', identitySource: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const bob = { id: 3, username: 'bob', displayName: '鲍勃', email: '', phone: '', departmentId: null, departmentName: null, identitySource: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' };
const usersPage = { content: [alice, bob], totalElements: 2, totalPages: 1, page: 1, size: 100, numberOfElements: 2, first: true, last: true, empty: false };

function makeGroupsPage(page = 1) {
  return {
    content: page === 1 ? [opsGroup] : [{ ...opsGroup, id: 9, code: 'next', name: '第二页组', description: '', status: 1, createdAt: '', updatedAt: '' }],
    totalElements: 21,
    totalPages: 2,
    page,
    size: 20,
    numberOfElements: 1,
    first: page === 1,
    last: page !== 1,
    empty: false
  };
}

async function mockBase(page, handlers: Record<string, (route) => void> = {}) {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: providers }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: usersPage }));
  await page.route('**/iam/admin/user-groups/page?**', route => {
    if (handlers.page) {
      return handlers.page(route);
    }
    const pageNum = Number(new URL(route.request().url()).searchParams.get('page') || '1');
    return route.fulfill({ json: makeGroupsPage(pageNum) });
  });
  await page.route('**/iam/admin/user-groups/1/users**', route => {
    if (handlers.groupUsers) {
      return handlers.groupUsers(route);
    }
    return route.fulfill({ json: [alice] });
  });
  await page.route('**/iam/admin/user-groups/1', route => {
    if (handlers.groupDetail) {
      return handlers.groupDetail(route);
    }
    return route.fulfill({ json: {} });
  });
  await page.route('**/iam/admin/user-groups', route => {
    if (handlers.groupCreate) {
      return handlers.groupCreate(route);
    }
    return route.fulfill({ json: {} });
  });
}

test('协作组列表展示分页数据与页码', async ({ page }) => {
  await mockBase(page);

  await page.goto('/app/iam/user-groups');

  await expect(page.locator('tbody')).toContainText('运营组');
  await expect(page.locator('tbody')).toContainText('ops');
  await expect(page.locator('.pagination button.active')).toHaveText('1');
  await expect(page.locator('.pagination')).toContainText('下一页');
});

test('筛选与分页应携带服务端查询参数', async ({ page }) => {
  const pageUrls: string[] = [];
  await mockBase(page, {
    page: route => {
      pageUrls.push(route.request().url());
      const pageNum = Number(new URL(route.request().url()).searchParams.get('page') || '1');
      return route.fulfill({ json: makeGroupsPage(pageNum) });
    }
  });

  await page.goto('/app/iam/user-groups');
  await expect(page.locator('.pagination button.active')).toHaveText('1');

  const bar = page.locator('.group-filter-bar');
  await bar.locator('input[type="search"]').fill('ops');
  await bar.locator('input[type="search"]').press('Enter');
  await expect(page.locator('.pagination button.active')).toHaveText('1');
  await expect.poll(() => pageUrls.at(-1) || '').toContain('keyword=ops');

  await bar.locator('select').selectOption('1');
  await expect.poll(() => pageUrls.at(-1) || '').toContain('status=1');
  expect(pageUrls.at(-1)).toContain('page=1');

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.pagination button.active')).toHaveText('2');
  await expect.poll(() => pageUrls.at(-1) || '').toContain('page=2');
});

test('新建协作组应经抽屉提交表单', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockBase(page, {
    groupCreate: route => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { ...opsGroup, id: 5, code: 'dev', name: '研发组', description: '研发通知' } });
    },
    page: route => {
      const pageNum = Number(new URL(route.request().url()).searchParams.get('page') || '1');
      return route.fulfill({ json: pageNum === 1 ? makeGroupsPage(1) : makeGroupsPage(pageNum) });
    }
  });

  await page.goto('/app/iam/user-groups');
  await page.getByRole('button', { name: '新建协作组' }).click();

  const drawer = page.locator('.entity-drawer');
  await drawer.locator('input').nth(0).fill('dev');
  await drawer.locator('input').nth(1).fill('研发组');
  await drawer.locator('textarea').fill('研发通知');
  await drawer.getByRole('button', { name: '创建协作组' }).click();

  await expect(page.getByText('协作组创建成功')).toBeVisible();
  expect(bodies).toEqual([{ code: 'dev', name: '研发组', description: '研发通知', status: 1 }]);
});

test('编辑协作组应提交更新内容', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockBase(page, {
    groupDetail: route => {
      if (route.request().method() === 'PUT') {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({ json: { ...opsGroup, name: '运营组改' } });
      }
      return route.fulfill({ json: opsGroup });
    }
  });

  await page.goto('/app/iam/user-groups');
  await page.locator('tbody button').first().click();

  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('已分配成员');
  await drawer.locator('input').first().fill('运营组改');
  await drawer.getByRole('button', { name: '保存协作组' }).click();

  await expect(page.getByText('协作组已更新')).toBeVisible();
  expect(bodies).toEqual([{ name: '运营组改', description: '运营通知', status: 1 }]);
});

test('删除协作组应经确认框操作', async ({ page }) => {
  const methods: string[] = [];
  await mockBase(page, {
    groupDetail: route => {
      methods.push(route.request().method());
      return route.fulfill({ json: {} });
    }
  });

  await page.goto('/app/iam/user-groups');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await expect(page.locator('.confirm-dialog')).toBeVisible();
  await expect(page.locator('.confirm-dialog')).toContainText('将删除“运营组”及其成员关系');
  await page.getByRole('button', { name: '确认删除' }).click();

  await expect(page.getByText('协作组已删除')).toBeVisible();
  expect(methods).toContain('DELETE');
});

test('添加成员默认展示候选可直接添加并支持移除确认', async ({ page }) => {
  const groupCalls: Array<{ url: string; method: string }> = [];
  let groupUsers = [alice];
  await mockBase(page, {
    page: route => route.fulfill({ json: makeGroupsPage(1) }),
    groupUsers: route => {
      const request = route.request();
      groupCalls.push({ url: new URL(request.url()).pathname, method: request.method() });
      if (request.method() === 'POST') {
        groupUsers = [alice, bob];
      } else if (request.method() === 'DELETE') {
        groupUsers = [bob];
      }
      return route.fulfill({ json: request.method() === 'GET' ? groupUsers : {} });
    }
  });

  await page.goto('/app/iam/user-groups');
  await page.locator('tbody button').first().click();

  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('已分配成员');
  await expect(drawer).toContainText('可翻页或按账号、显示名筛选；已加入的不再显示。');

  const available = drawer.locator('.assignment-list.available');
  await expect(available).toContainText('鲍勃');
  await expect(available).not.toContainText('爱丽丝');
  await available.getByRole('button', { name: '添加' }).click();

  await expect(page.getByText('成员已添加')).toBeVisible();
  await expect(drawer.locator('.assignment-list:not(.available)')).toContainText('鲍勃');

  await drawer.locator('.assignment-list:not(.available)').getByRole('button', { name: '移除' }).first().click();
  await page.getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByText('成员已移除')).toBeVisible();

  expect(groupCalls).toContainEqual({ url: '/iam/admin/user-groups/1/users/3', method: 'POST' });
  expect(groupCalls).toContainEqual({ url: '/iam/admin/user-groups/1/users/2', method: 'DELETE' });
});
