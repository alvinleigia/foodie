"use client";

import { useMemo, useState } from "react";
import { CalendarOffIcon, CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
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
import type { StaffTimeOffRecord } from "@/types/staff-schedule";

type Review = {
  request: StaffTimeOffRecord;
  status: "APPROVED" | "DECLINED";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function statusTone(status: StaffTimeOffRecord["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "DECLINED") return "danger" as const;
  return "neutral" as const;
}

export function StaffTimeOffManager({
  initialRequests,
}: {
  initialRequests: StaffTimeOffRecord[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "PENDING").length,
    [requests],
  );

  function openReview(
    request: StaffTimeOffRecord,
    status: Review["status"],
  ) {
    setReview({ request, status });
    setReviewNote("");
  }

  async function submitReview() {
    if (!review) return;
    setIsSaving(true);

    try {
      const result = await requestJson<StaffTimeOffRecord[]>(
        `/api/tenant/admin/time-off/${review.request.id}`,
        {
          method: "PATCH",
          body: { status: review.status, reviewNote },
          fallbackError: "The time-off request could not be reviewed.",
        },
      );
      setRequests(result);
      setReview(null);
      toast.success(
        review.status === "APPROVED"
          ? "Time-off request approved."
          : "Time-off request declined.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div className="flex items-center gap-3">
            <CalendarOffIcon className="size-5 text-muted-foreground" />
            <div>
              <h3 className="text-2xl font-semibold">Time-off requests</h3>
              <p className="text-sm text-muted-foreground">
                Review staff leave before publishing conflicting shifts.
              </p>
            </div>
          </div>
          <StatusPill tone={pendingCount ? "warning" : "neutral"}>
            {pendingCount} pending
          </StatusPill>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {requests.length ? (
            <div className="divide-y divide-border border-y border-border">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{request.staffName}</p>
                      <StatusPill tone={statusTone(request.status)}>
                        {request.status}
                      </StatusPill>
                    </div>
                    {request.reason ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {request.reason}
                      </p>
                    ) : null}
                    {request.reviewNote ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review note: {request.reviewNote}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm">
                    {formatDate(request.startsOn)}
                    {request.endsOn === request.startsOn
                      ? ""
                      : ` to ${formatDate(request.endsOn)}`}
                  </p>
                  {request.status === "PENDING" ? (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openReview(request, "DECLINED")}
                      >
                        <ButtonLabel icon={XIcon}>Decline</ButtonLabel>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openReview(request, "APPROVED")}
                      >
                        <ButtonLabel icon={CheckIcon}>Approve</ButtonLabel>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-5">
              <p className="font-medium">No time-off requests</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Staff requests will appear here for review.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {review?.status === "APPROVED" ? "Approve" : "Decline"} time off
            </DialogTitle>
            <DialogDescription>
              {review
                ? `${review.request.staffName}: ${formatDate(review.request.startsOn)} to ${formatDate(review.request.endsOn)}`
                : "Review the selected request."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5">
            <FormField label="Manager note (optional)" tone="themed">
              <Textarea
                rows={3}
                maxLength={500}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant={review?.status === "DECLINED" ? "destructive" : "default"}
              disabled={isSaving}
              onClick={() => void submitReview()}
            >
              <ButtonLabel icon={review?.status === "APPROVED" ? CheckIcon : XIcon}>
                {isSaving
                  ? "Saving..."
                  : review?.status === "APPROVED"
                    ? "Approve request"
                    : "Decline request"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
