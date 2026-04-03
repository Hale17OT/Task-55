import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:4200';

test.describe('Browser: Auth Flow', () => {
  test('login page renders with form fields', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await expect(page.locator('text=StudioOps')).toBeVisible();
    await expect(page.locator('text=Sign in to your account')).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
  });

  test('shows validation error on empty submit', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Please enter username and password')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.fill('input[name="username"]', 'nonexistent');
    await page.fill('input[name="password"]', 'WrongPassword123!@');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid username or password')).toBeVisible({ timeout: 5000 });
  });

  test('successful login redirects to offerings', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.fill('input[name="username"]', 'merchant1');
    await page.fill('input[name="password"]', 'MerchantPass123!@');
    await page.click('button[type="submit"]');

    // Should redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 5000 });

    // Should see the sidebar with StudioOps branding
    await expect(page.locator('text=StudioOps').first()).toBeVisible();
  });

  test('sidebar shows role-appropriate navigation after login', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.fill('input[name="username"]', 'merchant1');
    await page.fill('input[name="password"]', 'MerchantPass123!@');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 5000 });

    // Merchant should see Offerings, Events, Portfolio
    await expect(page.locator('nav >> text=Offerings')).toBeVisible();
    await expect(page.locator('nav >> text=Events')).toBeVisible();
    await expect(page.locator('nav >> text=Portfolio')).toBeVisible();

    // Merchant should NOT see Admin or Dashboard
    await expect(page.locator('nav >> text=Admin')).not.toBeVisible();
    await expect(page.locator('nav >> text=Dashboard')).not.toBeVisible();
  });

  test('logout button works and returns to login', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    await page.fill('input[name="username"]', 'merchant1');
    await page.fill('input[name="password"]', 'MerchantPass123!@');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 5000 });

    await page.click('button:has-text("Logout")');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 5000 });
    await expect(page.locator('text=Sign in to your account')).toBeVisible();
  });
});

test.describe('Browser: Route Guards', () => {
  test('unauthenticated user is redirected to login for protected route', async ({ page }) => {
    await page.goto(`${APP_URL}/portfolio`); // portfolio requires auth
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 5000 });
  });

  test('403 page shown for unauthorized role access', async ({ page }) => {
    // Login as merchant
    await page.goto(`${APP_URL}/login`);
    await page.fill('input[name="username"]', 'merchant1');
    await page.fill('input[name="password"]', 'MerchantPass123!@');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 5000 });

    // Try to access admin page
    await page.goto(`${APP_URL}/admin`);
    await expect(page.locator('text=Forbidden')).toBeVisible({ timeout: 5000 });
  });

  test('404 page for non-existent route', async ({ page }) => {
    await page.goto(`${APP_URL}/nonexistent-page`);
    await expect(page.locator('text=Page Not Found')).toBeVisible();
  });
});
