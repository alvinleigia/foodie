"use client";

import { useState } from "react";
import {
  BanIcon,
  CheckIcon,
  GitBranchIcon,
  RotateCcwIcon,
  SaveIcon,
  Settings2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Spinner } from "@/components/shared/Spinner";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, requestJson } from "@/lib/api-client";
import type {
  FeatureEntitlement,
  FeatureKey,
  FeatureOverrideMode,
} from "@/lib/feature-entitlements";
import { cn } from "@/lib/utils";

type FeatureScope = {
  id: string;
  name: string;
  type: "COMPANY" | "RESTAURANT";
};

type FeatureDraft = {
  expiresAt: string;
  mode: FeatureOverrideMode;
  reason: string;
};

type EntitlementsResponse = {
  entitlements: FeatureEntitlement[];
};

type CompanyFeatureEntitlementsFormProps = {
  apiPath: string;
  initialEntitlements: FeatureEntitlement[];
  scopes: FeatureScope[];
};

const modeOptions: Array<{
  icon: typeof GitBranchIcon;
  label: string;
  value: FeatureOverrideMode;
}> = [
  { icon: GitBranchIcon, label: "Inherit", value: "INHERIT" },
  { icon: CheckIcon, label: "Enabled", value: "ENABLED" },
  { icon: BanIcon, label: "Disabled", value: "DISABLED" },
];

const sourceLabels: Record<FeatureEntitlement["source"], string> = {
  COMPANY_OVERRIDE: "Company override",
  DEFAULT: "Catalogue default",
  PLAN: "Plan",
  RESTAURANT_OVERRIDE: "Restaurant override",
};

function toLocalDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function createDrafts(entitlements: FeatureEntitlement[]) {
  return Object.fromEntries(
    entitlements.map((entitlement) => [
      entitlement.key,
      {
        expiresAt: toLocalDateTime(entitlement.override?.expiresAt ?? null),
        mode: entitlement.override
          ? entitlement.override.enabled
            ? "ENABLED"
            : "DISABLED"
          : "INHERIT",
        reason: entitlement.override?.reason ?? "",
      } satisfies FeatureDraft,
    ]),
  ) as Record<FeatureKey, FeatureDraft>;
}

