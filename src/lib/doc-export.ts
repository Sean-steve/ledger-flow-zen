import { toBlob } from "html-to-image";

/**
 * All output paths share one rendering system: the `.doc-sheet` node rendered
 * on screen is the same node that is printed (PDF via the browser print
 * dialog) and rasterised (PNG/JPG).
 */
export function getSheetNode(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.matches("[data-doc-sheet]")
    ? root
    : root.querySelector<HTMLElement>("[data-doc-sheet]");
}

export function printSheet() {
  if (typeof window === "undefined") return;
  window.print();
}

export async function exportSheetImage(
  root: HTMLElement | null,
  filename: string,
  format: "png" | "jpeg" = "png",
) {
  const node = getSheetNode(root);
  if (!node) throw new Error("Nothing to export yet");

  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    ...(format === "jpeg" ? { quality: 0.95, type: "image/jpeg" as const } : {}),
  });
  if (!blob) throw new Error("Export failed");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.${format === "jpeg" ? "jpg" : "png"}`;
  link.click();
  URL.revokeObjectURL(url);
}
