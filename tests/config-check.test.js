import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for CI/configuration regressions that unit tests cannot see:
// a masked "<redacted>" placeholder left in a workflow file, an "if"
// condition that references the secrets context (which invalidates the
// whole workflow), a staging build step placed before the production
// build (Vite empties dist, wiping the bundled staging variant), and a
// mistyped OGP generator URL in an ogp step.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((f) => /\.(yml|yaml)$/.test(f));
const read = (file) => fs.readFileSync(path.join(workflowsDir, file), "utf8");
const CANONICAL_OGP_ID =
  "AKfycbzbMAKxkzHlwN8SY7ygJA34xYESMNNdkGNt8vv1XMcZSksgHsUwOxCCdP-wgg6fv7M";

describe("CI configuration", () => {
  it("finds workflow files", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it.each(workflowFiles)(
    "%s does not contain a masked <redacted> placeholder",
    (file) => {
      expect(read(file)).not.toContain("<redacted>");
    },
  );

  it.each(workflowFiles)(
    "%s does not reference secrets in an if condition",
    (file) => {
      const bad = read(file)
        .split("\n")
        .filter((line) => /^\s*if:.*secrets\./.test(line));
      expect(bad).toEqual([]);
    },
  );

  it.each(workflowFiles)(
    "%s builds the staging variant after the production build",
    (file) => {
      const lines = read(file).split("\n");
      const buildIdx = lines.findIndex((l) => /npm run build(?!:staging)/.test(l));
      const stagingIdx = lines.findIndex((l) => l.includes("build:staging"));
      if (buildIdx >= 0 && stagingIdx >= 0) {
        expect(stagingIdx).toBeGreaterThan(buildIdx);
      }
    },
  );

  it.each(workflowFiles)("%s uses the canonical OGP generator in ogp steps", (file) => {
    const blocks = read(file).split(/(?=^\s*- name:)/m);
    for (const block of blocks) {
      if (!/ogp/i.test(block)) continue;
      for (const m of block.matchAll(
        /script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec/g,
      )) {
        expect(m[1]).toBe(CANONICAL_OGP_ID);
      }
    }
  });
});
