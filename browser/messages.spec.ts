import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const providers = { providers: [
  { code: 'local-password', displayName: '本地登录', type: 'local', enabled: true, description: null }
] };
const departments = [
  { id: 10, code: 'tech', name: '技术部', parentId: null, parentName: null, sortOrder: 0, status: 1, createdAt: '', updatedAt: '' }
];
const userGroups = [
  { id: 4, code: 'ops', name: '运营组', description: null, status: 1, createdAt: '', updatedAt: '' }
];
const usersPage = {
  content: [
    { id: 2, username: 'alice', displayName: '爱丽丝', email: '', phone: '', departmentId: null, departmentName: null, status: 1, lockedUntil: null, lastLoginAt: null, createdAt: '', updatedAt: '' }
  ],
  totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false
};
const batchSummary = {
  sendBatchId: 'batch-1', title: '系统维护通知', senderUsername: 'admin',
  targetUserCount: 2, targetDepartmentCount: 1, targetUserGroupCount: 1, targetIncludeChildDepartments: true,
  recipientCount: 20, readCount: 5, createdAt: '2026-08-31T10:00:00Z'
};
const batchesPage = { content: [batchSummary], totalElements: 1, totalPages: 1, page: 1, size: 20, numberOfElements: 1, first: true, last: true, empty: false };
const batchDetail = { ...batchSummary, content: '今晚 22 点系统维护，预计 1 小时。' };
const recipientsPage = {
  content: [
    { userId: 2, username: 'alice', displayName: '爱丽丝', readAt: '2026-08-31T11:00:00Z' },
    { userId: 5, username: 'bob', displayName: '鲍勃', readAt: null }
  ],
  totalElements: 2, totalPages: 1, page: 1, size: 20, numberOfElements: 2, first: true, last: true, empty: false
};
const newBatchDetail = {
  sendBatchId: 'batch-new', title: '群发通知', senderUsername: 'admin',
  targetUserCount: 0, targetDepartmentCount: 0, targetUserGroupCount: 1, targetIncludeChildDepartments: false,
  recipientCount: 2, readCount: 0, createdAt: '2026-08-31T12:00:00Z', content: '新批次发送内容'
};
const newRecipientsPage = {
  content: [
    { userId: 2, username: 'alice', displayName: '爱丽丝', readAt: null },
    { userId: 5, username: 'bob', displayName: '鲍勃', readAt: null }
  ],
  totalElements: 2, totalPages: 1, page: 1, size: 20, numberOfElements: 2, first: true, last: true, empty: false
};

async function mockBase(page) {
  let sentBody = null;
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'test-csrf-token' } }));
  await page.route('**/iam/web/auth/providers', route => route.fulfill({ json: providers }));
  await page.route('**/iam/admin/departments', route => route.fulfill({ json: departments }));
  await page.route('**/iam/admin/user-groups', route => route.fulfill({ json: userGroups }));
  await page.route('**/iam/admin/users?**', route => route.fulfill({ json: usersPage }));
  await page.route('**/iam/admin/messages**', route => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'POST') {
      sentBody = route.request().postDataJSON();
      return route.fulfill({ json: { sendBatchId: 'batch-new', recipientCount: 2 } });
    }
    if (url.includes('/messages/page')) return route.fulfill({ json: batchesPage });
    if (url.includes('/messages/batch-new/recipients')) return route.fulfill({ json: newRecipientsPage });
    if (url.includes('/messages/batch-new')) return route.fulfill({ json: newBatchDetail });
    if (url.includes('/messages/batch-1/recipients')) return route.fulfill({ json: recipientsPage });
    if (url.includes('/messages/batch-1')) return route.fulfill({ json: batchDetail });
    return route.fulfill({ json: {} });
  });
  return () => sentBody;
}

test('站内信页展示发送历史批次与已读进度', async ({ page }) => {
  await mockBase(page);

  await page.goto('/app/iam/messages');

  await expect(page.getByRole('cell', { name: '系统维护通知' })).toBeVisible();
  await expect(page.getByText('2 位用户 · 1 个部门（含子部门） · 1 个协作组')).toBeVisible();
  await expect(page.getByText('已读 5/20')).toBeVisible();
});

test('按协作组发送应经确认汇总并打开刚发批次详情', async ({ page }) => {
  const getSentBody = await mockBase(page);

  await page.goto('/app/iam/messages');
  await page.getByRole('button', { name: '发送站内信' }).first().click();

  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('.picker-options').nth(2).locator('input[type=checkbox]').check();
  await expect(drawer.locator('.picker-options').nth(2).locator('label')).toContainText('运营组');
  await drawer.locator('input[placeholder="标题"]').fill('群发通知');
  await drawer.locator('textarea').fill('通知内容');
  await drawer.getByRole('button', { name: '确认发送' }).click();

  const confirmDialog = page.locator('.confirm-dialog');
  await expect(confirmDialog).toContainText('将发送给：1 个协作组');
  await confirmDialog.getByRole('button', { name: '确认发送' }).click();

  await expect(page.getByText('站内信已发送给 2 位用户')).toBeVisible();
  expect(getSentBody()).toEqual({
    recipientUserIds: [], departmentIds: [], userGroupIds: [4], includeChildDepartments: false, title: '群发通知', content: '通知内容'
  });
  await expect(page.locator('.entity-drawer')).toContainText('新批次发送内容');
  await expect(page.locator('.entity-drawer')).toContainText('收件人（2）');
});

test('批次详情抽屉展示收件人已读状态', async ({ page }) => {
  await mockBase(page);

  await page.goto('/app/iam/messages');
  await page.getByRole('button', { name: '查看' }).click();

  const drawer = page.locator('.entity-drawer');
  await expect(drawer).toContainText('今晚 22 点系统维护，预计 1 小时。');
  await expect(drawer).toContainText('20 人，已读 5 人');
  await expect(drawer.getByRole('cell', { name: 'alice' })).toBeVisible();
  await expect(drawer.getByRole('cell', { name: 'alice', exact: false }).locator('..')).toContainText('已读');
  await expect(drawer.getByRole('cell', { name: 'bob' }).locator('..')).toContainText('未读');
});
