import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAsMerchant(page: any) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', 'merchant1');
  await page.fill('input[name="password"]', 'MerchantPass123!@');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10000 });
}

test.describe('Browser: Merchant Offering Management', () => {
  test('New Offering button opens create form', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const newBtn = page.locator('button:has-text("New Offering")');
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();
    await expect(page.locator('text=New Offering')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="priceUsd"]')).toBeVisible();
    await expect(page.locator('input[name="durationMinutes"]')).toBeVisible();
    await expect(page.locator('select[name="visibility"]')).toBeVisible();
  });

  test('create offering form submits and closes', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const newBtn = page.locator('button:has-text("New Offering")');
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();
    await page.fill('input[name="title"]', `Browser Test ${Date.now()}`);
    await page.fill('input[name="priceUsd"]', '1500');
    await page.fill('input[name="durationMinutes"]', '120');
    await page.click('button[type="submit"]:has-text("Create")');
    await page.waitForTimeout(2000);
    // Form should close — dialog overlay should no longer be visible
    await expect(page.locator('input[name="title"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('Edit button opens edit form with existing data', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await expect(page.locator('text=Edit Offering')).toBeVisible({ timeout: 3000 });
    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toBeVisible();
    const val = await titleInput.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test('edit form shows Add-ons section', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await expect(page.locator('text=Add-ons')).toBeVisible({ timeout: 3000 });
  });

  test('edit form shows Status section', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await expect(page.locator('text=Status:')).toBeVisible({ timeout: 3000 });
  });

  test('visibility=restricted shows Client Access section', async ({ page }) => {
    await loginAsMerchant(page);
    await page.click('nav a:has-text("Offerings")');
    await page.waitForURL(/\/offerings/, { timeout: 5000 });
    const editBtn = page.locator('button:has-text("Edit")').first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await page.selectOption('select[name="visibility"]', 'restricted');
    await expect(page.locator('text=Client Access')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("Grant Access")')).toBeVisible();
  });
});
