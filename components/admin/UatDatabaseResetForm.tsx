"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Spinner } from "@/components/shared/Spinner";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function UatDatabaseResetForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [confirmationText, setConfirmationText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validation = useFormValidation<"confirmationText">();

  async function resetDatabase() {
    setIsSubmitting(true);
    validation.clearErrors();

    let payload: { message?: string };

    try {
      payload = await requestJson("/api/platform/uat-reset", {
        body: { confirmationText },
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to reset UAT data.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(payload.message ?? "UAT database reset complete.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-rose-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Reset UAT data</h3>
        <p className="text-sm leading-6 text-stone-500">
          This clears companies, restaurants, locations, users, memberships, orders,
          menus, inventory, domains, invitations and audit logs. The current SaaS
          owner login and SaaS plans are preserved.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void resetDatabase();
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Type reset to continue"
            error={validation.getError("confirmationText")}
            errorId="uat-confirmation-error"
          >
            <Input
              value={confirmationText}
              aria-describedby={
                validation.getError("confirmationText") ? "uat-confirmation-error" : undefined
              }
              aria-invalid={Boolean(validation.getError("confirmationText"))}
              onChange={(event) => {
                validation.clearFieldError("confirmationText");
                setConfirmationText(event.target.value);
              }}
              disabled={isSubmitting}
              placeholder="reset"
            />
          </FormField>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={
                isSubmitting || confirmationText.trim().toLowerCase() !== "reset"
              }
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Resetting...
                </>
              ) : (
                <ButtonLabel icon={RotateCcwIcon}>Reset UAT Database</ButtonLabel>
              )}
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
