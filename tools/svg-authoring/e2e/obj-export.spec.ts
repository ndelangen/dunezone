import { test, expect, type Download } from "@playwright/test";
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

test.describe("Stage 5 — OBJ export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("file-dropzone")).toBeVisible();
  });

  test("exports a single SVG to an OBJ file with geometry", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles(fixture("icon-loose.svg"));
    await page.getByTestId("obj-depth").fill("8");

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("export-obj").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("icon-loose.obj");
    const content = await readDownload(download);
    expect(content).toContain("v ");
    expect(content).toContain("f ");
  });

  test("exports multiple selected SVGs as an OBJ ZIP", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([
      fixture("icon-loose.svg"),
      fixture("icon-wide.svg"),
    ]);

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("export-obj").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(".zip");
  });

  test("export is disabled when nothing is selected", async ({ page }) => {
    await expect(page.getByTestId("export-obj")).toBeDisabled();
  });
});
