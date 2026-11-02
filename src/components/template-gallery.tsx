import { Check, Palette } from "lucide-react";
import { DOCUMENT_TEMPLATES, templateStyle, type TemplateId } from "@/lib/document-templates";

/**
 * Shared accessible gallery for selecting a financial document's design.
 * The small cards contain layout placeholders, never fabricated transactions.
 */
export function TemplateGallery({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (templateId: TemplateId) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Document templates">
      {DOCUMENT_TEMPLATES.map((template) => (
        <button
          type="button"
          key={template.id}
          aria-pressed={selected === template.id}
          onClick={() => onSelect(template.id)}
          className={`group overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            selected === template.id ? "border-primary ring-2 ring-primary/40" : "border-border"
          }`}
        >
          <div
            className="relative flex h-40 items-center justify-center p-5"
            style={{
              background: template.primaryColor,
              ...templateStyle(template),
            }}
          >
            <div className="w-32 rounded-sm bg-white p-3 shadow-xl">
              <div className="h-1.5 w-12 rounded-full" style={{ background: template.accentColor }} />
              <div className="mt-2 h-1 w-20 rounded-full bg-slate-200" />
              <div className="mt-1 h-1 w-16 rounded-full bg-slate-100" />
              <div className="mt-4 grid grid-cols-[1fr_22px] gap-2 border-t border-slate-200 pt-2">
                <div className="space-y-1">
                  <div className="h-1 w-12 rounded-full bg-slate-200" />
                  <div className="h-1 w-16 rounded-full bg-slate-100" />
                </div>
                <div className="h-1 rounded-full" style={{ background: template.accentColor }} />
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-slate-100" />
            </div>
            {selected === template.id && (
              <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-1 text-primary-foreground">
                <Check className="size-4" aria-hidden="true" />
                <span className="sr-only">Selected</span>
              </span>
            )}
          </div>
          <div className="space-y-1 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="size-4 text-primary" aria-hidden="true" />
              {template.name}
            </div>
            <p className="text-[11px] text-muted-foreground">{template.category}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {template.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
