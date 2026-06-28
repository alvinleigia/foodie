"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED";

type CompanySubscriptionFormProps = {
  apiPath: string;
  companyName: string;
  currentStatus: SubscriptionStatus;
};

function getApiError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      return error;
    }
  }

  return "Action failed.";
}

export function CompanySubscriptionForm({
  apiPath,
  companyName,
  currentStatus,
}: CompanySubscriptionFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<SubscriptionStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStatus() {
    setIsSubmitting(true);
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiError(payload);
      setError(message);
      toast.error(message);
      setIsSubmitting(false);
      return;
    }

    toast.success("Subscription updated.");
    router.push("/platform");
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">
          Update subscription
        </h3>
        <p className="text-sm text-stone-500">
          Change the commercial access status for {companyName}.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitStatus();
          }}
        >
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Subscription status">
            <Select
              value={status}
              onValueChange={(nextStatus) =>
                setStatus(nextStatus as SubscriptionStatus)
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRIALING">Trialing</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAST_DUE">Past due</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {isSubmitting ? "Saving..." : "Save subscription"}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href="/platform">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
