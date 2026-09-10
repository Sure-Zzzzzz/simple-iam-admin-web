import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const password = process.env.IAM_WALKTHROUGH_PASSWORD || '';
test.skip(!password, '需要 IAM_WALKTHROUGH_PASSWORD 环境变量（走查临时件，勿在 check 流程跑）');

const OUT_DIR = 'test-results/visual-sweep';

const PAGES = [
  { name: 'login', url: 'http://localhost:8179/login' },
  { name: 'portal-home', url: 'http://localhost:8179/' },
  { name: 'iam-dashboard', url: 'http://localhost:8179/app/iam/' },
  { name: 'iam-users', url: 'http://localhost:8179/app/iam/users' },
  { name: 'iam-roles', url: 'http://localhost:8179/app/iam/roles' },
  { name: 'iam-permissions', url: 'http://localhost:8179/app/iam/permissions' },
  { name: 'iam-organizations', url: 'http://localhost:8179/app/iam/organizations' },
  { name: 'iam-user-groups', url: 'http://localhost:8179/app/iam/user-groups' },
  { name: 'iam-trusted-applications', url: 'http://localhost:8179/app/iam/trusted-applications' },
  { name: 'iam-messages', url: 'http://localhost:8179/app/iam/messages' },
  { name: 'iam-forbidden', url: 'http://localhost:8179/app/iam/403' },
];

async function login(page) {
  await page.goto('http://localhost:8179/login');
  await page.locator('input[placeholder="请输入账号"]').fill('admin');
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

test('视觉走查：门户态全页面截图', async ({ page }) => {
  test.setTimeout(300000);
  mkdirSync(OUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto('http://localhost:8179/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT_DIR}/00-login.png`, fullPage: true });

  await login(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/01-portal-home.png`, fullPage: true });

  for (const item of PAGES.slice(2)) {
    await page.goto(item.url);
    await expect(page.locator('main, .management-page, h1').first())
      .toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/${item.name}.png`, fullPage: true });
  }
});
