"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, HandIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requestJson } from "@/lib/api-client";
import type { StaffShiftCoverBoard } from "@/types/staff-schedule";

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function StaffShiftCoverManager({ initialBoard }: { initialBoard: StaffShiftCoverBoard }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [isSaving, setIsSaving] = useState(false);

  async function updateRequest(
    requestId: string,
    payload: { status: "CANCELLED" } | { claimId: string; status: "APPROVED" | "DECLINED" },
  ) {
    setIsSaving(true);
    try {
      setBoard(
        await requestJson<StaffShiftCoverBoard>(
          `/api/tenant/admin/shift-cover/${requestId}`,
          { method: "PATCH", body: payload },
        ),
      );
      router.refresh();
      toast.success(
        payload.status === "APPROVED"
          ? "Shift assigned to volunteer."
          : payload.status === "DECLINED"
            ? "Cover offer declined."
            : "Cover request cancelled.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const openRequests = board.requests.filter((request) => request.status === "OPEN");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div className="flex items-center gap-3">
          <HandIcon className="size-5 text-muted-foreground" />
          <div>
            <h3 className="text-2xl font-semibold">Open shifts and cover</h3>
            <p className="text-sm text-muted-foreground">
              Review qualified volunteers before changing the schedule.
            </p>
          </div>
        </div>
        <StatusPill tone={openRequests.length ? "warning" : "neutral"}>
          {openRequests.length} open
        </StatusPill>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {openRequests.length ? (
          <div className="divide-y divide-border border-y border-border">
            {openRequests.map((request) => (
              <div key={request.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{request.jobName}</p>
                    <StatusPill>{request.kind === "OPEN_SHIFT" ? "Open shift" : "Cover requested"}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDateTime(request.startsAt, board.timezone)}
                    {request.staffName ? ` / ${request.staffName}` : " / Unassigned"}
                  </p>
                  {request.reason ? <p className="mt-1 text-sm text-muted-foreground">{request.reason}</p> : null}
                  <div className="mt-3 grid gap-2">
                    {request.claims.length ? request.claims.map((claim) => (
                      <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                        <div>
                          <p className="font-medium">{claim.staffName}</p>
                          {claim.note ? <p className="text-sm text-muted-foreground">{claim.note}</p> : null}
                        </div>
                        {claim.status === "PENDING" ? (
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" disabled={isSaving} onClick={() => void updateRequest(request.id, { claimId: claim.id, status: "DECLINED" })}>
                              <ButtonLabel icon={XIcon}>Decline</ButtonLabel>
                            </Button>
                            <Button type="button" disabled={isSaving} onClick={() => void updateRequest(request.id, { claimId: claim.id, status: "APPROVED" })}>
                              <ButtonLabel icon={CheckIcon}>Approve</ButtonLabel>
                            </Button>
                          </div>
                        ) : <StatusPill>{claim.status}</StatusPill>}
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">No volunteers yet.</p>
                    )}
                  </div>
                </div>
                <Button type="button" variant="outline" disabled={isSaving} onClick={() => void updateRequest(request.id, { status: "CANCELLED" })}>
                  <ButtonLabel icon={XIcon}>Cancel request</ButtonLabel>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5">
            <p className="font-medium">No open cover requests</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open shifts and staff cover requests will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
