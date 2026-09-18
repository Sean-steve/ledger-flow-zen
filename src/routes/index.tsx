import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financial Document OS" },
      {
        name: "description",
        content:
          "Invoices, quotations, credit notes, receipts and payment reconciliation in one place.",
      },
      { property: "og:title", content: "Financial Document OS" },
      {
        property: "og:description",
        content:
          "Invoices, quotations, credit notes, receipts and payment reconciliation in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeRedirect,
});

function HomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      navigate({ to: data.user ? "/dashboard" : "/auth", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </main>
  );
}
