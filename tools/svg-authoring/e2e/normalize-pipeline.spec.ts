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

test.describe("Stage 2 — aspect ratio + scale normalization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("normalizes a heterogeneous batch to one shared viewBox", async ({
    page,
  }) => {
    await page.getByTestId("file-input").setInputFiles([
      fixture("icon-loose.svg"),
      fixture("icon-wide.svg"),
      fixture("icon-tall.svg"),
    ]);
    await expect(page.getByTestId("file-row")).toHaveCount(3);

    await page.getByTestId("toggle-normalizeAspectRatio").click();
    await page.getByTestId("toggle-normalizeScale").click();
    await page.getByTestId("run-pipeline").click();

    await expect(badgeFor(page, "icon-loose.svg")).toHaveText("0 0 100 100");
    await expect(badgeFor(page, "icon-wide.svg")).toHaveText("0 0 100 100");
    await expect(badgeFor(page, "icon-tall.svg")).toHaveText("0 0 100 100");
  });

  test("disabled steps are skipped by the pipeline", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-wide.svg"));
    await page.getByTestId("margin-input").fill("0");

    // Only crop is enabled by default -> cropped box, not 100x100.
    await page.getByTestId("run-pipeline").click();
    await expect(badgeFor(page, "icon-wide.svg")).toHaveText("10 40 80 20");

    // Enable scale and re-run -> normalized to the shared viewBox.
    await page.getByTestId("toggle-normalizeScale").click();
    await page.getByTestId("run-pipeline").click();
    await expect(badgeFor(page, "icon-wide.svg")).toHaveText("0 0 100 100");
  });

  test("scale config inputs change the target viewBox", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));

    // Open the scale panel and change the target dimensions.
    await page.getByRole("button", { name: "Normalize scale" }).click();
    await page.getByTestId("scale-w").fill("50");
    await page.getByTestId("scale-h").fill("50");

    await page.getByTestId("toggle-normalizeScale").click();
    await page.getByTestId("run-pipeline").click();

    await expect(badgeFor(page, "icon-loose.svg")).toHaveText("0 0 50 50");
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
