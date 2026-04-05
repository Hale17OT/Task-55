import { test, expect } from '@playwright/test';

const APP = process.env.APP_URL || 'http://localhost:4200';

async function loginAsOps(page: any) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="username"]', 'ops_user');
  await page.fill('input[name="password"]', 'OpsUserPass123!@');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 10000 });
}

test.describe('Browser: Data Quality & Dedup', () => {
  test('data quality page renders with tabs', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Data Quality")');
    await page.waitForURL(/\/data-quality/, { timeout: 5000 });
    await expect(page.locator('h2:has-text("Data Quality")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Duplicate Candidates")')).toBeVisible();
    await expect(page.locator('button:has-text("Quality Flags")')).toBeVisible();
  });

  test('duplicate candidates tab shows candidates or empty state', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Data Quality")');
    await page.waitForURL(/\/data-quality/, { timeout: 5000 });
    await page.waitForTimeout(2000);
    // Tab should show either candidates (with Merge/Dismiss or status badges) or empty state
    const mergeBtn = page.locator('button:has-text("Merge")').first();
    const noCandidates = page.locator('text=No duplicate candidates');
    const candidateCard = page.locator('text=match').first();
    const hasMerge = await mergeBtn.isVisible().catch(() => false);
    const isEmpty = await noCandidates.isVisible().catch(() => false);
    const hasCards = await candidateCard.isVisible().catch(() => false);
    expect(hasMerge || isEmpty || hasCards).toBe(true);
  });

  test('quality flags tab shows flags or empty state', async ({ page }) => {
    await loginAsOps(page);
    await page.click('nav a:has-text("Data Quality")');
    await page.waitForURL(/\/data-quality/, { timeout: 5000 });
    await page.click('button:has-text("Quality Flags")');
    await page.waitForTimeout(1000);
    // Should show flags with Resolve buttons or empty state
    const resolveBtn = page.locator('button:has-text("Resolve")').first();
    const noFlags = page.locator('text=No quality flags');
    const hasFlags = await resolveBtn.isVisible().catch(() => false);
    const isEmpty = await noFlags.isVisible().catch(() => false);
    expect(hasFlags || isEmpty).toBe(true);
  });
});
