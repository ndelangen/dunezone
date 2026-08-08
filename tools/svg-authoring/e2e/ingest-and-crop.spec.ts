import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test.describe("Stage 1 — ingest, crop, download", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("uploads SVG files via the file input", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([
      fixture("icon-loose.svg"),
      fixture("icon-wide.svg"),
    ]);
    await expect(page.getByTestId("file-row")).toHaveCount(2);
    await expect(
      page.locator('[data-testid="file-row"][data-name="icon-loose.svg"]'),
    ).toBeVisible();
  });

  test("adds SVG via paste", async ({ page }) => {
    await page
      .getByTestId("paste-textarea")
      .fill('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><circle cx="25" cy="25" r="10"/></svg>');
    await page.getByTestId("add-paste").click();
    await expect(page.getByTestId("file-row")).toHaveCount(1);
  });

  test("rejects non-SVG paste with an inline error", async ({ page }) => {
    await page.getByTestId("paste-textarea").fill("not svg at all");
    await page.getByTestId("add-paste").click();
    await expect(page.getByTestId("paste-error")).toBeVisible();
    await expect(page.getByTestId("file-row")).toHaveCount(0);
  });

  test("crops to content with margin and updates the viewBox badge", async ({
    page,
  }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    const badge = page
      .locator('[data-testid="file-row"][data-name="icon-loose.svg"]')
      .getByTestId("viewbox-badge");
    await expect(badge).toHaveText("0 0 100 100");

    await page.getByTestId("margin-input").fill("0.1");
    await page.getByTestId("run-crop").click();

    // content 20,30,30,20; margin = 0.1 * 30 = 3 -> 17 27 36 26
    await expect(badge).toHaveText("17 27 36 26");
  });

  test("downloads a single cropped SVG", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await page.getByTestId("margin-input").fill("0");
    await page.getByTestId("run-crop").click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-selected").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("icon-loose.svg");

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString("utf-8");
    expect(content).toContain('viewBox="20 30 30 20"');
  });

  test("downloads all files as a ZIP", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([
      fixture("icon-loose.svg"),
      fixture("icon-wide.svg"),
    ]);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-all").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".zip");
  });
});
