import { test } from '@playwright/test';

const password = process.env.IAM_WALKTHROUGH_PASSWORD || '';
test.skip(!password, '需要 IAM_WALKTHROUGH_PASSWORD 环境变量（走查临时件，勿在 check 流程跑）');

async function login(page) {
  await page.goto('http://localhost:8179/login');
  await page.locator('input[placeholder="请输入账号"]').fill('admin');
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

test('超宽视口复现+DOM量测', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 2240, height: 1000 });
  await login(page);

  for (const [name, url] of [
    ['wide-users', 'http://localhost:8179/app/iam/users'],
    ['wide-organizations', 'http://localhost:8179/app/iam/organizations'],
    ['wide-user-groups', 'http://localhost:8179/app/iam/user-groups'],
  ]) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/visual-sweep/${name}.png`, fullPage: true });

    const metrics = await page.evaluate(() => {
      const out = [];
      const bars = document.querySelectorAll('.user-filter-bar, .data-toolbar');
      for (const bar of bars) {
        const barRect = bar.getBoundingClientRect();
        const panel = bar.closest('.panel, .admin-data-surface, section[class*=surface]');
        const panelRect = panel ? panel.getBoundingClientRect() : null;
        const kids = [...bar.children].map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: el.className.toString().slice(0, 40),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
          };
        });
        out.push({
          barClass: bar.className.toString().slice(0, 50),
          barRect: { left: Math.round(barRect.left), right: Math.round(barRect.right), width: Math.round(barRect.width) },
          panelClass: panel ? panel.className.toString().slice(0, 40) : null,
          panelRect: panelRect ? { left: Math.round(panelRect.left), right: Math.round(panelRect.right) } : null,
          gapToPanelRight: panelRect ? Math.round(panelRect.right - barRect.right) : null,
          kids,
        });
      }
      return out;
    });
    console.log(`=== ${name} ===`, JSON.stringify(metrics, null, 1));
  }
});
