import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  MailIcon,
} from "lucide-react";

import { SectionHeader } from "@/components/shared/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PrivacyNoticeConfiguration } from "@/lib/privacy-notice";

type PrivacyNoticeProps = {
  notice: PrivacyNoticeConfiguration;
};

function EmailContact({ value }: { value: string }) {
  const isConfiguredEmail = value.includes("@") && !value.startsWith("[REPLACE");

  return isConfiguredEmail ? (
    <a
      href={`mailto:${value}`}
      className="font-medium text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700"
    >
      {value}
    </a>
  ) : (
    <span className="font-medium text-amber-800">{value}</span>
  );
}

const sectionClassName = "border-t border-stone-200 pt-6";

export function PrivacyNotice({ notice }: PrivacyNoticeProps) {
  const orderingBusiness = notice.restaurantName
    ? `${notice.restaurantName}, operated by ${notice.controller.displayName}`
    : notice.controller.displayName;

  return (
    <Card className="rounded-xl border-white/60 bg-white/95">
      <CardHeader className="px-6 pt-6 sm:px-8 sm:pt-8">
        <SectionHeader
          eyebrow="Data protection"
          title="Privacy notice"
          description={`How ${orderingBusiness} and Foodie handle customer information.`}
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="grid gap-6 px-6 pb-8 text-sm leading-6 text-stone-700 sm:px-8">
        {notice.isDraft ? (
          <div
            role="status"
            className="flex gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950"
          >
            <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Draft notice for UAT</p>
              <p className="mt-1">
                Replace every bracketed placeholder and obtain legal approval before
                public launch.
              </p>
            </div>
          </div>
        ) : null}

        <p>
          <span className="font-semibold text-stone-950">Effective date:</span>{" "}
          {notice.effectiveDate}
        </p>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            Who is responsible for your information
          </h2>
          <p className="mt-3">
            The ordering business normally decides why and how customer, profile and
            order information is used. It is therefore normally the data controller for
            that information. Foodie provides the ordering platform and generally acts
            on the ordering business&apos;s instructions. The Foodie platform operator may
            also act as a controller where it uses information for platform security,
            administration or legal compliance.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="font-medium text-stone-950">Ordering business</dt>
            <dd>{notice.controller.displayName}</dd>
            <dt className="font-medium text-stone-950">Controller legal name</dt>
            <dd>{notice.controller.legalName}</dd>
            <dt className="font-medium text-stone-950">Controller address</dt>
            <dd>{notice.controller.address}</dd>
            <dt className="font-medium text-stone-950">Controller contact</dt>
            <dd>
              <EmailContact value={notice.controller.email} />
            </dd>
          </dl>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            Information we use
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Name, email address and phone number.</li>
            <li>Optional profile details such as birthday and gender.</li>
            <li>Order contents, notes, status, cancellation and refund records.</li>
            <li>
              Payment status and provider references. Complete card details are handled
              by Stripe Checkout and are not stored by Foodie.
            </li>
            <li>
              Sign-in, session, security and technical information needed to operate and
              protect the service.
            </li>
            <li>Your marketing choice and any later opt-out.</li>
          </ul>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            Why we use it
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>To authenticate you, accept, prepare and fulfil your order.</li>
            <li>To take payment and manage cancellations, refunds and support.</li>
            <li>To keep the service secure, reliable and auditable.</li>
            <li>To meet accounting, tax and other legal obligations.</li>
            <li>To send marketing only where the required permission exists.</li>
          </ul>
          <p className="mt-3">
            Depending on the activity, the lawful basis will normally be performance of
            a contract, legitimate interests, compliance with a legal obligation, or
            consent for optional marketing. The controller must confirm this allocation
            before the notice is approved.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            Who receives it
          </h2>
          <p className="mt-3">
            Information is available to authorised staff of the ordering business and
            to service providers only where needed to provide the service. Depending on
            the features used, these providers may include Foodie, Stripe, SMTP2GO,
            Google, Apple, Facebook, Vercel, Supabase and other providers configured by
            the ordering business. Information may also be disclosed where law requires
            it or to establish, exercise or defend legal claims.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            International transfers
          </h2>
          <p className="mt-3">{notice.internationalTransfers}</p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">
            How long we keep information
          </h2>
          <p className="mt-3">
            Information should be kept only for as long as it is needed for the purpose
            described above, including legal, accounting, dispute and security needs.
            The draft schedule is:
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-300 text-stone-950">
                  <th className="py-2 pr-4 font-semibold">Record</th>
                  <th className="py-2 font-semibold">Retention period</th>
                </tr>
              </thead>
              <tbody>
                {notice.retention.map((entry) => (
                  <tr key={entry.category} className="border-b border-stone-200 align-top">
                    <td className="py-3 pr-4 font-medium text-stone-900">
                      {entry.category}
                    </td>
                    <td className="py-3">{entry.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">Your rights</h2>
          <p className="mt-3">
            Subject to applicable law, you may ask for access to your information,
            correction, deletion, restriction, portability, or object to certain uses.
            You can withdraw marketing consent at any time without affecting earlier
            lawful use. Contact the ordering business first so it can identify the
            correct restaurant-scoped record.
          </p>
          <p className="mt-3">
            If you remain unhappy, you may complain to the UK Information
            Commissioner&apos;s Office.
          </p>
          <a
            href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 font-medium text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700"
          >
            ICO complaint guidance
            <ExternalLinkIcon className="size-4" />
          </a>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold text-stone-950">Contact Foodie</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="font-medium text-stone-950">Platform operator</dt>
            <dd>{notice.platform.legalName}</dd>
            <dt className="font-medium text-stone-950">Registered address</dt>
            <dd>{notice.platform.address}</dd>
            <dt className="font-medium text-stone-950">Privacy email</dt>
            <dd className="inline-flex items-center gap-2">
              <MailIcon className="size-4 shrink-0" />
              <EmailContact value={notice.platform.email} />
            </dd>
            <dt className="font-medium text-stone-950">ICO registration</dt>
            <dd>{notice.platform.icoRegistrationNumber}</dd>
          </dl>
        </section>
      </CardContent>
    </Card>
  );
}
