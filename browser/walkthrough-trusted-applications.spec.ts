import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

const password = process.env.IAM_WALKTHROUGH_PASSWORD || '';
test.skip(!password, '需要 IAM_WALKTHROUGH_PASSWORD 环境变量（走查临时件，勿在 check 流程跑）');
const stamp = Date.now().toString().slice(-6);
const applicationCode = `wt-app-${stamp}`;
const applicationName = `走查应用${stamp}`;
const clientId = `wt-cli-${stamp}`;
const verificationClientId = `wt-vc-${stamp}`;
const menuName = `走查菜单${stamp}`;
// 回调落在应用自身路径下而非 /app/：门户 shell 在 path === '/' 时会 openDefaultRoute 改写 URL，
// 可能抢在 waitForURL 采样前抹掉 code 查询参数；子路径不触发默认跳转
const redirectUri = `http://localhost:8179/app/${applicationCode}/cb`;
const codeVerifier = randomBytes(48).toString('base64url');
const codeChallenge = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

async function login(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:8179/login');
  await page.locator('input[placeholder="请输入账号"]').fill('admin');
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function openTrustedApplications(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:8179/app/iam/trusted-applications');
  await expect(page.getByRole('heading', { name: '可信应用' })).toBeVisible({ timeout: 15000 });
  await page.locator('input[placeholder="搜索编码、名称或描述"]').fill(applicationCode);
  await page.locator('input[placeholder="搜索编码、名称或描述"]').press('Enter');
}

async function openWalkthroughApplicationDetail(page: import('@playwright/test').Page) {
  await openTrustedApplications(page);
  await page.getByRole('button', { name: applicationName }).click();
  const detailDrawer = page.locator(`.entity-drawer[aria-label="${applicationName}"]`);
  await expect(detailDrawer).toBeVisible({ timeout: 15000 });
  return detailDrawer;
}

test('可信应用全链路走查：创建 → 门户 → PKCE → 工证校验 → 撤销失效', async ({ page }) => {
  test.setTimeout(300000);
  await login(page);

  // 建应用 + 初始 PUBLIC（PKCE）客户端：无密钥回显，直接建完关抽屉
  await openTrustedApplications(page);
  await page.getByRole('button', { name: '新建可信应用' }).click();
  const createDrawer = page.locator('.entity-drawer[aria-label="新建可信应用"]');
  await createDrawer.locator('input[placeholder="如 demo"]').fill(applicationCode);
  await createDrawer.locator('input[placeholder="应用名称"]').fill(applicationName);
  await createDrawer.locator('input[placeholder="OAuth2 client_id"]').fill(clientId);
  await createDrawer.locator('input[placeholder="客户端名称"]').fill(`走查客户端${stamp}`);
  await createDrawer.locator('select[aria-label="客户端类型"]').selectOption('PUBLIC');
  await createDrawer.locator('textarea[placeholder="https://app.example.com/login/oauth2/code/iam"]').fill(redirectUri);
  await createDrawer.locator('input[placeholder="openid profile message.read"]').fill('openid profile');
  await createDrawer.getByRole('button', { name: '创建应用' }).click();
  await expect(page.getByText(`可信应用已创建：${applicationCode}`)).toBeVisible({ timeout: 15000 });

  // 详情：初始客户端关闭授权确认（走查验协议链路，consent 页属 login-web 范围）
  let detailDrawer = await openWalkthroughApplicationDetail(page);
  const clientSection = detailDrawer.locator('.assignment-section', { hasText: 'OAuth2 客户端' });
  await clientSection.locator('article', { hasText: clientId }).getByRole('button', { name: '编辑' }).click();
  const editClientDrawer = page.locator('.entity-drawer[aria-label="编辑客户端"]');
  await editClientDrawer.locator('label.checkbox-field input').uncheck();
  await editClientDrawer.getByRole('button', { name: '保存客户端' }).click();
  await expect(page.getByText('客户端配置已更新')).toBeVisible({ timeout: 15000 });

  // 建资源校验客户端（工证），捕获一次性密钥
  const resourceSection = detailDrawer.locator('.assignment-section', { hasText: '资源校验客户端' });
  await resourceSection.getByRole('button', { name: '新建资源校验客户端' }).click();
  const vcDrawer = page.locator('.entity-drawer[aria-label="新建资源校验客户端"]');
  await vcDrawer.locator('input[placeholder="如 demo-resource"]').fill(verificationClientId);
  await vcDrawer.getByRole('button', { name: '创建资源校验客户端' }).click();
  await expect(vcDrawer.locator('.secret-reveal')).toBeVisible({ timeout: 15000 });
  const verificationSecret = ((await vcDrawer.locator('.secret-reveal code').textContent()) || '').trim();
  expect(verificationSecret.length).toBeGreaterThan(0);
  await vcDrawer.getByRole('button', { name: '关闭' }).click();

  // 门户集成：开关 + 入口 + API 基础路径 + 菜单（整表覆盖）
  await detailDrawer.locator('label.checkbox-field input').check();
  await detailDrawer.getByPlaceholder('如 /app/iam/ 或完整 URL').fill('/app/wt/index.html');
  await detailDrawer.getByPlaceholder('如 /iam/').fill('/wt/');
  await detailDrawer.getByRole('button', { name: '添加菜单' }).click();
  await detailDrawer.getByPlaceholder('如 workspace').fill('workspace');
  await detailDrawer.getByPlaceholder('如 工作台').fill(menuName);
  await detailDrawer.getByPlaceholder('如 /organizations').fill('/workspace');
  await detailDrawer.getByRole('button', { name: '保存应用资料' }).click();
  await expect(page.getByText('应用资料已更新')).toBeVisible({ timeout: 15000 });
  await expect(detailDrawer.getByText('门户路由前缀：/app/wt-app')).toBeVisible();

  // 授权 admin：角色 + API 权限
  await page.goto('http://localhost:8179/app/iam/users');
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible({ timeout: 15000 });
  await page.locator('input[placeholder="搜索用户名 / 显示名 / 邮箱"]').fill('admin');
  await page.locator('input[placeholder="搜索用户名 / 显示名 / 邮箱"]').press('Enter');
  await page.getByRole('button', { name: /admin/ }).first().click();
  const userDrawer = page.locator('.entity-drawer[aria-label="用户详情：admin"]');
  await expect(userDrawer).toBeVisible({ timeout: 15000 });
  await userDrawer.locator('.app-auth-list.available article', { hasText: applicationCode })
    .getByRole('button', { name: '+ 授权准入' }).click();
  const grantDrawer = page.locator(`.entity-drawer[aria-label="授权：${applicationName}"]`);
  await grantDrawer.locator('textarea[placeholder="每行一个应用局部角色编码"]').fill('wt-role');
  await grantDrawer.locator('textarea[placeholder="每行一个 API 权限编码"]').fill('wt:demo:read');
  await grantDrawer.getByRole('button', { name: '保存授权' }).click();
  await expect(page.getByText(`已保存 ${applicationName} 的授权`)).toBeVisible({ timeout: 15000 });

  // 门户可见：侧边栏出现走查应用与菜单项
  await page.goto('http://localhost:8179/app/');
  const navGroup = page.locator('.app-nav-group', { hasText: applicationName });
  await expect(navGroup).toBeVisible({ timeout: 15000 });
  await expect(navGroup.locator('.app-subnav-item')).toContainText(menuName);

  // PKCE 授权码换 token：authorize 直打实例 8180（nginx LB 只反代 /iam/），浏览器持 8179 登录 session（cookie 不分端口，双实例共享 Redis）
  const authorizeUrl = new URL('http://localhost:8180/oauth2/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('state', 'wt-state');
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  await page.goto(authorizeUrl.href);
  await page.waitForURL(url => url.href.startsWith(redirectUri), { timeout: 15000 });
  const authorizationCode = new URL(page.url()).searchParams.get('code');
  expect(authorizationCode, '应从回调 URL 拿到授权码').toBeTruthy();

  const tokenResponse = await page.request.post('http://localhost:8180/oauth2/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: authorizationCode!,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }
  });
  expect(tokenResponse.status(), `换 token 失败：${await tokenResponse.text()}`).toBe(200);
  const accessToken = (await tokenResponse.json()).access_token;
  expect(accessToken).toBeTruthy();

  // 工证 verify：投影与所授一致（跨应用隔离实证）
  const verifyToken = () => page.request.post('http://localhost:8179/iam/resource/tokens/verify', {
    headers: { Authorization: `Basic ${Buffer.from(`${verificationClientId}:${verificationSecret}`).toString('base64')}` },
    data: { token: accessToken }
  });
  const verified = await verifyToken();
  expect(verified.status(), `工证校验失败：${await verified.text()}`).toBe(200);
  const projection = await verified.json();
  expect(projection.iam_authorization.applicationCode).toBe(applicationCode);
  expect(projection.iam_authorization.roles).toContain('wt-role');
  expect(projection.iam_authorization.apiPermissions).toContain('wt:demo:read');

  // 反证一：撤销工证 → 同一 token 校验立即 401
  detailDrawer = await openWalkthroughApplicationDetail(page);
  await detailDrawer.locator('.assignment-section', { hasText: '资源校验客户端' })
    .locator('article', { hasText: verificationClientId })
    .getByRole('button', { name: '撤销' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await expect(page.getByText('资源校验客户端已撤销')).toBeVisible({ timeout: 15000 });
  expect((await verifyToken()).status()).toBe(401);

  // 反证二：撤销用户授权 → 门户侧边栏不再出现走查应用
  await page.goto('http://localhost:8179/app/iam/users');
  await page.locator('input[placeholder="搜索用户名 / 显示名 / 邮箱"]').fill('admin');
  await page.locator('input[placeholder="搜索用户名 / 显示名 / 邮箱"]').press('Enter');
  await page.getByRole('button', { name: /admin/ }).first().click();
  const revokeDrawer = page.locator('.entity-drawer[aria-label="用户详情：admin"]');
  await expect(revokeDrawer).toBeVisible({ timeout: 15000 });
  await revokeDrawer.locator('.app-auth-list:not(.available) article', { hasText: applicationCode })
    .getByRole('button', { name: '撤销授权' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await expect(page.getByText(`已撤销 ${applicationName} 的授权`)).toBeVisible({ timeout: 15000 });
  await page.goto('http://localhost:8179/app/');
  await expect(page.locator('.app-sidebar')).not.toContainText(applicationName);

  // 清理：删除走查应用（级联清理客户端与授权关系）
  detailDrawer = await openWalkthroughApplicationDetail(page);
  await detailDrawer.getByRole('button', { name: '删除可信应用' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('可信应用已删除')).toBeVisible({ timeout: 15000 });
  await openTrustedApplications(page);
  await expect(page.locator('tbody')).not.toContainText(applicationCode);
});
