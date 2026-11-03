import { test, expect } from "@playwright/test";

// Top-page specific checks: the staging variant is produced by
// scripts/build-staging.mjs, which must remove the Google Analytics tags,
// prefix asset paths with /staging/, add a noindex robots meta and inject
// the staging banner. Production must keep GA and stay banner-free.
test.describe("top page staging transform", () => {
  test("staging variant drops GA, adds noindex and rewrites asset paths", async ({ page }) => {
    const response = await page.goto("/staging/");
    expect(response.status()).toBe(200);
    await expect(page.getByText("ステージング環境です")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("googletagmanager.com");
    expect(html).toContain('src="/staging/js/main.js"');
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
    // The banner links to every staging environment.
    await expect(page.locator('a[href="/blog/staging/"]')).toHaveCount(1);
    await expect(page.locator('a[href="/asset/staging/"]')).toHaveCount(1);
  });

  test("production keeps GA and shows no staging banner", async ({ page }) => {
    const response = await page.goto("/");
    expect(response.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("googletagmanager.com");
    await expect(page.getByText("ステージング環境です")).toHaveCount(0);
  });
});
