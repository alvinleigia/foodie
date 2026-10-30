"use client";

import { useMemo, useState } from "react";
import {
  AppleIcon,
  BanIcon,
  CopyIcon,
  GitBranchIcon,
  Globe2Icon,
  SaveIcon,
  Settings2Icon,
  UsersIcon,
  UsersRoundIcon,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestJson } from "@/lib/api-client";
import type {
  IntegrationMode,
  OrganizationOAuthSettingsSnapshot,
  SocialAuthProvider,
} from "@/lib/organization-integration-types";

type OAuthIntegrationField = "clientId" | "clientSecret";

type OAuthIntegrationFormProps = {
  apiPath: string;
  callbackOrigin: string;
  initialSnapshots: OrganizationOAuthSettingsSnapshot[];
};

type OAuthDraft = {
  provider: SocialAuthProvider;
  mode: IntegrationMode;
  clientId: string;
  clientSecret: string;
};

const providers: Array<{
  clientIdLabel: string;
  clientIdPlaceholder: string;
  clientSecretLabel: string;
  icon: typeof Globe2Icon;
  label: string;
  provider: SocialAuthProvider;
}> = [
  {
    provider: "GOOGLE",
    label: "Google",
    icon: Globe2Icon,
    clientIdLabel: "Client ID",
    clientIdPlaceholder: "123456789.apps.googleusercontent.com",
    clientSecretLabel: "Client secret",
  },
  {
    provider: "APPLE",
    label: "Apple",
    icon: AppleIcon,
    clientIdLabel: "Services ID",
    clientIdPlaceholder: "com.example.web",
    clientSecretLabel: "Generated client secret",
  },
  {
    provider: "FACEBOOK",
    label: "Facebook",
    icon: UsersIcon,
    clientIdLabel: "App ID",
    clientIdPlaceholder: "123456789",
    clientSecretLabel: "App secret",
  },
];

const modeOptions: Array<{
  description: string;
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  {
    description: "Use company or platform credentials.",
    icon: GitBranchIcon,
    label: "Inherit",
    value: "INHERIT",
  },
  {
    description: "Configure separate credentials here.",
    icon: Settings2Icon,
    label: "Custom",
    value: "CUSTOM",
  },
  {
    description: "Turn off this provider for this scope.",
    icon: BanIcon,
    label: "Disabled",
    value: "DISABLED",
  },
];

function toDraft(snapshot: OrganizationOAuthSettingsSnapshot): OAuthDraft {
  return {
    provider: snapshot.settings.provider,
    mode: snapshot.settings.mode,
    clientId: snapshot.settings.clientId,
    clientSecret: "",
  };
}

function EffectiveStatus({ snapshot }: { snapshot: OrganizationOAuthSettingsSnapshot }) {
  if (snapshot.effective.status === "CONFIGURED") {
    return (
      <IntegrationStatus
        tone="success"
        title={`Active via ${snapshot.effective.sourceOrganizationName}`}
      />
    );
  }

  const isDisabled = snapshot.effective.status === "DISABLED";

  return (
    <IntegrationStatus
      tone={isDisabled ? "neutral" : "warning"}
      title={isDisabled ? "Customer login is disabled" : "Customer login needs attention"}
      detail={
        isDisabled
          ? undefined
          : snapshot.effective.reason === "INCOMPLETE"
            ? "Complete the selected custom credentials."
            : "No inherited or universal credentials are available."
      }
    />
  );
}

