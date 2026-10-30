"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BanIcon,
  GitBranchIcon,
  MailCheckIcon,
  SaveIcon,
  SendIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  IntegrationModeSelector,
  IntegrationPanel,
  IntegrationStatus,
} from "@/components/admin/IntegrationPanel";
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

type EmailIntegrationField = "apiKey" | "fromEmail" | "fromName" | "replyToEmail";

type EmailIntegrationFormProps = {
  apiPath: string;
  backHref?: string;
  initialSnapshot: OrganizationEmailSettingsSnapshot;
};

const modeOptions: Array<{
  description: string;
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  {
    description: "Use company or platform email settings.",
    icon: GitBranchIcon,
    label: "Inherit",
    value: "INHERIT",
  },
  {
    description: "Configure a separate sender here.",
    icon: Settings2Icon,
    label: "Custom",
    value: "CUSTOM",
  },
  {
    description: "Turn off email delivery for this scope.",
    icon: BanIcon,
    label: "Disabled",
    value: "DISABLED",
  },
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
      <IntegrationStatus
        tone="success"
        title={`Active via ${snapshot.effective.sourceOrganizationName}`}
        detail={snapshot.effective.sender}
      />
    );
  }

  const isDisabled = snapshot.effective.status === "DISABLED";

  return (
    <IntegrationStatus
      tone={isDisabled ? "neutral" : "warning"}
      title={isDisabled ? "Email delivery is disabled" : "Email delivery needs attention"}
      detail={
        isDisabled
          ? undefined
          : snapshot.effective.reason === "NOT_VERIFIED"
            ? "Save the configuration and send a successful test email."
            : snapshot.effective.reason === "INCOMPLETE"
              ? "Complete the selected custom configuration."
              : "No inherited or custom email service is available."
      }
    />
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

  const resolvedModeOptions = modeOptions.map((option) => ({
    ...option,
    label: option.value === "INHERIT" ? inheritLabel : option.label,
  }));

  return (
    <IntegrationPanel
      icon={MailCheckIcon}
      title="Email delivery"
      description="Configure how order and notification emails are delivered for this scope."
      status={<EffectiveStatus snapshot={snapshot} />}
    >
      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <IntegrationModeSelector
          ariaLabel="Delivery mode"
          label="Delivery mode"
          value={draft.mode}
          options={resolvedModeOptions}
          onChange={(value) => updateDraft("mode", value)}
        />

        {draft.mode === "CUSTOM" ? (
          <div className="grid gap-4 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <MailCheckIcon className="size-5 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">SMTP2GO sender</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Sender name"
                tone="themed"
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
                tone="themed"
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
                tone="themed"
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
                tone="themed"
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

        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
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
    </IntegrationPanel>
  );
}
