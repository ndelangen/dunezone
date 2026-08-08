import JSZip from "jszip";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(filename: string, content: string): void {
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, ensureExtension(filename, ".svg"));
}

export function downloadObj(filename: string, content: string): void {
  const blob = new Blob([content], { type: "model/obj;charset=utf-8" });
  triggerDownload(blob, replaceExtension(filename, ".obj"));
}

export interface ZipEntry {
  name: string;
  content: string | Blob;
}

export async function downloadZip(
  entries: ZipEntry[],
  zipName = "svg-pipeline-export.zip",
): Promise<void> {
  const zip = new JSZip();
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const name = dedupeName(entry.name, seen);
    zip.file(name, entry.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipName);
}

export function ensureExtension(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

/** Normalize a user-provided zip name into a safe `*.zip` filename. */
export function zipFilename(name: string, fallback = "export"): string {
  const trimmed = name.trim().replace(/\.zip$/i, "");
  const base = trimmed || fallback;
  return `${base}.zip`;
}

export function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base}${ext}`;
}

function dedupeName(name: string, seen: Map<string, number>): string {
  const count = seen.get(name) ?? 0;
  seen.set(name, count + 1);
  if (count === 0) return name;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return `${name}-${count}`;
  return `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
}
