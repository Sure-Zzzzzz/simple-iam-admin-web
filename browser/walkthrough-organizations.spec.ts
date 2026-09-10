import { expect, test } from '@playwright/test';

const password = process.env.IAM_WALKTHROUGH_PASSWORD || '';
test.skip(!password, '需要 IAM_WALKTHROUGH_PASSWORD 环境变量（走查临时件，勿在 check 流程跑）');
const stamp = Date.now().toString().slice(-6);
const parentCode = `wt-p-${stamp}`;
const childCode = `wt-c-${stamp}`;
const memberName = `wt-user-${stamp}`;

async function login(page) {
  await page.goto('http://localhost:8179/login');
  await page.locator('input[placeholder="请输入账号"]').fill('admin');
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function openOrganizations(page) {
  await page.goto('http://localhost:8179/app/iam/organizations');
  await expect(page.getByRole('heading', { name: '组织与成员' })).toBeVisible({ timeout: 15000 });
}

test('组织与成员全链路走查', async ({ page }) => {
  test.setTimeout(300000);
  await login(page);
  await openOrganizations(page);

  // 树搜索
  const tree = page.locator('.organization-tree');
  await tree.locator('input[type="search"]').fill('部');
  await expect(tree).toContainText('部');
  await tree.locator('input[type="search"]').fill('');

  // 建走查父部门（挂总部下或作根，取决于当前选中）
  await page.getByRole('button', { name: '新建下级部门' }).click().catch(async () => {
    await page.getByRole('button', { name: '创建首个根部门' }).click();
  });
  const deptDrawer = page.locator('.entity-drawer');
  const codeInput = deptDrawer.locator('input[placeholder^="根部门编码"], input[placeholder^="下级部门编码"]');
  await codeInput.first().fill(parentCode);
  await deptDrawer.locator('input[placeholder^="根部门名称"], input[placeholder^="下级部门名称"]').first().fill(`走查父${stamp}`);
  await deptDrawer.getByRole('button', { name: '创建部门' }).click();
  await expect(page.getByText('已创建')).toBeVisible({ timeout: 15000 });
  await openOrganizations(page);

  // 定位到走查父部门：树搜索点选
  await tree.locator('input[type="search"]').fill(parentCode);
  await tree.getByRole('button', { name: new RegExp(`走查父${stamp}`) }).click();
  await expect(page.locator('.workspace-summary h2')).toHaveText(`走查父${stamp}`);

  // 编辑改名
  await page.getByRole('button', { name: '编辑部门' }).click();
  await deptDrawer.locator('input[placeholder="部门名称"]').fill(`走查父改${stamp}`);
  await deptDrawer.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('部门已更新')).toBeVisible();
  await expect(page.locator('.workspace-summary h2')).toHaveText(`走查父改${stamp}`);

  // 建子部门
  await page.getByRole('button', { name: '新建下级部门' }).click();
  await deptDrawer.locator('input[placeholder="下级部门编码"]').fill(childCode);
  await deptDrawer.locator('input[placeholder="下级部门名称"]').fill(`走查子${stamp}`);
  await deptDrawer.getByRole('button', { name: '创建部门' }).click();
  await expect(page.getByText('下级部门已创建')).toBeVisible();
  await expect(page.locator('.child-department-list')).toContainText(`走查子${stamp}`);

  // 创建成员（含邮箱手机号）
  await page.getByRole('button', { name: '创建成员' }).click();
  await deptDrawer.locator('input[placeholder="用户名"]').fill(memberName);
  await deptDrawer.locator('input[placeholder="初始密码"]').fill('Walkthr0ugh!2026');
  await deptDrawer.locator('input[placeholder="显示名"]').fill(`走查成员${stamp}`);
  await deptDrawer.locator('input[placeholder="user@example.com"]').fill(`${memberName}@example.com`);
  await deptDrawer.locator('input[placeholder="手机号"]').fill('13900000000');
  await deptDrawer.getByRole('button', { name: '创建成员', exact: true }).click();
  await expect(page.getByText('成员已创建并归属当前部门')).toBeVisible();
  await expect(page.locator('tbody')).toContainText(memberName);

  // 成员筛选
  const filterBar = page.locator('.user-filter-bar');
  await filterBar.locator('input[type="search"]').fill(memberName);
  await filterBar.locator('input[type="search"]').press('Enter');
  await expect(page.locator('tbody')).toContainText(memberName);
  await filterBar.locator('select').selectOption('');
  await filterBar.locator('input[type="search"]').fill('');
  await filterBar.locator('input[type="search"]').press('Enter');

  // 部门角色：挂载 → 画像标"部门继承" → 角色页反向展示继承来源 → 撤销
  const deptRoleSection = page.locator('section.assignment-section', { hasText: '部门角色' });
  await expect(deptRoleSection).toBeVisible();
  const availableRoleArticle = deptRoleSection.locator('.assignment-list.available article').first();
  if (await availableRoleArticle.count()) {
    const mountedRoleName = (await availableRoleArticle.locator('strong').textContent()) || '';
    await availableRoleArticle.getByRole('button', { name: '挂载' }).click();
    await expect(page.getByText('角色已挂载到部门')).toBeVisible({ timeout: 15000 });
    await expect(deptRoleSection.locator('.assignment-list:not(.available) article', { hasText: mountedRoleName }).first()).toBeVisible();

    // 成员画像：继承角色标注来源且不提供移除按钮（只能从部门侧撤销）
    await page.locator('tbody button').first().click();
    await expect(deptDrawer).toContainText(memberName);
    const effectiveRoleArticle = deptDrawer.locator('.assignment-section', { hasText: '有效角色' })
      .locator('article', { hasText: mountedRoleName }).first();
    await expect(effectiveRoleArticle).toContainText('部门继承');
    await expect(effectiveRoleArticle.getByRole('button')).toHaveCount(0);
    await expect(deptDrawer).not.toHaveAttribute('aria-busy', 'true');
    await deptDrawer.getByRole('button', { name: '关闭' }).click();

    // 角色管理页反向展示：该角色的继承来源部门含走查父部门
    await page.goto('http://localhost:8179/app/iam/roles');
    await expect(page.getByRole('heading', { name: '角色管理' })).toBeVisible({ timeout: 15000 });
    const roleFilter = page.locator('.search-field input[placeholder="搜索编码、名称或描述"]');
    await roleFilter.fill(mountedRoleName);
    await page.locator('tbody .table-primary-action').first().click();
    const roleDrawer = page.locator('.entity-drawer');
    const inheritSection = roleDrawer.locator('.assignment-section', { hasText: '继承来源部门' });
    await expect(inheritSection).toContainText(`走查父改${stamp}`);
    await roleDrawer.locator('header .icon-button').click();

    // 撤销部门角色：确认框 → 提示 → 部门侧列表移除
    await openOrganizations(page);
    await tree.locator('input[type="search"]').fill(parentCode);
    await tree.getByRole('button', { name: new RegExp(`走查父改${stamp}`) }).click({ force: true });
    await expect(page.locator('.workspace-summary h2')).toHaveText(`走查父改${stamp}`);
    await deptRoleSection.locator('article', { hasText: mountedRoleName }).first().getByRole('button', { name: '撤销' }).click();
    await page.getByRole('button', { name: '确认移除' }).click();
    await expect(page.getByText('部门角色已撤销')).toBeVisible({ timeout: 15000 });
  }

  // 删除保护：有子部门 + 有成员的父部门删除应被拒
  await page.getByRole('button', { name: '删除部门' }).click();
  await expect(page.locator('.confirm-dialog')).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.locator('.admin-message.error')).toContainText('不能删除');

  // 画像：改部门到总部再改回、加协作组再移除、加角色再移除、搜索、只读权限、跳转
  await page.locator('tbody button').first().click();
  await expect(deptDrawer).toContainText(memberName);

  const sections = deptDrawer.locator('.assignment-section');
  const groupSection = sections.nth(0);
  const roleSection = sections.nth(1);
  if (await groupSection.locator('.assignment-list.available article').count()) {
    await groupSection.locator('.search-field input').fill('a');
    await groupSection.locator('.assignment-list.available article').first().getByRole('button', { name: '添加' }).click();
    await expect(page.getByText('成员已加入协作组')).toBeVisible();
    await groupSection.locator('.assignment-list article').first().getByRole('button', { name: '移除' }).click();
    await page.getByRole('button', { name: '确认移除' }).click();
    await expect(page.getByText('成员已移出协作组')).toBeVisible();
  }
  if (await roleSection.locator('.assignment-list.available article').count()) {
    await roleSection.locator('.assignment-list.available article').first().getByRole('button', { name: '添加' }).click();
    await expect(page.getByText('直接角色已分配')).toBeVisible();
    await roleSection.locator('.assignment-list article').first().getByRole('button', { name: '移除' }).click();
    await page.getByRole('button', { name: '确认移除' }).click();
    await expect(page.getByText(/成员的直接角色已移除/)).toBeVisible();
  }
  await expect(sections.last()).toContainText('仅供查看');

  await deptDrawer.getByRole('button', { name: '在用户管理中查看' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/iam/users\\?keyword=${memberName}`));
  await page.goBack();
  await openOrganizations(page);

  // 清理：走查成员挪未分配 → 删子部门 → 删父部门（应全部成功）
  await tree.locator('input[type="search"]').fill(parentCode);
  await tree.getByRole('button', { name: new RegExp(`走查父改${stamp}`) }).click({ force: true });
  await page.locator('tbody button').first().click();
  await deptDrawer.locator('select').selectOption('');
  await deptDrawer.getByRole('button', { name: '保存成员资料' }).click();
  await expect(page.getByText('成员资料与所属部门已更新')).toBeVisible();
  // 保存成功后组件还要 refresh + 重拉画像，pending 期间关闭按钮静默拒绝，等抽屉不忙再关
  await expect(deptDrawer).not.toHaveAttribute('aria-busy', 'true');
  await deptDrawer.getByRole('button', { name: '关闭' }).click();

  await tree.locator('input[type="search"]').fill(childCode);
  await tree.getByRole('button', { name: new RegExp(`走查子${stamp}`) }).click({ force: true });
  await expect(page.locator('.workspace-summary h2')).toHaveText(`走查子${stamp}`);
  await page.getByRole('button', { name: '删除部门' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText(/已删除/)).toBeVisible();

  await tree.locator('input[type="search"]').fill(parentCode);
  await tree.getByRole('button', { name: new RegExp(`走查父改${stamp}`) }).click({ force: true });
  await expect(page.locator('.workspace-summary h2')).toHaveText(`走查父改${stamp}`);
  await page.getByRole('button', { name: '删除部门' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText(/已删除/)).toBeVisible();

  // 协作组管理页闭环：新建 → 编辑 → 加成员 → 移成员 → 删除（自清理）
  const groupCode = `wt-g-${stamp}`;
  await page.goto('http://localhost:8179/app/iam/user-groups');
  await expect(page.getByRole('heading', { name: '协作组管理' })).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: '新建协作组' }).click();
  const groupDrawer = page.locator('.entity-drawer');
  await groupDrawer.locator('input').nth(0).fill(groupCode);
  await groupDrawer.locator('input').nth(1).fill(`走查组${stamp}`);
  await groupDrawer.getByRole('button', { name: '创建协作组' }).click();
  await expect(page.getByText('协作组创建成功')).toBeVisible({ timeout: 15000 });
  // 创建链含回第一页拉列表+选组拉成员，pending 期间抽屉拒绝交互，等不忙
  await expect(groupDrawer).not.toHaveAttribute('aria-busy', 'true');

  await groupDrawer.locator('textarea').fill('走查协作组说明');
  await groupDrawer.getByRole('button', { name: '保存协作组' }).click();
  await expect(page.getByText('协作组已更新')).toBeVisible();
  await expect(groupDrawer).not.toHaveAttribute('aria-busy', 'true');

  await groupDrawer.locator('input[placeholder="输入账号或显示名后回车搜索"]').fill(memberName);
  await groupDrawer.locator('input[placeholder="输入账号或显示名后回车搜索"]').press('Enter');
  await groupDrawer.locator('.assignment-list.available').getByRole('button', { name: '添加' }).click();
  await expect(page.getByText('成员已添加')).toBeVisible();

  await groupDrawer.locator('.assignment-list:not(.available)').getByRole('button', { name: '移除' }).first().click();
  await page.getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByText('成员已移除')).toBeVisible();

  await groupDrawer.getByRole('button', { name: '关闭' }).click();
  // 删组前先搜索过滤，确保操作行是走查组而非当前页第一条
  const groupFilterBar = page.locator('.user-filter-bar');
  await groupFilterBar.locator('input[type="search"]').fill(groupCode);
  await groupFilterBar.locator('input[type="search"]').press('Enter');
  await page.locator('tbody .table-action.danger').first().click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('协作组已删除')).toBeVisible();
});
