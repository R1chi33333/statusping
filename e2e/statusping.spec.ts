import { expect, test } from '@playwright/test';

/**
 * The two flows that matter: an admin signing in and adding a
 * monitor, and a visitor reading the public status page. The
 * monitor points at this instance's own health endpoint so the
 * probe works without external network.
 */

test('admin signs in and manages a monitor', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Admin token').fill('e2e-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Monitors' })).toBeVisible();

  await page.getByRole('button', { name: 'Add monitor' }).click();
  await page.getByLabel('Name').fill('Self health');
  await page.getByLabel('URL').fill('http://localhost:3210/api/health');
  await page.getByRole('button', { name: 'Add monitor' }).last().click();

  await expect(page.getByRole('cell', { name: 'Self health', exact: true })).toBeVisible();

  // Expanding the row opens the history panel.
  await page.getByRole('cell', { name: 'Self health', exact: true }).click();
  await expect(page.getByText('Incidents')).toBeVisible();
  await expect(page.getByRole('button', { name: '7d' })).toBeVisible();
});

test('the public status page needs no login', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/status/status');

  await expect(page.getByText(/All systems operational|Some systems are down/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Self health' })).toBeVisible();
  await expect(page.getByText('today')).toBeVisible();

  // No admin chrome on the public page.
  await expect(page.getByLabel('Admin token')).toHaveCount(0);
});

test('unknown status slugs stay hidden', async ({ page }) => {
  await page.goto('/status/secret-page');
  await expect(page.getByText('status page not found')).toBeVisible();
});
