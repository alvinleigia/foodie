"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BanIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  MailCheckIcon,
  SaveIcon,
  SendIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/api-client";
import type {
  IntegrationMode,
  OrganizationEmailSettingsSnapshot,
} from "@/lib/organization-integration-types";
import { cn } from "@/lib/utils";

type EmailIntegrationField = "apiKey" | "fromEmail" | "fromName" | "replyToEmail";

type EmailIntegrationFormProps = {
  apiPath: string;
  backHref?: string;
  initialSnapshot: OrganizationEmailSettingsSnapshot;
};

const modeOptions: Array<{
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  { icon: GitBranchIcon, label: "Inherit", value: "INHERIT" },
  { icon: Settings2Icon, label: "Custom", value: "CUSTOM" },
  { icon: BanIcon, label: "Disabled", value: "DISABLED" },
];

function toDraft(snapshot: OrganizationEmailSettingsSnapshot) {
  return {
    mode: snapshot.settings.mode,
    fromName: snapshot.settings.fromName,
    fromEmail: snapshot.settings.fromEmail,
    replyToEmail: snapshot.settings.replyToEmail,
    apiKey: "",
  };
}

function EffectiveStatus({ snapshot }: { snapshot: OrganizationEmailSettingsSnapshot }) {
  if (snapshot.effective.status === "CONFIGURED") {
    return (
      <div className="flex items-start gap-3 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-950">
            Active via {snapshot.effective.sourceOrganizationName}
          </p>
          {snapshot.effective.sender ? (
            <p className="mt-1 break-words text-sm text-emerald-800">
              {snapshot.effective.sender}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const isDisabled = snapshot.effective.status === "DISABLED";

  return (
    <div
      className={cn(
        "border-l-4 px-4 py-3",
        isDisabled
          ? "border-stone-400 bg-stone-100 text-stone-700"
          : "border-amber-500 bg-amber-50 text-amber-900",
      )}
    >
      <p className="text-sm font-semibold">
        {isDisabled ? "Email delivery is disabled" : "Email delivery needs attention"}
      </p>
      {!isDisabled ? (
        <p className="mt-1 text-sm">
          {snapshot.effective.reason === "NOT_VERIFIED"
            ? "Save the configuration and send a successful test email."
            : snapshot.effective.reason === "INCOMPLETE"
              ? "Complete the selected custom configuration."
              : "No inherited or custom email service is available."}
        </p>
      ) : null}
    </div>
  );
}

export function EmailIntegrationForm({
  apiPath,
  backHref,
  initialSnapshot,
}: EmailIntegrationFormProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draft, setDraft] = useState(() => toDraft(initialSnapshot));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const validation = useFormValidation<EmailIntegrationField>();
  const inheritLabel = snapshot.parent
    ? `Inherit from ${snapshot.parent.name}`
    : "Use platform default";

  function updateDraft<TField extends keyof typeof draft>(
    field: TField,
    value: (typeof draft)[TField],
  ) {
    validation.clearFieldError(field as EmailIntegrationField);
    setDraft((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const payload = await requestJson<{ snapshot: OrganizationEmailSettingsSnapshot }>(
        apiPath,
        {
          method: "PATCH",
          body: draft,
          fallbackError: "Email settings could not be saved.",
        },
      );
      setSnapshot(payload.snapshot);
      setDraft(toDraft(payload.snapshot));
      setIsDirty(false);
      toast.success("Email settings saved.");
    } catch (error) {
      const result = validation.applyCaught(error);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function sendTest() {
    setIsTesting(true);

    try {
      const payload = await requestJson<{ snapshot: OrganizationEmailSettingsSnapshot }>(
        apiPath,
        {
          method: "POST",
          fallbackError: "Test email could not be sent.",
        },
      );
      setSnapshot(payload.snapshot);
      setDraft(toDraft(payload.snapshot));
      setIsDirty(false);
      toast.success("Test email sent to your account email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test email could not be sent.");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <EffectiveStatus snapshot={snapshot} />

      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-stone-900">Delivery mode</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Delivery mode">
            {modeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = draft.mode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => updateDraft("mode", option.value)}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors",
                    isSelected
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-400",
                  )}
                >
                  <Icon className="size-4" />
                  {option.value === "INHERIT" ? inheritLabel : option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {draft.mode === "CUSTOM" ? (
          <div className="grid gap-4 border-t border-stone-200 pt-5">
            <div className="flex items-center gap-2">
              <MailCheckIcon className="size-5 text-stone-700" />
              <h3 className="text-base font-semibold text-stone-950">SMTP2GO sender</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Sender name"
                error={validation.getError("fromName")}
                errorId="email-integration-from-name-error"
              >
                <Input
                  value={draft.fromName}
                  onChange={(event) => updateDraft("fromName", event.target.value)}
                  placeholder={snapshot.organization.name}
                  aria-invalid={Boolean(validation.getError("fromName"))}
                />
              </FormField>
              <FormField
                label="Sender email"
                error={validation.getError("fromEmail")}
                errorId="email-integration-from-email-error"
              >
                <Input
                  type="email"
                  value={draft.fromEmail}
                  onChange={(event) => updateDraft("fromEmail", event.target.value)}
                  placeholder="orders@example.com"
                  aria-invalid={Boolean(validation.getError("fromEmail"))}
                />
              </FormField>
              <FormField
                label="Reply-to email"
                error={validation.getError("replyToEmail")}
                errorId="email-integration-reply-to-error"
              >
                <Input
                  type="email"
                  value={draft.replyToEmail}
                  onChange={(event) => updateDraft("replyToEmail", event.target.value)}
                  placeholder="support@example.com"
                  aria-invalid={Boolean(validation.getError("replyToEmail"))}
                />
              </FormField>
              <FormField
                label="SMTP2GO API key"
                description={
                  snapshot.settings.hasApiKey
                    ? `Saved securely (${snapshot.settings.apiKeyHint ?? "key available"}). Leave blank to keep it.`
                    : "Required for custom delivery."
                }
                error={validation.getError("apiKey")}
                errorId="email-integration-api-key-error"
              >
                <Input
                  type="password"
                  value={draft.apiKey}
                  onChange={(event) => updateDraft("apiKey", event.target.value)}
                  autoComplete="new-password"
                  placeholder={snapshot.settings.hasApiKey ? "Keep saved key" : "api-..."}
                  aria-invalid={Boolean(validation.getError("apiKey"))}
                />
              </FormField>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
          <Button type="submit" disabled={isSaving || isTesting}>
            <ButtonLabel icon={SaveIcon}>{isSaving ? "Saving..." : "Save changes"}</ButtonLabel>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDirty || isSaving || isTesting || draft.mode === "DISABLED"}
            onClick={() => void sendTest()}
          >
            <ButtonLabel icon={SendIcon}>{isTesting ? "Sending..." : "Send test email"}</ButtonLabel>
          </Button>
          {backHref ? (
            <Button asChild type="button" variant="ghost">
              <Link href={backHref}>
                <ButtonLabel icon={XIcon}>Back</ButtonLabel>
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
