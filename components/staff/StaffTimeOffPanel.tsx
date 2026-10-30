"use client";

import { useState } from "react";
import { CalendarOffIcon, PlusIcon, SendIcon, XIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api-client";
import type { StaffTimeOffRecord } from "@/types/staff-schedule";

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

export function StaffTimeOffPanel({
  initialRequests,
}: {
  initialRequests: StaffTimeOffRecord[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  async function submitRequest() {
    setIsSaving(true);

    try {
      const result = await requestJson<StaffTimeOffRecord[]>(
        "/api/tenant/time-off",
        {
          body: { startsOn, endsOn, reason },
          fallbackError: "The time-off request could not be submitted.",
        },
      );
      setRequests(result);
      setIsOpen(false);
      setStartsOn("");
      setEndsOn("");
      setReason("");
      toast.success("Time-off request submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelRequest(requestId: string) {
    setIsSaving(true);

    try {
      const result = await requestJson<StaffTimeOffRecord[]>(
        `/api/tenant/time-off/${requestId}`,
        {
          method: "PATCH",
          body: { status: "CANCELLED" },
          fallbackError: "The time-off request could not be cancelled.",
        },
      );
      setRequests(result);
      toast.success("Time-off request cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancellation failed.");
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
              <h3 className="text-2xl font-semibold">Time off</h3>
              <p className="text-sm text-muted-foreground">
                Request leave and track its approval.
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => setIsOpen(true)}>
            <ButtonLabel icon={PlusIcon}>Request time off</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {requests.length ? (
            <div className="divide-y divide-border border-y border-border">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {formatDate(request.startsOn)}
                        {request.endsOn === request.startsOn
                          ? ""
                          : ` to ${formatDate(request.endsOn)}`}
                      </p>
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
                        Manager note: {request.reviewNote}
                      </p>
                    ) : null}
                  </div>
                  {request.status === "PENDING" || request.status === "APPROVED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => void cancelRequest(request.id)}
                    >
                      <ButtonLabel icon={XIcon}>Cancel request</ButtonLabel>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-5">
              <p className="font-medium">No time-off requests</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Submitted requests and manager decisions will appear here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Request time off</DialogTitle>
            <DialogDescription>
              Your manager will review the selected dates.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-5 sm:grid-cols-2">
            <FormField label="First day" tone="themed">
              <Input
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </FormField>
            <FormField label="Last day" tone="themed">
              <Input
                type="date"
                min={startsOn || undefined}
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </FormField>
            <FormField label="Reason (optional)" tone="themed" className="sm:col-span-2">
              <Textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Add a short note for your manager"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              <ButtonLabel icon={XIcon}>Close</ButtonLabel>
            </Button>
            <Button
              type="button"
              disabled={isSaving || !startsOn || !endsOn}
              onClick={() => void submitRequest()}
            >
              <ButtonLabel icon={SendIcon}>
                {isSaving ? "Submitting..." : "Submit request"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