export function CompanyFeatureEntitlementsForm({
  apiPath,
  initialEntitlements,
  scopes,
}: CompanyFeatureEntitlementsFormProps) {
  const initialScope = scopes[0];
  const [selectedScopeId, setSelectedScopeId] = useState(initialScope?.id ?? "");
  const [entitlements, setEntitlements] = useState(initialEntitlements);
  const [drafts, setDrafts] = useState(() => createDrafts(initialEntitlements));
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectedScope = scopes.find((scope) => scope.id === selectedScopeId);

  function updateDraft(featureKey: FeatureKey, update: Partial<FeatureDraft>) {
    setDrafts((current) => ({
      ...current,
      [featureKey]: {
        ...current[featureKey],
        ...update,
      },
    }));
    setIsDirty(true);
  }

  function resetDrafts() {
    setDrafts(createDrafts(entitlements));
    setIsDirty(false);
  }

  async function changeScope(nextScopeId: string) {
    const previousScopeId = selectedScopeId;
    setSelectedScopeId(nextScopeId);
    setIsLoading(true);

    try {
      const payload = await fetchJson<EntitlementsResponse>(
        `${apiPath}?organizationId=${encodeURIComponent(nextScopeId)}`,
        { fallbackError: "Feature settings could not be loaded." },
      );
      setEntitlements(payload.entitlements);
      setDrafts(createDrafts(payload.entitlements));
      setIsDirty(false);
    } catch (error) {
      setSelectedScopeId(previousScopeId);
      toast.error(
        error instanceof Error
          ? error.message
          : "Feature settings could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function save() {
    const missingReason = entitlements.find((entitlement) => {
      const draft = drafts[entitlement.key];
      return draft.mode !== "INHERIT" && !draft.reason.trim();
    });

    if (missingReason) {
      toast.error(`Add a reason for ${missingReason.name}.`);
      return;
    }

    setIsSaving(true);

    try {
      const payload = await requestJson<EntitlementsResponse>(apiPath, {
        body: {
          organizationId: selectedScopeId,
          updates: entitlements.map((entitlement) => {
            const draft = drafts[entitlement.key];

            return {
              expiresAt: draft.expiresAt
                ? new Date(draft.expiresAt).toISOString()
                : null,
              featureKey: entitlement.key,
              mode: draft.mode,
              reason: draft.mode === "INHERIT" ? null : draft.reason.trim(),
            };
          }),
        },
        fallbackError: "Feature settings could not be saved.",
        method: "PATCH",
      });
      setEntitlements(payload.entitlements);
      setDrafts(createDrafts(payload.entitlements));
      setIsDirty(false);
      toast.success("Feature settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Feature settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-center gap-2">
          <Settings2Icon className="size-5 text-stone-700" />
          <h3 className="text-2xl font-semibold text-stone-950">
            Feature access
          </h3>
        </div>
        <p className="text-sm text-stone-500">
          Manage plan exceptions for the company or one restaurant.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 pb-5">
        <FormField
          label="Feature scope"
          description={
            isDirty ? "Save or reset changes before changing scope." : undefined
          }
        >
          <Select
            value={selectedScopeId}
            disabled={isDirty || isLoading || isSaving}
            onValueChange={(value) => void changeScope(value)}
          >
            <SelectTrigger className="max-w-xl bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => (
                <SelectItem key={scope.id} value={scope.id}>
                  {scope.name} - {scope.type === "COMPANY" ? "Company" : "Restaurant"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-stone-500">
            <Spinner />
          </div>
        ) : (
          <div className="border-y border-stone-200">
            {entitlements.map((entitlement) => {
              const draft = drafts[entitlement.key];
              const hasOverride = draft.mode !== "INHERIT";

              return (
                <div
                  key={entitlement.key}
                  className="grid gap-4 border-b border-stone-200 py-5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1.25fr)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-stone-950">
                        {entitlement.name}
                      </h4>
                      <StatusPill tone={entitlement.enabled ? "success" : "neutral"}>
                        {entitlement.enabled ? "Enabled" : "Disabled"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {entitlement.description}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase text-stone-400">
                      Effective from {sourceLabels[entitlement.source]}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div
                      className="grid grid-cols-3 gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1"
                      role="radiogroup"
                      aria-label={`${entitlement.name} access`}
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
                            onClick={() =>
                              updateDraft(entitlement.key, { mode: option.value })
                            }
                            className={cn(
                              "flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors sm:text-sm",
                              isSelected
                                ? "bg-stone-950 text-white"
                                : "text-stone-600 hover:bg-white hover:text-stone-950",
                            )}
                          >
                            <Icon className="size-4" />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    {hasOverride ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Reason">
                          <Input
                            value={draft.reason}
                            maxLength={500}
                            placeholder="Trial, support or contract exception"
                            onChange={(event) =>
                              updateDraft(entitlement.key, {
                                reason: event.target.value,
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Expires (optional)">
                          <Input
                            type="datetime-local"
                            value={draft.expiresAt}
                            onChange={(event) =>
                              updateDraft(entitlement.key, {
                                expiresAt: event.target.value,
                              })
                            }
                          />
                        </FormField>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={resetDrafts}
          >
            <ButtonLabel icon={RotateCcwIcon}>Reset</ButtonLabel>
          </Button>
          <Button
            type="button"
            disabled={!isDirty || isSaving || !selectedScope}
            onClick={() => void save()}
            className="bg-stone-950 text-white hover:bg-stone-800"
          >
            <ButtonLabel icon={SaveIcon}>
              {isSaving ? "Saving..." : "Save feature access"}
            </ButtonLabel>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
