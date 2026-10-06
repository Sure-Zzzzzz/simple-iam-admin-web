import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blockedPorts = new Set(['8179', '8180', '8181', '8280', '8281', '8390']);

export function validateInput(input) {
  assert.equal(input?.fixture, 'isolated-iam-132', '必须明确声明本轮隔离环境');
  const base = new URL(input.baseUrl);
  assert.ok(['http:', 'https:'].includes(base.protocol), '验收入口必须是 HTTP(S)');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), '禁止在共享域名执行写验收');
  assert.ok(base.port && !blockedPorts.has(base.port), '禁止占用或调用既有服务端口');
  assert.equal(base.pathname, '/');
  assert.ok(!base.username && !base.password && !base.search && !base.hash);
  assert.ok(typeof input.administrator?.username === 'string' && input.administrator.username);
  assert.ok(typeof input.administrator?.password === 'string' && input.administrator.password);
  for (const key of ['id', 'applicationId', 'rootDepartmentId']) {
    assert.ok(Number.isSafeInteger(input.role?.[key]) && input.role[key] > 0, `角色 ${key} 必须是正整数`);
  }
  assert.ok(typeof input.role.code === 'string' && input.role.code);
  assert.match(input.role.openRoleId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  for (const key of ['root', 'child', 'outside']) {
    assert.ok(Number.isSafeInteger(input.departments?.[key]?.id) && input.departments[key].id > 0);
    assert.ok(typeof input.departments[key].name === 'string' && input.departments[key].name);
  }
  assert.equal(input.departments.root.id, input.role.rootDepartmentId);
  assert.equal(new Set(Object.values(input.departments).map(department => department.id)).size, 3);
  assert.ok(typeof input.application?.pagePermission === 'string' && input.application.pagePermission);
  assert.ok(typeof input.application?.apiPermission === 'string' && input.application.apiPermission);
  assert.ok(typeof input.member?.subjectId === 'string' && input.member.subjectId);
  assert.ok(typeof input.member?.username === 'string' && input.member.username);
  return { ...input, baseUrl: base.origin };
}

