import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/app-shell";
import { useAuditLogs } from "@/lib/db";
import { dateTime, statusLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — Financial Document OS" },
      {
        name: "description",
        content: "Append-only record of every document, payment and settings change.",
      },
      { property: "og:title", content: "Audit trail — Financial Document OS" },
      {
        property: "og:description",
        content: "Entries cannot be edited or deleted, by database policy.",
      },
    ],
  }),
  component: AuditPage;
});

function AuditPage() {
  const { businessId } = useWorkspace();
  const logs = useAuditLogs(businessId);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = logs.data ?? [];
    if (!needle) return list;
    return list.filter((row) =>
      `${row.action} ${row.entity_type} ${row.actor_name ?? ""}`.toLowerCase().includes(needle),
    );
  }, [logs.data, search]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Audit trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only. Nobody — including you — can edit or delete these entries.
        </p>
      </header>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by action, record type or person"
        className="max-w-sm"
      />

      {logs.isPending ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading activity…
          </CardContent>
        </Card>
      ) : logs.isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-destructive">
            {(logs.error as Error).message}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <ShieldCheck className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rows.map((row) => (
                <div key={row.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{statusLabel(row.action)}</Badge>
                    <span className="text-sm font-medium">{statusLabel(row.entity_type)}</span>
                    <span className="text-xs text-muted-foreground">{dateTime(row.created_at)}</span>
                    {row.actor_name ? (
                      <span className="text-xs text-muted-foreground">· {row.actor_name}</span>
                    ) : null}
                  </div>
                  {row.details && Object.keys(row.details as object).length > 0 ? (
                    <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(row.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
