import { describe, expect, it } from "vitest";
import { DOCUMENT_TEMPLATES, getTemplateById, templateStyle } from "./document-templates";

describe("preserved document studio templates", () => {
  const expected = [
    "executive-atelier", "modern-minimal", "midnight-ledger", "linear-mono",
    "editorial-classic", "nordic-studio", "swiss-grid", "compact-ledger",
  ];

  it("preserves all eight source design identifiers exactly once", () => {
    expect(DOCUMENT_TEMPLATES.map((template) => template.id)).toEqual(expected);
    expect(new Set(DOCUMENT_TEMPLATES.map((template) => template.id)).size).toBe(8);
  });
  it("provides a safe fallback for old or missing template ids", () => {
    expect(getTemplateById(undefined).id).toBe("executive-atelier");
    expect(getTemplateById("not-installed").id).toBe("executive-atelier");
  });
  it("maps every template to print-safe presentation values", () => {
    for (const template of DOCUMENT_TEMPLATES) {
      expect(getTemplateById(template.id)).toBe(template);
      const style = templateStyle(template) as Record<string, string>;
      expect(style["--doc-accent"]).toBe(template.accentColor);
      expect(style["--doc-ink"]).toBe(template.primaryColor);
      expect(style["--doc-font"]).toBe(template.fontFamily);
    }
  });
});
