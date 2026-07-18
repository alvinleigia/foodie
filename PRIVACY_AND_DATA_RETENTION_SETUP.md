# Privacy And Data Retention Setup

Status: **Draft for UAT. Not approved for public launch.**

The application now provides a tenant-aware `/privacy` page and links to it from
customer sign-in, profile, checkout, account and order views. Missing legal or
retention values are deliberately shown as:

```text
[REPLACE BEFORE PUBLIC LAUNCH: ...]
```

Do not remove the draft warning until every placeholder has been replaced and
the notice has been reviewed by the appropriate privacy/legal owner.

## Values To Configure

Add these server-side variables to the relevant Vercel project. Set them for
both Preview and Production where those environments are used, then redeploy.

| Variable | Replace with |
| --- | --- |
| `PRIVACY_NOTICE_EFFECTIVE_DATE` | Approved notice date, for example `18 July 2026` |
| `PRIVACY_PLATFORM_LEGAL_NAME` | Legal entity operating Foodie |
| `PRIVACY_PLATFORM_ADDRESS` | Platform operator's registered office |
| `PRIVACY_PLATFORM_EMAIL` | Monitored platform privacy email |
| `PRIVACY_PLATFORM_ICO_NUMBER` | ICO registration number, or approved wording if not applicable |
| `PRIVACY_CONTROLLER_LEGAL_NAME` | Legal entity operating the restaurant/company |
| `PRIVACY_CONTROLLER_ADDRESS` | Restaurant/company business address |
| `PRIVACY_CONTROLLER_EMAIL` | Monitored restaurant/company privacy email |
| `PRIVACY_INTERNATIONAL_TRANSFERS` | Approved countries, providers and transfer safeguards |
| `PRIVACY_RETENTION_PROFILE` | Approved customer profile retention period |
| `PRIVACY_RETENTION_AUTH` | Approved OTP/authentication record retention period |
| `PRIVACY_RETENTION_ORDERS` | Approved order, payment and refund retention period |
| `PRIVACY_RETENTION_SECURITY` | Approved security and audit record retention period |
| `PRIVACY_RETENTION_MARKETING` | Approved consent and suppression record retention period |

These values are public notice text. Do not put secrets, API keys or private
credentials in them.

## Important Multi-Tenant Limitation

`PRIVACY_CONTROLLER_*` is currently a deployment-wide UAT fallback. It is safe
only while all restaurants in that deployment use the same legal controller,
or while the page remains visibly marked as a draft.

Before unrelated companies are publicly launched, implement Phase B:

1. Store legal name, address and privacy contact on each company.
2. Let its restaurants inherit those details.
3. Allow an explicit restaurant override where it is a separate controller.
4. Record who changed the values and when.
5. Render the tenant-specific values instead of the deployment fallback.

## Retention Decisions

The application intentionally does not invent retention periods. The privacy
owner must agree each period with accounting, tax, dispute, security and local
legal requirements. For every category, document:

- the business or legal reason for retaining it;
- the retention period and when the clock starts;
- whether the record is deleted or anonymised at expiry;
- any litigation, chargeback or regulatory hold exception;
- how long expired data can remain in backups.

Review the schedule at least annually and whenever a provider, country or
business process changes.

## Customer Access Request Procedure

Until an automated request portal is built, follow this manual procedure.

1. Receive the request at the controller privacy email and record its date.
2. Record the request type: access, correction, deletion, restriction,
   portability, objection or marketing withdrawal.
3. Identify the correct company and restaurant before searching for data.
4. Verify the requester using proportionate evidence, normally control of the
   account email through the existing sign-in flow. Do not request excessive ID.
5. Search the tenant-scoped customer profile, linked orders, payment/refund
   references, marketing choice and applicable audit/security records.
6. Check whether any information must be retained for tax, accounting,
   chargeback, fraud, dispute or other legal reasons.
7. Export eligible information in a commonly readable format for access or
   portability requests.
8. Correct, delete or anonymise eligible information. Do not blindly delete
   required financial records or records held independently by Stripe.
9. Respond without undue delay and normally within one calendar month. If an
   extension is legally available, notify the requester within the first month.
10. Record the decision, action, response date and person who approved it.

Never send one restaurant's data to another restaurant or expose platform-wide
search results to a tenant user.

## Deletion And Anonymisation Rules

- Remove or anonymise customer identifiers only after checking retention holds.
- Preserve the minimum financial record required by law, with access restricted.
- Process deletion with relevant service providers where the controller is
  responsible for doing so.
- Keep marketing suppression evidence when necessary to honour an opt-out.
- Let backup copies expire through the documented backup lifecycle rather than
  editing backups manually.
- Record the outcome in an audit trail without retaining the deleted content.

## UAT Checks

1. Open `/privacy` on the platform domain.
2. Open it from a restaurant route and a QR ordering route.
3. Confirm the correct restaurant/company name is displayed.
4. Confirm route or QR context remains present in all privacy links.
5. Confirm every customer data-entry screen links to the notice.
6. Confirm missing values show the draft banner and bracketed placeholders.
7. Configure all variables in a test environment and confirm the draft banner
   disappears only when no placeholder remains.
8. Test the manual access procedure with two restaurants and verify isolation.

## Phase B Work

- Company-level legal/privacy settings with restaurant inheritance and override.
- A tracked privacy-request record with deadlines and status.
- Tenant-scoped customer data export.
- Reviewed deletion/anonymisation tooling with audit logs.
- Automated retention jobs and documented backup expiry.

Useful UK ICO references:

- [Privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/transparency-and-privacy-information/)
- [Right of access guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/)
- [Storage limitation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/principle-a-lawfulness-fairness-and-transparency/principle-e-storage-limitation/)
