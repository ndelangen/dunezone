import { test, expect, type Page, type Download } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function row(page: Page, name: string) {
  return page.locator(`[data-testid="file-row"][data-name="${name}"]`);
}

test.describe("Stage 4 — persistence, presets, heavy optimize", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("restores uploaded files after a reload (IndexedDB)", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await expect(row(page, "icon-loose.svg")).toBeVisible();
    // allow the debounced session write to flush
    await page.waitForTimeout(700);

    await page.reload();
    await expect(row(page, "icon-loose.svg")).toBeVisible({ timeout: 10_000 });
  });

  test("restores pipeline config after a reload (localStorage)", async ({
    page,
  }) => {
    await page.getByTestId("margin-input").fill("7");
    await page.waitForTimeout(200);

    await page.reload();
    await expect(page.getByTestId("margin-input")).toHaveValue("7");
  });

  test("saves and applies a named preset", async ({ page }) => {
    await page.getByTestId("margin-input").fill("9");
    await page.getByTestId("preset-name").fill("Test Preset");
    await page.getByTestId("preset-save").click();

    // change config, then re-apply the preset to restore it
    await page.getByTestId("margin-input").fill("1");
    await expect(page.getByTestId("margin-input")).toHaveValue("1");

    await page.getByTestId("preset-select").click();
    await page.getByRole("option", { name: "Test Preset" }).click();

    await expect(page.getByTestId("margin-input")).toHaveValue("9");
  });

  test("clear all empties the workspace", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await expect(row(page, "icon-loose.svg")).toBeVisible();
    await page.getByTestId("clear-all").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("heavy optimize (SVGO) strips comments", async ({ page }) => {
    await page
      .getByTestId("paste-textarea")
      .fill(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><!-- generator comment --><rect x="10" y="10" width="20" height="20"/></svg>',
      );
    await page.getByTestId("add-paste").click();
    await page.getByTestId("margin-input").fill("0");

    await page.getByRole("button", { name: "Optimize", exact: true }).click();
    await page.getByTestId("optimize-level").click();
    await page.getByRole("option", { name: "Heavy (SVGO)" }).click();
    await page.getByTestId("toggle-optimizePaths").click();
    await page.getByTestId("run-pipeline").click();

    /* The pipeline runs asynchronously (SVGO loads lazily); wait for the
       observable result (crop changes the viewBox) before exporting. */
    await expect(
      row(page, "pasted-1.svg").getByTestId("viewbox-badge"),
    ).toHaveText("10 10 20 20", { timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-selected").click();
    const content = await readDownload(await downloadPromise);
    expect(content).not.toContain("generator comment");
    expect(content).toContain("<svg");
  });
});
