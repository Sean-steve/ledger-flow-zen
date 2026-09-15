import { createFileRoute } from "@tanstack/react-router";

import { DocumentBuilder } from "@/components/document-builder";

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({
    meta: [
      { title: "New document — Financial Document OS" },
      {
        name: "description",
        content: "Raise an invoice, quotation, pro-forma, credit note or debit note.",
      },
      { property: "og:title", content: "New document — Financial Document OS" },
      { property: "og:description", content: "Build a document with tax-accurate line items." },
    ],
  }),
  component: NewDocumentPage,
});

function NewDocumentPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">New document</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved as a draft first. Nothing is numbered until you issue it.
        </p>
      </header>
      <DocumentBuilder />
    </div>
  );
}