const conditionFor = role => `"open-role:${role.openRoleBinding.openRoleId}:${role.openRoleBinding.revision}"`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function runAcceptance(input) {
  const seed = validateInput(input);
  const output = resolve(repository, 'test-results', 'real-iam-132', String(Date.now()));
  const evidence = { fixture: seed.fixture, requests: [], checks: [], assets: {}, outcome: 'FAILED', stage: 'launch' };
  let browser;
  let context;
  let page;
  await mkdir(output, { recursive: true });
  const record = (method, path, status, condition = null) => evidence.requests.push({ method, path, status, condition });
  const step = name => { evidence.stage = name; };
  const rolePath = `/iam/admin/roles/${seed.role.id}`;
  const rulePath = `${rolePath}/authorization-rules/${seed.role.applicationId}`;
  const childRolePath = `/iam/admin/departments/${seed.departments.child.id}/roles/${seed.role.id}`;
  const failures = [];

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('response', response => {
      const request = response.request();
      const path = new URL(response.url()).pathname;
      record(request.method(), path, response.status(), request.headers()['if-match'] ?? null);
      if (path.startsWith('/iam/') && response.status() >= 500) failures.push('API_5XX');
    });
    page.on('requestfailed', request => {
      if (new URL(request.url()).pathname.startsWith('/iam/')) failures.push('API_NETWORK_FAILURE');
    });
    page.on('pageerror', () => failures.push('PAGE_SCRIPT_ERROR'));

    // 不启用 trace、录像或 storageState，认证数据只留在当前上下文内存。
    async function api(method, path, body, condition, expected = 200) {
      const headers = {};
      if (!['GET', 'HEAD'].includes(method)) {
        const csrfResponse = await context.request.get(`${seed.baseUrl}/iam/web/auth/csrf`);
        record('GET', '/iam/web/auth/csrf', csrfResponse.status());
        assert.equal(csrfResponse.status(), 200, '读取 CSRF 失败');
        const csrf = await csrfResponse.json();
        headers[csrf.headerName] = csrf.token;
      }
      if (condition) headers['If-Match'] = condition;
      const response = await context.request.fetch(`${seed.baseUrl}${path}`, { method, headers, data: body });
      record(method, path, response.status(), condition ?? null);
      assert.equal(response.status(), expected, `${method} ${path} 状态不符`);
      const text = await response.text();
      return text && response.headers()['content-type']?.includes('application/json') ? JSON.parse(text) : null;
    }

    async function readRole() {
      const role = await api('GET', rolePath);
      assert.equal(role.id, seed.role.id);
      assert.equal(role.code, seed.role.code);
      assert.equal(role.openRoleBinding?.openRoleId, seed.role.openRoleId);
      assert.equal(role.openRoleBinding.applicationId, seed.role.applicationId);
      assert.equal(role.openRoleBinding.rootDepartmentId, seed.role.rootDepartmentId);
      assert.equal(role.openRoleBinding.state, 'ACTIVE');
      return role;
    }

    function uiWrites(method, path) {
      return evidence.requests.filter(request => request.method === method && request.path === path);
    }

    async function writeFromUi(method, path, role, action, expected = 200) {
      const count = uiWrites(method, path).length;
      const completion = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === path);
      await action();
      const response = await completion;
      assert.equal(response.status(), expected, '界面写操作状态不符');
      assert.equal(response.request().headers()['if-match'], conditionFor(role), '门户丢失或改写版本条件');
      assert.equal(await response.finished(), null, '界面写响应未完成');
      await expect.poll(() => uiWrites(method, path).length).toBe(count + 1);
    }

    async function assertMounted() {
      await expect(page.locator('#micro-app-container .iam-admin-app')).toBeVisible();
      const mounted = await page.locator('#micro-app-container .iam-admin-app').evaluate(element => Boolean(element.closest('[data-qiankun="iam"]')));
      assert.ok(mounted, '必须由实际 qiankun 隔离容器挂载');
      await expect(page.locator('.portal-header')).toBeVisible();
    }

    async function openRole() {
      const response = await page.goto(`${seed.baseUrl}/app/iam/roles`);
      assert.equal(response?.status(), 200);
      assert.equal(digest(await response.body()), evidence.assets.portalIndex, '深链未返回实际 Portal 壳');
      await assertMounted();
      await page.getByPlaceholder('搜索编码、名称或描述').fill(seed.role.code);
      const row = page.locator('.responsive-table tbody tr').filter({ has: page.getByText(seed.role.code, { exact: true }) });
      await row.locator('.table-primary-action').click();
      const drawer = page.locator('#micro-app-container .entity-drawer');
      await expect(drawer.locator('.open-role-details')).toContainText(seed.role.openRoleId);
      await expect(drawer.getByRole('button', { name: '保存基本信息', exact: true })).toBeEnabled();
      return drawer;
    }

    async function assertVersion(drawer, revision) {
      await expect(drawer.locator('.open-role-details div').filter({ has: page.getByText('版本', { exact: true }) }).locator('dd')).toHaveText(String(revision));
      await expect(drawer).not.toHaveAttribute('aria-busy', 'true');
    }

    async function department(name) {
      await page.locator('.organization-tree').getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click();
      await expect(page.locator('.workspace-summary h2')).toHaveText(name);
      await expect(page.locator('.organization-layout')).toHaveAttribute('aria-busy', 'false');
    }

    step('official-web-session');
    const login = await api('POST', '/iam/web/auth/login', seed.administrator);
    assert.ok(login?.user && login.mustChangePassword !== true && login.captchaRequired !== true, '种子账号必须可直接建立验收会话');
    // 认证对象不进入证据；后续复用浏览器上下文的正式 Cookie。
    const me = await api('GET', '/iam/web/auth/me');
    assert.ok(me.authorities?.includes('ROLE_iam_admin'), '验收账号必须是隔离库平台管理员');

    step('production-assets');
    for (const [name, path, local] of [
      ['portalIndex', '/app/index.html', resolve(repository, '../simple-unified-application-portal-web/dist/index.html')],
      ['adminIndex', '/app/iam/index.html', resolve(repository, 'dist/index.html')]
    ]) {
      const response = await context.request.get(`${seed.baseUrl}${path}`);
      record('GET', path, response.status());
      assert.equal(response.status(), 200);
      evidence.assets[name] = digest(await response.body());
      assert.equal(evidence.assets[name], digest(await readFile(local)), '入口必须使用当前生产构建');
    }
    const navigation = await api('GET', '/iam/web/portal/navigation-context');
    const iam = navigation.applications.find(application => application.applicationCode === 'iam');
    assert.ok(iam && iam.routePrefix === '/app/iam');
    assert.equal(new URL(iam.entry, seed.baseUrl).pathname, '/app/iam/index.html');
    let role = await readRole();
    const initiallyAssigned = await api('GET', `/iam/admin/departments/${seed.departments.child.id}/roles`);
    assert.ok(!initiallyAssigned.some(candidate => candidate.id === role.id), '种子角色不能预先挂到验收子部门');
    await api('GET', rulePath, undefined, undefined, 404);

    step('delegated-role-details');
    let drawer = await openRole();
    await assertVersion(drawer, role.openRoleBinding.revision);
    await expect(drawer.getByRole('button', { name: '添加成员', exact: true })).toHaveCount(0);
    await expect(drawer.getByText('IAM 管理台权限', { exact: false })).toHaveCount(0);
    await expect(drawer.locator('.assignment-section--projection .picker-group').first().locator('input[type="checkbox"]')).toHaveCount(1);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(drawer).toBeVisible();
      assert.ok(await drawer.evaluate(element => Boolean(element.closest('[data-qiankun="iam"]'))), '抽屉不能离开样式隔离容器');
      const bounds = await drawer.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.equal(await drawer.locator('.open-role-details').evaluate(element => element.scrollWidth > element.clientWidth), false);
      await page.screenshot({ path: resolve(output, `delegated-role-${width}.png`), mask: [page.locator('.user-dropdown')] });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    evidence.checks.push('actual-qiankun-desktop-mobile');

    step('missing-condition-428');
    await api('PUT', rolePath, { name: `${seed.role.code}-missing-condition`, description: '' }, undefined, 428);
    assert.deepEqual(await readRole(), role, '428 不能修改角色');
    evidence.checks.push('missing-condition-428-no-mutation');

    step('rename-role');
    await drawer.getByLabel('角色名称', { exact: true }).fill(`${seed.role.code}-renamed`);
    await writeFromUi('PUT', rolePath, role, () => drawer.getByRole('button', { name: '保存基本信息', exact: true }).click());
    const renamed = await readRole();
    assert.equal(renamed.name, `${seed.role.code}-renamed`);
    assert.equal(renamed.openRoleBinding.revision, role.openRoleBinding.revision + 1);
    role = renamed;
    await assertVersion(drawer, role.openRoleBinding.revision);
    evidence.checks.push('rename-role');

    step('concurrent-update-412');
    await api('PUT', rolePath, { name: `${seed.role.code}-concurrent`, description: '' }, conditionFor(role));
    const concurrent = await readRole();
    const count = uiWrites('PUT', rolePath).length;
    await drawer.getByLabel('角色名称', { exact: true }).fill(`${seed.role.code}-stale`);
    await writeFromUi('PUT', rolePath, role, () => drawer.getByRole('button', { name: '保存基本信息', exact: true }).click(), 412);
    await expect(page.getByRole('alert')).toContainText('请核对最新内容后重新确认操作');
    await assertVersion(drawer, concurrent.openRoleBinding.revision);
    assert.equal(uiWrites('PUT', rolePath).length, count + 1, '冲突不能重放写请求');
    assert.deepEqual(await readRole(), concurrent, '旧版本写不能覆盖并发更新');
    role = concurrent;
    evidence.checks.push('concurrent-update-412-no-replay');

    step('save-rule');
    const projection = drawer.locator('.assignment-section--projection');
    await projection.getByLabel(seed.application.pagePermission, { exact: true }).check();
    await projection.getByLabel(seed.application.apiPermission, { exact: true }).check();
    await writeFromUi('PUT', rulePath, role, () => drawer.getByRole('button', { name: '保存规则', exact: true }).click());
    const savedRule = await api('GET', rulePath);
    assert.deepEqual(savedRule.pagePermissions, [seed.application.pagePermission]);
    assert.deepEqual(savedRule.apiPermissions, [seed.application.apiPermission]);
    const afterRule = await readRole();
    assert.equal(afterRule.openRoleBinding.revision, role.openRoleBinding.revision + 1);
    role = afterRule;
    await assertVersion(drawer, role.openRoleBinding.revision);
    evidence.checks.push('save-rule');

    step('clear-rule');
    await writeFromUi('DELETE', rulePath, role, () => drawer.getByRole('button', { name: '删除此应用规则', exact: true }).click(), 204);
    await api('GET', rulePath, undefined, undefined, 404);
    const afterClear = await readRole();
    assert.equal(afterClear.openRoleBinding.revision, role.openRoleBinding.revision + 1);
    role = afterClear;
    await assertVersion(drawer, role.openRoleBinding.revision);
    evidence.checks.push('clear-rule');

    step('personal-assignment-excluded');
    await page.goto(`${seed.baseUrl}/app/iam/users`);
    await assertMounted();
    await page.getByPlaceholder('搜索用户名 / 显示名 / 邮箱').fill(seed.member.username);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await page.getByRole('cell', { name: seed.member.username, exact: true }).locator('..').locator('.table-primary-action').click();
    await expect(page.locator('.entity-drawer .tag-list button', { hasText: seed.role.code })).toHaveCount(0);
    evidence.checks.push('personal-assignment-excluded');

    step('department-boundaries');
    await page.goto(`${seed.baseUrl}/app/iam/organizations`);
    await assertMounted();
    const section = page.locator('section.assignment-section').filter({ has: page.getByRole('heading', { name: /^部门角色/ }) });
    const candidate = section.locator('.assignment-list.available article').filter({ has: page.getByText(seed.role.code, { exact: true }) });
    await department(seed.departments.outside.name);
    await expect(candidate).toHaveCount(0);
    await department(seed.departments.root.name);
    await expect(candidate).toHaveCount(1);
    await department(seed.departments.child.name);
    await expect(candidate).toHaveCount(1);
    evidence.checks.push('root-subtree-outside-boundaries');

    step('attach-department');
    await writeFromUi('POST', childRolePath, role, () => candidate.getByRole('button', { name: '挂载', exact: true }).click());
    const attached = section.locator('.assignment-list:not(.available) article').filter({ has: page.getByText(seed.role.code, { exact: true }) });
    await expect(attached).toBeVisible();
    const afterAttach = await readRole();
    assert.equal(afterAttach.openRoleBinding.revision, role.openRoleBinding.revision + 1);
    role = afterAttach;
    const memberProfile = await api('GET', `/iam/admin/organizations/users/${encodeURIComponent(seed.member.subjectId)}/profile`);
    assert.ok(memberProfile.roles.some(candidateRole => candidateRole.id === seed.role.id && candidateRole.source === 'department_inherited'));
    evidence.checks.push('attach-department-and-member-inheritance');

    step('detach-department');
    await attached.getByRole('button', { name: '撤销', exact: true }).click();
    await writeFromUi('DELETE', childRolePath, role, () => page.getByRole('button', { name: '确认移除', exact: true }).click());
    await expect(attached).toHaveCount(0);
    await expect(candidate).toBeVisible();
    const afterDetach = await readRole();
    assert.equal(afterDetach.openRoleBinding.revision, role.openRoleBinding.revision + 1);
    role = afterDetach;
    const detachedProfile = await api('GET', `/iam/admin/organizations/users/${encodeURIComponent(seed.member.subjectId)}/profile`);
    assert.ok(!detachedProfile.roles.some(candidateRole => candidateRole.id === seed.role.id));
    evidence.checks.push('detach-department-and-member-inheritance');

    step('delete-role');
    drawer = await openRole();
    await assertVersion(drawer, role.openRoleBinding.revision);
    await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    const row = page.locator('.responsive-table tbody tr').filter({ has: page.getByText(seed.role.code, { exact: true }) });
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.locator('.confirm-dialog')).toContainText(role.name);
    await writeFromUi('DELETE', rolePath, role, () => page.getByRole('button', { name: '确认删除', exact: true }).click());
    await expect(row).toHaveCount(0);
    await api('GET', rolePath, undefined, undefined, 404);
    evidence.checks.push('delete-role');
    assert.deepEqual(failures, [], '验收不能包含网络、脚本或服务端错误');
    evidence.outcome = 'PASSED';
    evidence.stage = 'complete';
  } catch (error) {
    evidence.failureType = error instanceof Error ? error.name : 'UnknownError';
  } finally {
    await context?.close();
    await browser?.close();
    await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  }
  return { outcome: evidence.outcome, stage: evidence.stage, checks: evidence.checks.length, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    const input = JSON.parse(text);
    if (process.argv.includes('--validate-only')) {
      validateInput(input);
      process.stdout.write('INPUT_VALIDATED\n');
    } else {
      const result = await runAcceptance(input);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.outcome === 'PASSED' ? 0 : 1;
    }
  } catch (error) {
    // 不输出原始输入、认证异常正文或可能含凭据的浏览器错误。
    process.stderr.write(`ACCEPTANCE_INPUT_OR_RUNTIME_ERROR:${error instanceof Error ? error.name : 'UnknownError'}\n`);
    process.exitCode = 1;
  }
}
