"use client";

import { useMemo, useState } from "react";
import {
  BanIcon,
  CheckCircle2Icon,
  CopyIcon,
  GitBranchIcon,
  KeyRoundIcon,
  SaveIcon,
  Settings2Icon,
} from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

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
  label: string;
  provider: SocialAuthProvider;
}> = [
  {
    provider: "GOOGLE",
    label: "Google",
    clientIdLabel: "Client ID",
    clientIdPlaceholder: "123456789.apps.googleusercontent.com",
    clientSecretLabel: "Client secret",
  },
  {
    provider: "APPLE",
    label: "Apple",
    clientIdLabel: "Services ID",
    clientIdPlaceholder: "com.example.web",
    clientSecretLabel: "Generated client secret",
  },
  {
    provider: "FACEBOOK",
    label: "Facebook",
    clientIdLabel: "App ID",
    clientIdPlaceholder: "123456789",
    clientSecretLabel: "App secret",
  },
];

const modeOptions: Array<{
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  { icon: GitBranchIcon, label: "Inherit", value: "INHERIT" },
  { icon: Settings2Icon, label: "Custom", value: "CUSTOM" },
  { icon: BanIcon, label: "Disabled", value: "DISABLED" },
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
      <div className="flex items-start gap-3 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <p className="text-sm font-semibold text-emerald-950">
          Active via {snapshot.effective.sourceOrganizationName}
        </p>
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
        {isDisabled ? "Customer login is disabled" : "Customer login needs attention"}
      </p>
      {!isDisabled ? (
        <p className="mt-1 text-sm">
          {snapshot.effective.reason === "INCOMPLETE"
            ? "Complete the selected custom credentials."
            : "No inherited or universal credentials are available."}
        </p>
      ) : null}
    </div>
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
  const callbackUrl = `${callbackOrigin}/api/auth/callback/${selectedProvider.toLowerCase()}`;
  const inheritLabel = snapshot.parent
    ? `Inherit from ${snapshot.parent.name}`
    : "Use Foodie default";

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
    <div className="grid gap-6 border-t border-stone-200 pt-8">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="size-5 text-stone-700" />
        <h2 className="text-xl font-semibold text-stone-950">Customer social login</h2>
      </div>

      <Tabs
        value={selectedProvider}
        onValueChange={(value) => {
          validation.clearErrors();
          setSelectedProvider(value as SocialAuthProvider);
        }}
      >
        <TabsList aria-label="Social login provider">
          {providers.map((provider) => (
            <TabsTrigger key={provider.provider} value={provider.provider}>
              {provider.label}
              {dirtyProviders.has(provider.provider) ? " *" : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        {providers.map((provider) => (
          <TabsContent key={provider.provider} value={provider.provider}>
            <div className="grid gap-6">
              <EffectiveStatus snapshot={snapshots[provider.provider]} />

              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold text-stone-900">Login mode</legend>
                <div
                  className="grid gap-2 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label={`${provider.label} login mode`}
                >
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label={providerDetails.clientIdLabel}
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

                  <FormField label="Callback URL">
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

              <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
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
    </div>
  );
}
