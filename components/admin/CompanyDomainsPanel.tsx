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
  scope: "PLATFORM" | "COMPANY" | "RESTAURANT" | "LOCATION";
  purpose: "ADMIN" | "ORDERING" | "BOTH";
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
};

type CompanyDomainsResponse = {
  domains?: CompanyDomain[];
};

type CompanyDomainField = "domain" | "isPrimary" | "purpose";

function normalizeDomainInput(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

export function CompanyDomainsPanel({
  apiPath,
  backHref,
  companyName,
  domains: initialDomains,
}: CompanyDomainsPanelProps) {
  const [domains, setDomains] = useState(initialDomains);
  const [domain, setDomain] = useState("");
  const [purpose, setPurpose] = useState<"ORDERING" | "BOTH">("ORDERING");
  const [isPrimary, setIsPrimary] = useState(false);
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
          purpose,
          isPrimary,
          isActive: true,
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
    setPurpose("ORDERING");
    setIsPrimary(false);
    validation.clearErrors();
    setIsSubmitting(false);
    toast.success("Domain linked.");
  }

  async function updateDomain(
    domainRecord: CompanyDomain,
    input: Partial<Pick<CompanyDomain, "isActive" | "isPrimary" | "purpose">>,
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
            Link a custom domain to {companyName}. Add the same domain in Vercel and point DNS there.
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

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
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
                label="Purpose"
                error={validation.getError("purpose")}
                errorId="company-domain-purpose-error"
              >
                <Select
                  value={purpose}
                  onValueChange={(nextPurpose) => {
                    validation.clearFieldError("purpose");
                    setPurpose(nextPurpose as "ORDERING" | "BOTH");
                  }}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORDERING">Ordering only</SelectItem>
                    <SelectItem value="BOTH">Admin and ordering</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
              <Checkbox
                checked={isPrimary}
                onCheckedChange={(checked) => {
                  validation.clearFieldError("isPrimary");
                  setIsPrimary(checked === true);
                }}
              />
              Make this the primary company domain
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
            These domains can resolve {companyName} once Vercel and DNS are configured.
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
                  <StatusPill>
                    {domainRecord.purpose.toLowerCase()}
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
                <Select
                  value={domainRecord.purpose}
                  disabled={pendingDomainId === domainRecord.id}
                  onValueChange={(nextPurpose) =>
                    updateDomain(domainRecord, {
                      purpose: nextPurpose as CompanyDomain["purpose"],
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-[190px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORDERING">Ordering only</SelectItem>
                    <SelectItem value="BOTH">Admin and ordering</SelectItem>
                  </SelectContent>
                </Select>
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
