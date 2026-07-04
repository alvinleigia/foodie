"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
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
  backHref: string;
  companyName: string;
  currentStatus: SubscriptionStatus;
};

type CompanySubscriptionField = "status";

export function CompanySubscriptionForm({
  apiPath,
  backHref,
  companyName,
  currentStatus,
}: CompanySubscriptionFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<SubscriptionStatus>(currentStatus);
  const validation = useFormValidation<CompanySubscriptionField>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStatus() {
    validation.clearErrors();
    setIsSubmitting(true);

    try {
      await requestJson(apiPath, {
        body: { status },
        method: "PATCH",
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to update subscription.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success("Subscription updated.");
    router.push(backHref);
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
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Subscription status"
            error={validation.getError("status")}
            errorId="subscription-status-error"
          >
            <Select
              value={status}
              onValueChange={(nextStatus) => {
                validation.clearFieldError("status");
                setStatus(nextStatus as SubscriptionStatus);
              }}
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
              <ButtonLabel icon={SaveIcon}>
                {isSubmitting ? "Saving..." : "Save subscription"}
              </ButtonLabel>
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href={backHref}>
                <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
