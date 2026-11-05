import { test, expect } from "@playwright/test";
import { SITE, GAS, APPS, execUrl, blockAnalytics } from "./apps.js";

// Full smoke suite over production AND staging, run on a schedule and on
// demand from this repository (smoke.yml). The per-app staging gate lives
// in staging.check.js; this file is the whole-site health check.
//
// The staging gate in this repository runs every check file with APP set;
// the smoke suite is not part of that gate, so its tests stay skipped
// unless APP is unset.
const smokeTest = process.env.APP ? test.skip : test;
const smokeDescribe = process.env.APP ? test.describe.skip : test.describe;

// Keep this suite's own page views out of GA4, production included.
test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
});
for (const app of APPS) {
  for (const env of ["prod", "staging"]) {
    smokeTest(`${app.name} (${env}) loads and uses the ${env} backend`, async ({
      page,
    }) => {
      const path = env === "staging" ? `${app.path}staging/` : app.path;
      const calledIds = [];
      page.on("request", (req) => {
        const m = req
          .url()
          .match(/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)/);
        if (m) calledIds.push(m[1]);
      });
      const resp = await page.goto(path);
      expect(resp.status()).toBe(200);
      if (env === "staging") {
        await expect(page.getByText("STAGING")).toBeVisible();
      } else {
        await expect(page.getByText("STAGING｜")).toHaveCount(0);
      }
      if (app.gas) {
        const ids = GAS[app.gas];
        const other = env === "staging" ? ids.prod : ids.staging;
        if (app.dataOnLoad) {
          await page
            .waitForRequest(
              (r) => r.url().includes("script.google.com/macros"),
              { timeout: 30 * 1000 },
            )
            .catch(() => null);
          expect(calledIds).toContain(ids[env]);
        } else {
          await page.waitForTimeout(5000);
        }
        expect(calledIds).not.toContain(other);
      }
    });
  }
}

for (const app of ["tweet", "alarm", "health", "asset"]) {
  smokeTest(`${app} ogp image exists`, async ({ request }) => {
    const r = await request.get(`${SITE}/${app}/ogp.png`);
    expect(r.status()).toBe(200);
    const body = await r.body();
    expect(body.length).toBeGreaterThan(1000);
  });
}

// The GAS endpoint checks below use Playwright's anonymous request context
// (no Google session). If a project's authorization lapses or its web app
// access regresses, /exec answers with an HTML sign-in / Access Denied page
// instead of JSON and these tests fail — that is how the 2026-11-04 blog and
// tweet authorization outages would have been caught within a day.
smokeDescribe("GAS endpoints", () => {
  smokeTest("list production returns the full item list", async ({ request }) => {
    const r = await request.get(execUrl(GAS.list.prod));
    const items = await r.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(100);
  });

  smokeTest("blog production returns article ids", async ({ request }) => {
    const r = await request.get(execUrl(GAS.blog.prod));
    const data = await r.json();
    expect(data.ids.length).toBeGreaterThan(10);
  });

  smokeTest("tweet production is alive", async ({ request }) => {
    const r = await request.get(execUrl(GAS.tweet.prod));
    const data = await r.json();
    expect(data.ok).toBe(true);
  });

  smokeTest("tweet staging is alive", async ({ request }) => {
    const r = await request.get(execUrl(GAS.tweet.staging));
    const data = await r.json();
    expect(data.ok).toBe(true);
  });

  smokeTest("alarm production answers with JSON", async ({ request }) => {
    const r = await request.get(execUrl(GAS.alarm.prod));
    const data = await r.json();
    expect(data).toHaveProperty("ok");
  });

  smokeTest("alarm staging answers with JSON", async ({ request }) => {
    const r = await request.get(execUrl(GAS.alarm.staging));
    const data = await r.json();
    expect(data).toHaveProperty("ok");
  });

  smokeTest("health production is auth-gated", async ({ request }) => {
    const r = await request.get(execUrl(GAS.health.prod));
    const data = await r.json();
    expect(data.status).toBe(401);
  });

  smokeTest("asset production is auth-gated", async ({ request }) => {
    const r = await request.get(execUrl(GAS.asset.prod));
    const data = await r.json();
    expect(data.status).toBe(401);
  });

  smokeTest("list staging returns only dummy items", async ({ request }) => {
    const r = await request.get(execUrl(GAS.list.staging));
    const items = await r.json();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  smokeTest("blog staging returns the dummy article list", async ({ request }) => {
    const r = await request.get(execUrl(GAS.blog.staging));
    const data = await r.json();
    expect(data.ids.length).toBeGreaterThanOrEqual(1);
  });

  smokeTest("health staging is auth-gated", async ({ request }) => {
    const r = await request.get(execUrl(GAS.health.staging));
    const data = await r.json();
    expect(data.status).toBe(401);
  });

  smokeTest("asset staging is auth-gated", async ({ request }) => {
    const r = await request.get(execUrl(GAS.asset.staging));
    const data = await r.json();
    expect(data.status).toBe(401);
  });
});