export function OAuthIntegrationForm({
  apiPath,
  callbackOrigin,
  initialSnapshots,
}: OAuthIntegrationFormProps) {
  const initialSnapshotMap = useMemo(
    () =>
      Object.fromEntries(
        initialSnapshots.map((snapshot) => [snapshot.settings.provider, snapshot]),
      ) as Record<SocialAuthProvider, OrganizationOAuthSettingsSnapshot>,
    [initialSnapshots],
  );
  const [snapshots, setSnapshots] = useState(initialSnapshotMap);
  const [drafts, setDrafts] = useState<Record<SocialAuthProvider, OAuthDraft>>(() =>
    Object.fromEntries(
      initialSnapshots.map((snapshot) => [snapshot.settings.provider, toDraft(snapshot)]),
    ) as Record<SocialAuthProvider, OAuthDraft>,
  );
  const [selectedProvider, setSelectedProvider] =
    useState<SocialAuthProvider>("GOOGLE");
  const [dirtyProviders, setDirtyProviders] = useState<Set<SocialAuthProvider>>(
    () => new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<OAuthIntegrationField>();
  const snapshot = snapshots[selectedProvider];
  const draft = drafts[selectedProvider];
  const providerDetails = providers.find(
    (provider) => provider.provider === selectedProvider,
  )!;
  const callbackUrl = `${callbackOrigin}/api/customer-social-auth/callback/${selectedProvider.toLowerCase()}`;
  const inheritLabel = snapshot.parent
    ? `Inherit from ${snapshot.parent.name}`
    : "Use Foodie default";
  const resolvedModeOptions = modeOptions.map((option) => ({
    ...option,
    label: option.value === "INHERIT" ? inheritLabel : option.label,
  }));

  function updateDraft<TField extends keyof OAuthDraft>(
    field: TField,
    value: OAuthDraft[TField],
  ) {
    if (field === "clientId" || field === "clientSecret") {
      validation.clearFieldError(field);
    }
    setDrafts((current) => ({
      ...current,
      [selectedProvider]: { ...current[selectedProvider], [field]: value },
    }));
    setDirtyProviders((current) => new Set(current).add(selectedProvider));
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const payload = await requestJson<{
        snapshot: OrganizationOAuthSettingsSnapshot;
      }>(apiPath, {
        method: "PATCH",
        body: draft,
        fallbackError: `${providerDetails.label} login settings could not be saved.`,
      });
      setSnapshots((current) => ({
        ...current,
        [selectedProvider]: payload.snapshot,
      }));
      setDrafts((current) => ({
        ...current,
        [selectedProvider]: toDraft(payload.snapshot),
      }));
      setDirtyProviders((current) => {
        const next = new Set(current);
        next.delete(selectedProvider);
        return next;
      });
      toast.success(`${providerDetails.label} login settings saved.`);
    } catch (error) {
      const result = validation.applyCaught(error);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function copyCallbackUrl() {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      toast.success("Callback URL copied.");
    } catch {
      toast.error("Callback URL could not be copied.");
    }
  }

  return (
    <IntegrationPanel
      icon={UsersRoundIcon}
      title="Customer social login"
      description="Allow customers to sign in with supported social accounts."
      status={<EffectiveStatus snapshot={snapshot} />}
    >
      <Tabs
        value={selectedProvider}
        onValueChange={(value) => {
          validation.clearErrors();
          setSelectedProvider(value as SocialAuthProvider);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
          <p className="text-sm font-semibold text-foreground">Social provider</p>
          <TabsList className="gap-2" aria-label="Social login provider">
            {providers.map((provider) => {
              const Icon = provider.icon;

              return (
                <TabsTrigger
                  key={provider.provider}
                  value={provider.provider}
                  className="gap-2 data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-foreground"
                >
                  <Icon className="size-4" />
                  {provider.label}
                  {dirtyProviders.has(provider.provider) ? " *" : ""}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {providers.map((provider) => (
          <TabsContent key={provider.provider} value={provider.provider}>
            <div className="grid gap-6">
              <IntegrationModeSelector
                ariaLabel={`${provider.label} login mode`}
                label="Login mode"
                value={draft.mode}
                options={resolvedModeOptions}
                onChange={(value) => updateDraft("mode", value)}
              />

              {draft.mode === "CUSTOM" ? (
                <div className="grid gap-4 border-t border-border pt-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label={providerDetails.clientIdLabel}
                      tone="themed"
                      error={validation.getError("clientId")}
                      errorId="oauth-client-id-error"
                    >
                      <Input
                        value={draft.clientId}
                        onChange={(event) => updateDraft("clientId", event.target.value)}
                        placeholder={providerDetails.clientIdPlaceholder}
                        autoComplete="off"
                        aria-invalid={Boolean(validation.getError("clientId"))}
                      />
                    </FormField>
                    <FormField
                      label={providerDetails.clientSecretLabel}
                      tone="themed"
                      description={
                        snapshot.settings.hasClientSecret
                          ? `Saved securely (${snapshot.settings.clientSecretHint ?? "secret available"}). Leave blank to keep it.`
                          : "Required for custom login."
                      }
                      error={validation.getError("clientSecret")}
                      errorId="oauth-client-secret-error"
                    >
                      <Input
                        type="password"
                        value={draft.clientSecret}
                        onChange={(event) => updateDraft("clientSecret", event.target.value)}
                        autoComplete="new-password"
                        placeholder={
                          snapshot.settings.hasClientSecret
                            ? "Keep saved secret"
                            : "Enter client secret"
                        }
                        aria-invalid={Boolean(validation.getError("clientSecret"))}
                      />
                    </FormField>
                  </div>

                  <FormField label="Callback URL" tone="themed">
                    <div className="flex gap-2">
                      <Input readOnly value={callbackUrl} className="font-mono text-xs" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        onClick={() => void copyCallbackUrl()}
                        title="Copy callback URL"
                        aria-label="Copy callback URL"
                      >
                        <CopyIcon />
                      </Button>
                    </div>
                  </FormField>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                <Button type="button" onClick={() => void save()} disabled={isSaving}>
                  <ButtonLabel icon={SaveIcon}>
                    {isSaving ? "Saving..." : `Save ${provider.label}`}
                  </ButtonLabel>
                </Button>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </IntegrationPanel>
  );
}
