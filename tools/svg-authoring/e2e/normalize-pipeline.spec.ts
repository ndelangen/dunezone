import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

function badgeFor(page: import("@playwright/test").Page, name: string) {
  return page
    .locator(`[data-testid="file-row"][data-name="${name}"]`)
    .getByTestId("viewbox-badge");
}

/* Scale/aspect normalization moved to the dunezone build generator; the tool
   authors sources with a ratio-based crop margin and a provenance stamp. */
test.describe("Stage 2 — ratio crop margin + provenance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("crops a batch with a proportional margin", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([
      fixture("icon-loose.svg"),
      fixture("icon-wide.svg"),
    ]);
    await expect(page.getByTestId("file-row")).toHaveCount(2);

    // icon-wide content box is 10 40 80 20; margin = 0.1 * 80 = 8.
    await page.getByTestId("margin-input").fill("0.1");
    await page.getByTestId("run-crop").click();
    await expect(badgeFor(page, "icon-wide.svg")).toHaveText("2 32 96 36");
  });

  test("zero margin crops tightly to content", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-wide.svg"));
    await page.getByTestId("margin-input").fill("0");
    await page.getByTestId("run-crop").click();
    await expect(badgeFor(page, "icon-wide.svg")).toHaveText("10 40 80 20");
  });

  test("before/after tabs swap the preview", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await page.getByTestId("run-crop").click();

    await page.getByTestId("tab-before").click();
    await expect(page.getByTestId("preview-before")).toBeVisible();

    await page.getByTestId("tab-after").click();
    await expect(page.getByTestId("preview-image")).toBeVisible();
  });
});
