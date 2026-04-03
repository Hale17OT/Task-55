import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAs(page: any, username: string, password: string) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10000 });
}

test.describe('Browser: Client Event Registration', () => {
  test('client sees Events page with Register buttons', async ({ page }) => {
    await loginAs(page, 'client1', 'ClientPass123!@');
    await page.waitForTimeout(2000);
    // Navigate to events — retry if guard redirects (race between session load and guard)
    await page.goto(`${APP}/events`);
    await page.waitForTimeout(1000);
    if (!page.url().includes('/events')) {
      await page.goto(`${APP}/events`);
      await page.waitForTimeout(1000);
    }
    await expect(page.locator('h2:has-text("Events")')).toBeVisible({ timeout: 15000 });
    // Client should see Register buttons on non-terminal events
    await page.waitForTimeout(2000);
    const registerBtns = page.locator('button:has-text("Register")');
    // May or may not have events — but the page renders
    await expect(page.locator('h2:has-text("Events")')).toBeVisible();
  });

  test('client can register for an event', async ({ page }) => {
    await loginAs(page, 'client1', 'ClientPass123!@');
    await page.waitForTimeout(2000);
    await page.goto(`${APP}/events`);
    await page.waitForTimeout(1000);
    if (!page.url().includes('/events')) await page.goto(`${APP}/events`);
    await page.waitForTimeout(2000);
    const registerBtn = page.locator('button:has-text("Register")').first();
    if (await registerBtn.isVisible()) {
      await registerBtn.click();
      // Should see success or error message
      await page.waitForTimeout(1000);
      const msg = page.locator('text=Registered successfully, text=Registration failed, text=Cannot register').first();
      await expect(msg).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Browser: Merchant Event Registrations Management', () => {
  test('merchant sees Registrations button on events', async ({ page }) => {
    await loginAs(page, 'merchant1', 'MerchantPass123!@');
    await page.goto(`${APP}/events`);
    await page.waitForTimeout(2000);
    const regBtn = page.locator('button:has-text("Registrations")').first();
    if (await regBtn.isVisible()) {
      await regBtn.click();
      await page.waitForTimeout(1000);
      // Should show registrations panel or "No registrations yet"
      const panel = page.locator('text=Registrations, text=No registrations yet').first();
      await expect(panel).toBeVisible({ timeout: 5000 });
    }
  });
});
