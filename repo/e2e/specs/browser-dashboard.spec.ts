import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAsOps(page: any) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', 'ops_user');
  await page.fill('input[name="password"]', 'OpsUserPass123!@');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10000 });
}

test.describe('Browser: Dashboard & Analytics', () => {
  test('dashboard renders with all filter inputs', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Dashboard")');
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.locator('text=Operations Dashboard')).toBeVisible({ timeout: 10000 });
    // Date filters (MM/DD/YYYY text inputs)
    await expect(page.locator('input[placeholder="MM/DD/YYYY"]').first()).toBeVisible();
    // Organization filter
    await expect(page.locator('text=Organization')).toBeVisible();
    // Event Type filter
    await expect(page.locator('text=Event Type')).toBeVisible();
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Dashboard")');
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.locator('text=Total Events')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Conversion Rate')).toBeVisible();
    await expect(page.locator('text=Attendance Rate')).toBeVisible();
  });

  test('dashboard shows metric sections', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Dashboard")');
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.locator('text=Event Popularity')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Channel Distribution')).toBeVisible();
    await expect(page.locator('text=Registration Funnel')).toBeVisible();
  });

  test('export buttons are present for supported browsers', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Dashboard")');
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    // Either export buttons (Chrome with File System Access) or browser requirement notice
    const csvBtn = page.locator('button:has-text("Save CSV")');
    const noticeSpan = page.locator('text=Export requires');
    const hasCsv = await csvBtn.isVisible().catch(() => false);
    const hasNotice = await noticeSpan.isVisible().catch(() => false);
    if (!hasCsv && !hasNotice) {
      // Wait a bit for conditional rendering
      await page.waitForTimeout(2000);
    }
    expect(await csvBtn.isVisible().catch(() => false) || await noticeSpan.isVisible().catch(() => false)).toBe(true);
  });
});
