"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PowerIcon,
  StarIcon,
} from "lucide-react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Spinner } from "@/components/shared/Spinner";
import { StatusPill } from "@/components/shared/StatusPill";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CompanyDomain = {
  id: string;
  domain: string;
  scope: "COMPANY" | "RESTAURANT";
  purpose: "ADMIN" | "ORDERING" | "BOTH";
  restaurantOrganizationId: string | null;
  restaurantName: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyDomainsPanelProps = {
  apiPath: string;
  backHref: string;
  companyName: string;
  domains: CompanyDomain[];
  restaurants: Array<{ id: string; name: string }>;
};

type CompanyDomainsResponse = {
  domains?: CompanyDomain[];
};

type CompanyDomainField = "domain" | "isPrimary" | "restaurantOrganizationId";

const companyDomainTarget = "COMPANY";

function normalizeDomainInput(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

export function CompanyDomainsPanel({
  apiPath,
  backHref,
  companyName,
  domains: initialDomains,
  restaurants,
}: CompanyDomainsPanelProps) {
  const [domains, setDomains] = useState(initialDomains);
  const [domain, setDomain] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [target, setTarget] = useState(companyDomainTarget);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDomainId, setPendingDomainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation<CompanyDomainField>();

  async function addDomain() {
    setIsSubmitting(true);
    setError(null);
    validation.clearErrors();

    let payload: CompanyDomainsResponse;

    try {
      payload = await requestJson(apiPath, {
        body: {
          domain: normalizeDomainInput(domain),
          isPrimary,
          isActive: true,
          restaurantOrganizationId: target === companyDomainTarget ? null : target,
        },
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to add domain.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    setDomains(payload.domains ?? []);
    setDomain("");
    setIsPrimary(false);
    setTarget(companyDomainTarget);
    validation.clearErrors();
    setIsSubmitting(false);
    toast.success("Domain linked.");
  }

  async function updateDomain(
    domainRecord: CompanyDomain,
    input: Partial<Pick<CompanyDomain, "isActive" | "isPrimary">>,
  ) {
    setPendingDomainId(domainRecord.id);
    setError(null);

    let payload: CompanyDomainsResponse;

    try {
      payload = await requestJson(`${apiPath}/${domainRecord.id}`, {
        body: input,
        method: "PATCH",
      });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
      setPendingDomainId(null);
      return;
    }

    setDomains(payload.domains ?? []);
    setPendingDomainId(null);
    toast.success("Domain updated.");
  }

  return (
    <div className="grid gap-6">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-2xl font-semibold text-stone-950">Add domain</h3>
          <p className="text-sm text-stone-500">
            Link a customer-facing ordering domain to {companyName} or directly to one restaurant. Staff and administration stay on the Foodie platform domain.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void addDomain();
            }}
          >
            {validation.formError ? (
              <p className="text-sm text-rose-600">{validation.formError}</p>
            ) : null}

            <FormField
              label="Domain"
              htmlFor="company-domain"
              error={validation.getError("domain")}
              errorId="company-domain-error"
            >
              <Input
                id="company-domain"
                value={domain}
                aria-describedby={
                  validation.getError("domain")
                    ? "company-domain-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("domain"))}
                onChange={(event) => {
                  validation.clearFieldError("domain");
                  setDomain(event.target.value);
                }}
                placeholder="foodie.allgoonline.co.uk"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              label="Domain routes to"
              error={validation.getError("restaurantOrganizationId")}
              errorId="company-domain-target-error"
            >
              <Select
                value={target}
                onValueChange={(value) => {
                  validation.clearFieldError("restaurantOrganizationId");
                  setTarget(value);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={companyDomainTarget}>
                    {companyName} restaurant directory
                  </SelectItem>
                  {restaurants.map((restaurant) => (
                    <SelectItem key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
              <Checkbox
                checked={isPrimary}
                onCheckedChange={(checked) => {
                  validation.clearFieldError("isPrimary");
                  setIsPrimary(checked === true);
                }}
              />
              Make this the primary domain for the selected target
            </label>
            {validation.getError("isPrimary") ? (
              <p className="text-sm text-rose-600">
                {validation.getError("isPrimary")}
              </p>
            ) : null}

            <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              <p className="font-semibold text-stone-950">DNS reminder</p>
              <p className="mt-1">
                In Vercel, add this domain to the Foodie project. Then create the DNS CNAME record
                your Vercel dashboard shows. This page stores the tenant mapping inside Foodie.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    Adding...
                  </span>
                ) : (
                  <ButtonLabel icon={GlobeIcon}>Add Domain</ButtonLabel>
                )}
              </Button>
              <Button asChild type="button" variant="outline" className="rounded-lg">
                <Link href={backHref}>
                  <ButtonLabel icon={ArrowLeftIcon}>Back</ButtonLabel>
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-2xl font-semibold text-stone-950">Linked domains</h3>
          <p className="text-sm text-stone-500">
            These domains serve {companyName} customer ordering and account views once Vercel and DNS are configured.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {domains.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No domains linked yet.
            </p>
          ) : null}

          {domains.map((domainRecord) => (
            <div
              key={domainRecord.id}
              className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 lg:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-stone-950">{domainRecord.domain}</p>
                  {domainRecord.isActive && domainRecord.isPrimary ? (
                    <StatusPill tone="success">Primary</StatusPill>
                  ) : null}
                  <StatusPill tone={domainRecord.isActive ? "success" : "warning"}>
                    {domainRecord.isActive ? "Active" : "Disabled"}
                  </StatusPill>
                  <StatusPill>Customer ordering</StatusPill>
                  <StatusPill tone="neutral">
                    {domainRecord.scope === "RESTAURANT"
                      ? domainRecord.restaurantName ?? "Restaurant"
                      : `${companyName} directory`}
                  </StatusPill>
                </div>
                {domainRecord.isActive ? (
                  <a
                    href={`https://${domainRecord.domain}/order`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-stone-950"
                  >
                    Open ordering domain
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">
                    Disabled in Foodie. DNS may still resolve, but tenant access is blocked.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    pendingDomainId === domainRecord.id ||
                    domainRecord.isPrimary ||
                    !domainRecord.isActive
                  }
                  onClick={() => updateDomain(domainRecord, { isPrimary: true })}
                  className="rounded-lg"
                >
                  <ButtonLabel icon={StarIcon}>Make Primary</ButtonLabel>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingDomainId === domainRecord.id}
                  onClick={() =>
                    updateDomain(domainRecord, { isActive: !domainRecord.isActive })
                  }
                  className={
                    domainRecord.isActive
                      ? "rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      : "rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }
                >
                  {pendingDomainId === domainRecord.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      Saving...
                    </span>
                ) : (
                  <ButtonLabel icon={PowerIcon}>
                    {domainRecord.isActive ? "Disable" : "Enable"}
                  </ButtonLabel>
                )}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
