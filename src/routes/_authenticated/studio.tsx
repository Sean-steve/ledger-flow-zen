import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, FileText, Save } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/app-shell";
import { DocumentSheet } from "@/components/document-sheet";
import {useBusinessConfig} from "@/lib/business-config";
import { TemplateGallery } from "@/components/template-gallery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocument, useDocuments, useUpdateBusiness } from "@/lib/db";
import { getTemplateById, type TemplateId } from "@/lib/document-templates";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Document Studio — Financial Document OS" },
      { name: "description", content: "Choose from eight premium templates and preview your real financial documents." },
    ],
  }),
  component: StudioPage,
});

function StudioPage() {
  const { business, businessId } = useWorkspace();
  const businessConfig=useBusinessConfig(businessId);
  const documents = useDocuments(businessId);
  const update = useUpdateBusiness(businessId);
  const defaultTemplate = getTemplateById(business.default_template).id;
  const [selected, setSelected] = useState<TemplateId>(defaultTemplate);
  const [chosenDocument, setChosenDocument] = useState("");
  const previewId = chosenDocument || documents.data?.[0]?.id;
  const preview = useDocument(previewId);

  useEffect(() => {
    setSelected(defaultTemplate);
    setChosenDocument("");
  }, [businessId, defaultTemplate]);

  async function saveDefault() {
    try {
      await update.mutateAsync({ default_template: selected });
      toast.success("Default document design saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save template");
    }
  }

  return (
    <div className="studio-route space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Premium design collection</p>
          <h1 className="mt-2 text-4xl">Document Studio</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Eight preserved Receipts designs, now using Ledger Flow's single authoritative document data.
            Select a style, preview it on a real document, and set it as your business default.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/documents/new"><FileText className="size-4" /> Create document</Link>
        </Button>
      </header>

      <section className="space-y-4 print:hidden" aria-labelledby="template-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="template-heading" className="text-2xl">Signature templates</h2>
            <p className="text-sm text-muted-foreground">Choose a design; existing issued documents retain their original template.</p>
          </div>
          <Button onClick={saveDefault} disabled={selected === defaultTemplate || update.isPending}>
            {selected === defaultTemplate ? <Check className="size-4" /> : <Save className="size-4" />}
            {update.isPending ? "Saving…" : selected === defaultTemplate ? "Current business default" : "Set as business default"}
          </Button>
        </div>
        <TemplateGallery selected={selected} onSelect={setSelected} />
      </section>

      <section className="space-y-4" aria-labelledby="preview-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <h2 id="preview-heading" className="text-2xl">Live document preview</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Uses your stored document information. A design preview does not edit, issue or renumber the original.
            </p>
          </div>
          {previewId && (
            <Button asChild variant="outline">
              <Link to="/documents/$documentId" params={{ documentId: previewId }}>
                Open saved document for official exports
              </Link>
            </Button>
          )}
        </div>
        {documents.isPending ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading your documents…</CardContent></Card>
        ) : documents.isError ? (
          <Card><CardContent className="py-12 text-center text-sm text-destructive">Could not load documents. Refresh to retry.</CardContent></Card>
        ) : !documents.data?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <FileText className="size-7 text-primary" />
              <h3 className="text-xl">Your first document will appear here</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                No fabricated sample invoices are displayed. Create a draft, then return to compare all eight designs against it.
              </p>
              <Button asChild><Link to="/documents/new">Create first document</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden print:border-0 print:bg-white print:shadow-none">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 print:hidden">
              <div>
                <CardTitle className="text-lg">{getTemplateById(selected).name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Design comparison only — your saved document is unchanged. Official exports use its saved template.</p>
              </div>
              <Select value={previewId ?? ""} onValueChange={setChosenDocument}>
                <SelectTrigger aria-label="Choose document to preview" className="w-full sm:w-72">
                  <SelectValue placeholder="Choose document" />
                </SelectTrigger>
                <SelectContent>
                  {(documents.data ?? []).map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.doc_number ?? "Draft"} · {doc.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 print:p-0">
              {preview.isPending ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Rendering document…</p>
              ) : preview.isError || !preview.data ? (
                <p role="alert" className="py-12 text-center text-sm text-destructive">
                  Could not open that document. Choose another document.
                </p>
              ) : (
                <div className="studio-design-preview overflow-x-auto rounded-md bg-muted/30 p-2 sm:p-4 print:overflow-visible print:rounded-none print:bg-white print:p-0">
                  <DocumentSheet
                    branding={businessConfig.data?.branding}
                    business={preview.data.business}
                    document={preview.data.document}
                    items={preview.data.items}
                    ledger={preview.data.ledger}
                    templateId={selected}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
