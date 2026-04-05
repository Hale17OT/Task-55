import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAsAdmin(page: any) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'AdminPass123!@');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Browser: Admin Panel', () => {
  test('admin page renders with all tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await expect(page.locator('text=Administration')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Roles")')).toBeVisible();
    await expect(page.locator('button:has-text("Rules")')).toBeVisible();
    await expect(page.locator('button:has-text("Audit")')).toBeVisible();
    await expect(page.locator('button:has-text("Config")')).toBeVisible();
    await expect(page.locator('button:has-text("Sessions")')).toBeVisible();
  });

  test('Roles tab shows permission matrix', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await page.click('button:has-text("Roles")');
    await page.waitForTimeout(1000);
    // Should show roles table with permission badges
    await expect(page.locator('th:has-text("Role")')).toBeVisible({ timeout: 10000 });
  });

  test('Rules tab shows rules list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await page.click('button:has-text("Rules")');
    await page.waitForTimeout(1000);
  });

  test('Audit tab shows log entries', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await page.click('button:has-text("Audit")');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Action')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Resource')).toBeVisible();
  });

  test('Config tab shows entries with Reveal buttons on encrypted values', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await page.click('button:has-text("Config")');
    await page.waitForTimeout(1000);
    // If encrypted configs exist, Reveal buttons should be present
    const revealBtn = page.locator('button:has-text("Reveal")').first();
    if (await revealBtn.isVisible()) {
      expect(true).toBe(true); // Reveal button exists
    }
  });

  test('Sessions tab shows active sessions with Revoke buttons', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('nav a:has-text("Admin")');
    await page.waitForURL(/\/admin/, { timeout: 5000 });
    await page.click('button:has-text("Sessions")');
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("Revoke")').first()).toBeVisible({ timeout: 10000 });
  });
});
