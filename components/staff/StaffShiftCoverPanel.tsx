"use client";

import { useState } from "react";
import { HandIcon, SendIcon, UserRoundPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api-client";
import type {
  StaffScheduledShiftRecord,
  StaffShiftCoverBoard,
} from "@/types/staff-schedule";

type ActionDraft = {
  kind: "REQUEST" | "CLAIM";
  recordId: string;
  title: string;
};

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function StaffShiftCoverPanel({
  initialBoard,
  membershipId,
  shifts,
}: {
  initialBoard: StaffShiftCoverBoard;
  membershipId: string;
  shifts: StaffScheduledShiftRecord[];
}) {
  const [board, setBoard] = useState(initialBoard);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const coveredShiftIds = new Set(
    board.requests
      .filter((request) => request.status === "OPEN")
      .map((request) => request.scheduledShiftId),
  );
  const eligibleRequests = board.requests.filter(
    (request) =>
      request.status === "OPEN" &&
      request.membershipId !== membershipId &&
      request.requestedByMembershipId !== membershipId,
  );

  async function submitAction() {
    if (!draft) return;
    setIsSaving(true);
    try {
      const result = await requestJson<StaffShiftCoverBoard>(
        "/api/tenant/shift-cover",
        {
          body:
            draft.kind === "REQUEST"
              ? {
                  action: "REQUEST",
                  scheduledShiftId: draft.recordId,
                  reason: note,
                }
              : { action: "CLAIM", requestId: draft.recordId, note },
          fallbackError: "The shift-cover action could not be completed.",
        },
      );
      setBoard(result);
      setDraft(null);
      setNote("");
      toast.success(
        draft.kind === "REQUEST"
          ? "Cover requested."
          : "Your offer was sent to a manager.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRecord(recordId: string, status: "CANCELLED" | "WITHDRAWN") {
    setIsSaving(true);
    try {
      setBoard(
        await requestJson<StaffShiftCoverBoard>(
          `/api/tenant/shift-cover/${recordId}`,
          { method: "PATCH", body: { status } },
        ),
      );
      toast.success(status === "CANCELLED" ? "Cover request cancelled." : "Offer withdrawn.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="px-5 pt-5">
          <div className="flex items-center gap-3">
            <HandIcon className="size-5 text-muted-foreground" />
            <div>
              <h3 className="text-2xl font-semibold">Shift cover</h3>
              <p className="text-sm text-muted-foreground">
                Request cover or volunteer for a qualified open shift.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 pb-5">
          <section>
            <h4 className="mb-2 font-semibold">Your upcoming shifts</h4>
            <div className="divide-y divide-border border-y border-border">
              {shifts.filter((shift) => shift.status === "PUBLISHED").map((shift) => {
                const request = board.requests.find(
                  (item) => item.scheduledShiftId === shift.id && item.status === "OPEN",
                );
                return (
                  <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{shift.jobName}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(shift.startsAt, board.timezone)}
                      </p>
                    </div>
                    {request ? (
                      <div className="flex items-center gap-2">
                        <StatusPill tone="warning">Cover open</StatusPill>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSaving}
                          onClick={() => void updateRecord(request.id, "CANCELLED")}
                        >
                          <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={coveredShiftIds.has(shift.id)}
                        onClick={() =>
                          setDraft({ kind: "REQUEST", recordId: shift.id, title: shift.jobName })
                        }
                      >
                        <ButtonLabel icon={UserRoundPlusIcon}>Request cover</ButtonLabel>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="mb-2 font-semibold">Available shifts</h4>
            {eligibleRequests.length ? (
              <div className="divide-y divide-border border-y border-border">
                {eligibleRequests.map((request) => {
                  const ownClaim = request.claims.find(
                    (claim) => claim.membershipId === membershipId,
                  );
                  return (
                    <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{request.jobName}</p>
                          <StatusPill>{request.kind === "OPEN_SHIFT" ? "Open shift" : "Cover"}</StatusPill>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(request.startsAt, board.timezone)}
                        </p>
                      </div>
                      {ownClaim?.status === "PENDING" ? (
                        <div className="flex items-center gap-2">
                          <StatusPill tone="warning">Offer pending</StatusPill>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving}
                            onClick={() => void updateRecord(ownClaim.id, "WITHDRAWN")}
                          >
                            Withdraw
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          onClick={() =>
                            setDraft({ kind: "CLAIM", recordId: request.id, title: request.jobName })
                          }
                        >
                          <ButtonLabel icon={HandIcon}>Offer to cover</ButtonLabel>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No qualified open shifts are available.
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {draft?.kind === "REQUEST" ? "Request cover" : "Offer to cover"}
            </DialogTitle>
            <DialogDescription>{draft?.title}</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5">
            <Textarea
              aria-label="Note (optional)"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={draft?.kind === "REQUEST" ? "Why do you need cover?" : "Add a note for the manager"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Close
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void submitAction()}>
              <ButtonLabel icon={SendIcon}>{isSaving ? "Sending..." : "Send"}</ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
