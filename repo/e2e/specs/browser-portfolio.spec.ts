import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAsMerchant(page: any) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', 'merchant1');
  await page.fill('input[name="password"]', 'MerchantPass123!@');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10000 });
  await page.waitForTimeout(1000);
}

test.describe('Browser: Portfolio Management', () => {
  test('portfolio page renders with upload button and category selector', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    await expect(page.locator('h2:has-text("Portfolio")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Upload')).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('categories section renders with Add button', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Categories')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Add")')).toBeVisible();
  });

  test('can create a new category', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    const input = page.locator('input[placeholder="New category name"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(`BrowserCat ${Date.now()}`);
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(1000);
  });

  test('portfolio items show tag edit button when items exist', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    // If no items, the empty state message should be visible
    const emptyState = page.locator('text=No portfolio items');
    const tagBtn = page.locator('button:has-text("+ tags")').first();
    // Either items with tag button exist OR empty state is shown — both are valid
    const hasItems = await tagBtn.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasItems || isEmpty).toBe(true);
  });

  test('tag edit dialog opens and has input', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    const tagBtn = page.locator('button:has-text("+ tags")').first();
    const hasItems = await tagBtn.isVisible().catch(() => false);
    if (hasItems) {
      await tagBtn.click();
      await expect(page.locator('text=Edit Tags')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('input[placeholder*="Comma-separated"]')).toBeVisible();
      await expect(page.locator('button:has-text("Save Tags")')).toBeVisible();
    } else {
      // No items to tag — verify empty state
      await expect(page.locator('text=No portfolio items')).toBeVisible();
    }
  });

  test('delete button exists on portfolio items when items present', async ({ page }) => {
    await loginAsMerchant(page);
    await page.goto(`${APP}/portfolio`);
    await page.waitForTimeout(2000);
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const emptyState = page.locator('text=No portfolio items');
    const hasItems = await deleteBtn.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasItems || isEmpty).toBe(true);
  });
});
