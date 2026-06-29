"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/date-format";

type AuditLogRow = {
  id: string;
  actorUsername: string | null;
  actorRole: string | null;
  organizationId: string | null;
  locationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function formatDate(value: string) {
  return formatAppDateTime(value);
}

function formatAction(value: string) {
  return value.replaceAll(".", " / ").replaceAll("_", " ");
}

function formatMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "No metadata";
  }

  const importantEntries = Object.entries(metadata).slice(0, 4);
  return importantEntries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" | ");
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuditLogs() {
      const response = await fetch("/api/audit-logs?limit=50");
      const payload = await response.json();

      if (!response.ok) {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to load audit logs.",
        );
        setIsLoading(false);
        return;
      }

      setLogs(payload.logs ?? []);
      setError(null);
      setIsLoading(false);
    }

    void loadAuditLogs();
  }, []);

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(199,76,0)]">
            Security
          </p>
          <h3 className="mt-2 text-xl font-semibold text-stone-950">Audit logs</h3>
          <p className="mt-1 text-sm text-stone-500">
            Recent scoped admin and operational changes.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-lg">
          <a href="/api/audit-logs/export?limit=250">Export CSV</a>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner className="text-stone-500" />
            Loading audit logs...
          </div>
        ) : null}

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {!isLoading && !error && logs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
            No audit logs in this scope yet.
          </p>
        ) : null}

        {logs.map((log) => (
          <div
            key={log.id}
            className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 lg:grid-cols-[1.1fr_1fr_1.6fr]"
          >
            <div>
              <p className="font-semibold capitalize text-stone-950">
                {formatAction(log.action)}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-400">
                {formatDate(log.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-700">
                {log.actorUsername ?? "System / customer"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-400">
                {log.actorRole?.replaceAll("_", " ") ?? "Anonymous"}
              </p>
            </div>
            <div>
              <p className="text-sm text-stone-600">
                {log.entityType}
                {log.entityId ? `: ${log.entityId}` : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-stone-500">
                {formatMetadata(log.metadata)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
