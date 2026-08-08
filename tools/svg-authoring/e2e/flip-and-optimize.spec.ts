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

test.describe("Stage 3 — flip + optimize", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("per-row Flip H mirrors the document", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await row(page, "icon-loose.svg").getByTestId("flip-x").click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-selected").click();
    const content = await readDownload(await downloadPromise);
    expect(content).toContain("data-flip");
    expect(content).toContain("scale(-1 1)");
  });

  test("reset restores the original document", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    const flipToggle = row(page, "icon-loose.svg").getByTestId("flip-x");
    await flipToggle.click();
    await expect(flipToggle).toHaveAttribute("aria-pressed", "true");

    await row(page, "icon-loose.svg").getByTestId("row-reset").click();
    await expect(flipToggle).toHaveAttribute("aria-pressed", "false");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-selected").click();
    const content = await readDownload(await downloadPromise);
    expect(content).not.toContain("data-flip");
  });

  test("light optimize rounds away noisy decimals", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("dirty-traced.svg"));
    await page.getByTestId("margin-input").fill("0");

    await page.getByRole("button", { name: "Optimize", exact: true }).click();
    await page.getByTestId("optimize-precision").fill("1");
    await page.getByTestId("toggle-optimizePaths").click();
    await page.getByTestId("run-pipeline").click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-selected").click();
    const content = await readDownload(await downloadPromise);
    expect(content).not.toContain("000001");
    expect(content).toContain("<path");
  });

  test("medium optimize reduces path command count", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("dirty-traced.svg"));
    await page.getByTestId("margin-input").fill("0");

    await page.getByRole("button", { name: "Optimize", exact: true }).click();
    await page.getByTestId("optimize-level").click();
    await page.getByRole("option", { name: "Medium (document)" }).click();
    await page.getByTestId("toggle-optimizePaths").click();
    await page.getByTestId("run-pipeline").click();

    // before>after shows as "N→M" in the path-count badge
    await expect(row(page, "dirty-traced.svg").getByTestId("path-count")).toContainText("→");
  });
});
