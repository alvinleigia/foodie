# Foodie Required UAT Testing Guide

Document date: 18 July 2026

Audience: Non-technical UAT testers and the UAT coordinator

Environment: Staging only unless the UAT coordinator explicitly states otherwise

## Purpose

This guide checks the minimum journeys that must work before Foodie can go live.

Every required test must be marked `PASS`. A payment mismatch, data leak, access by a disabled user, failed restore, or missing release evidence is a launch blocker.

## Safety Rules

- Use the staging environment and Stripe sandbox only.
- Never enter a real card number. Use the Stripe test card in this guide.
- Do not use real customer personal information.
- Do not change Vercel, Stripe, Supabase, DNS, OAuth, or email settings unless you are the UAT coordinator.
- Do not restore a backup over staging or production. Restores must use a temporary isolated database.
- Do not include passwords, OTP codes, card details, or secret keys in screenshots.
- Stop immediately if one restaurant can see another restaurant's information.

## Result Meanings

| Result | Meaning |
| --- | --- |
| PASS | The actual result exactly matches the expected result. |
| FAIL | The result is wrong, incomplete, insecure, or inconsistent. |
| BLOCKED | The test could not be completed because setup, access, or test data was missing. |

`BLOCKED` is not the same as `PASS`.

## Test Setup Sheet

The UAT coordinator must complete this section before testing starts. Credentials should be shared through a password manager, not written in this file.

| Item | UAT value |
| --- | --- |
| Staging platform URL | `https://foodie-staging.leigia.com` |
| White-label customer URL | |
| Restaurant A name and slug | |
| Restaurant A manager | |
| Restaurant B name and slug | |
| Restaurant B manager | |
| Company owner account | |
| Gmail customer account | |
| Outlook customer account | |
| Expected staging Git SHA | |
| UAT coordinator | |
| Defect tracker URL | |

## Evidence Required

For every test, record:

- Test ID and result.
- Tester name, date, time, and timezone.
- Restaurant and account used.
- Screenshot of the final result.
- Order number for order tests.
- Stripe payment, refund, session, and event IDs when requested.
- Defect number for every `FAIL` or `BLOCKED` result.

## Gate 1: Paid Checkout, Cancellation, Refund And Webhooks

### Payment Test Details

Use only while Stripe shows `Test mode` or `Sandbox`.

| Field | Test value |
| --- | --- |
| Card number | `4242 4242 4242 4242` |
| Expiry | Any future date, for example `12/34` |
| CVC | Any three digits, for example `123` |
| Name and address | Test information |

### PAY-01: Successful Paid Order

1. Open the white-label customer URL in a private or incognito window.
2. Sign in as the nominated customer.
3. Add one clearly priced item to the cart.
4. Record the item name, quantity, currency, and total.
5. Continue to the review screen.
6. Select `Proceed to Payment`.
7. Complete Stripe Checkout with the test card above.
8. Wait for the Foodie payment confirmation page.
9. Record the Foodie order number.
10. Open the customer's active orders screen.

Expected result:

- Stripe Checkout opens without an error.
- The charged currency and amount exactly match the Foodie total.
- Foodie shows `Payment confirmed` once.
- One order is created, with no duplicate order.
- The paid order appears under active orders.
- Restaurant staff can see the same order.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### PAY-02: Declined Payment

Use Stripe test card `4000 0000 0000 0002` with any future expiry and any three-digit CVC.

1. Create a new cart and continue to Stripe Checkout.
2. Enter the declined test card.
3. Return to Foodie after Stripe reports the decline.
4. Check the restaurant orders panel.

Expected result:

- The customer is clearly told that payment failed.
- No paid or fulfilment-ready order is released to the restaurant.
- The customer can safely try payment again.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### PAY-03: Full Cancellation And Refund

1. Place a new successful paid test order.
2. Cancel the order while cancellation is allowed.
3. If customer cancellation is unavailable, ask authorized staff to cancel it.
4. Record the cancellation reason.
5. Wait for the final refund result.
6. Ask the coordinator to compare Foodie with the Stripe sandbox payment.

Expected result:

- The order changes to cancelled.
- The full paid amount is refunded when no cancellation charge applies.
- Stripe and Foodie show the same refund amount and currency.
- The order is not shown as active after cancellation completes.
- Repeating the cancel action does not create another refund.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### PAY-04: Cancellation Charge And Partial Refund

Coordinator preparation: configure a known test cancellation charge. A simple example is 10 percent on a GBP 10.00 order.

1. Place a new paid order that makes the calculation easy to check.
2. Cancel the order through the approved customer or staff flow.
3. Review the cancellation charge before confirming it.
4. Wait for the final refund result.
5. Ask the coordinator to compare Foodie with Stripe.

Expected result for the example:

- Paid amount: GBP 10.00.
- Cancellation charge retained: GBP 1.00.
- Refund: GBP 9.00.
- Foodie and Stripe show the same values.
- Only one refund exists.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### PAY-05: Duplicate Webhooks

Coordinator-assisted test. The tester must not edit the Stripe destination.

1. The coordinator opens the successful `checkout.session.completed` event in Stripe Workbench.
2. The coordinator resends the same event at least twice.
3. Refresh the Foodie order and restaurant orders panel after each resend.
4. Repeat the resend check with the refund event from PAY-03.

Expected result:

- Stripe may show several delivery attempts.
- Foodie still has one order, one payment, and one refund.
- Order totals and inventory are not changed again.
- Every webhook attempt returns a successful response after processing.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### PAY-06: Delayed Or Out-Of-Order Webhooks

Coordinator-assisted test. Run this only after webhook event de-duplication and final-state protection have been confirmed as deployed.

1. Complete a paid order and refund so the final Foodie status is refunded.
2. The coordinator resends an older pending or earlier refund event after the successful refund event.
3. Refresh the Foodie order, customer orders, and restaurant orders panel.

Expected result:

- A completed refund never moves backwards to pending or failed.
- The order remains cancelled and refunded.
- No second refund or duplicate order is created.
- Foodie and Stripe remain financially consistent.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Gate 2: Disabled Staff And Password-Reset Session Revocation

Use two separate browsers or two different devices.

### SEC-01: Disable An Active Staff Member

1. In Browser A, sign in as the Restaurant A manager.
2. Open the restaurant orders panel and confirm it works.
3. Keep Browser A signed in.
4. In Browser B, sign in as an authorized company owner or administrator.
5. Disable the Restaurant A manager's membership.
6. Return to Browser A and refresh the page.
7. In Browser A, try to open orders, menu manager, inventory, reports, and a saved protected URL.
8. Try to perform one harmless action, such as opening an order or menu item.

Expected result:

- Browser A loses access on its next request or refresh.
- The disabled user is redirected to sign-in or shown access denied.
- No protected restaurant data or action remains available.
- Waiting for the old session to expire is not required.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### SEC-02: Password Reset Revokes Existing Sessions

1. Re-enable the test manager and sign in again in Browser A.
2. Confirm the protected restaurant pages work.
3. Reset that manager's password using the approved reset flow.
4. Return to Browser A and refresh a protected page.
5. Sign out if the app has not already done so.
6. Try signing in with the old password.
7. Try signing in with the new password.

Expected result:

- The session that existed before the password reset stops working.
- The old password is rejected.
- The new password works.
- Restaurant and role context are correct after the new login.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Gate 3: Two-Restaurant Isolation

Coordinator preparation:

- Restaurant A manager must be assigned only to Restaurant A.
- Restaurant B manager must be assigned only to Restaurant B.
- Restaurant A must contain an obvious marker such as `UAT-A-ONLY`.
- Restaurant B must contain an obvious marker such as `UAT-B-ONLY`.
- Provide testers with direct protected URLs for both restaurants.

### ISO-01: Restaurant A Cannot Access Restaurant B

1. Sign in as the Restaurant A manager in a private window.
2. Confirm the URL contains Restaurant A's slug where restaurant context is required.
3. Review orders, menu, inventory, staff, customers, reports, audit logs, and integrations.
4. Confirm only Restaurant A information appears.
5. Paste a protected Restaurant B URL supplied by the coordinator.
6. Change Restaurant A's slug or restaurant ID in the address bar to Restaurant B's value.
7. Try Restaurant B direct links for orders, menu, inventory, reports, and integrations.

Expected result:

- Restaurant B data never appears.
- Unauthorized links show access denied, not found, or safely return to Restaurant A.
- Restaurant A cannot change Restaurant B data.
- Exports contain only Restaurant A data.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### ISO-02: Restaurant B Cannot Access Restaurant A

Repeat ISO-01 while signed in as the Restaurant B manager and attempt to access Restaurant A.

Expected result:

- Restaurant A data never appears.
- Restaurant B remains correctly selected throughout the session.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### ISO-03: Company Owner Access

1. Sign in as the company owner.
2. Open Restaurant A and Restaurant B through the official restaurant selection controls.
3. Confirm the selected restaurant name and slug change together.
4. Confirm the page content always matches the selected restaurant.

Expected result:

- The company owner can access both restaurants when authorized.
- Restaurant data is never mixed on one screen.
- Changing restaurant context changes the URL and displayed data together.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Gate 4: Email OTP And Google Login From A White-Label Host

### AUTH-01: First Email OTP Login

1. Open the white-label customer URL in a new private window.
2. Add an item to the cart.
3. Continue to the review or confirmation screen.
4. Choose email sign-in.
5. Enter the nominated Gmail address.
6. Request an OTP.
7. Enter one incorrect code once and confirm it is rejected.
8. Enter the latest correct code.
9. Complete the required profile information, including name and phone with country code.

Expected result:

- The OTP is sent without exposing whether unrelated accounts exist.
- An incorrect OTP is rejected.
- The correct OTP works only for the restaurant where it was requested.
- The customer returns to the same restaurant, cart, and checkout journey.
- Name and phone are required on first login.
- The email address is taken from the verified login and cannot be silently changed.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### AUTH-02: Returning Email OTP Login

1. Sign out.
2. Start again from the same white-label restaurant.
3. Request and enter a new OTP.

Expected result:

- The saved restaurant-specific profile is loaded.
- Completed required profile information is not requested again.
- Previous orders are visible only after sign-in.
- A previously used OTP cannot be reused.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### AUTH-03: Google Login

1. Sign out and open the white-label customer URL in a new private window.
2. Add a different item to the cart.
3. Continue to the login step and choose Google.
4. Complete Google login with the nominated test account.
5. Observe the domains shown during the redirect.
6. Complete name and phone if this is the first login for that restaurant.

Expected result:

- A brief redirect through the central Foodie authentication domain is acceptable.
- The final page returns to the original white-label restaurant domain.
- The selected restaurant and cart are preserved.
- The customer is not placed into another restaurant's account.
- The profile belongs to the restaurant where login began.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### AUTH-04: Same Customer At A Second Restaurant

1. Use the same email or Google account at Restaurant B's customer URL.
2. Complete Restaurant B profile information with a visibly different test name.
3. Sign out and return to Restaurant A.

Expected result:

- Restaurant A and Restaurant B profiles remain separate.
- Changing the Restaurant B profile does not change Restaurant A's profile.
- Orders from one restaurant do not appear at the other restaurant.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### AUTH-05: Sign-Out Privacy

1. While signed in, open active and completed customer orders.
2. Sign out.
3. Use the browser Back button.
4. Paste the customer orders URL directly.
5. Open the account menu.

Expected result:

- No order details are visible after sign-out.
- Protected pages require a new login.
- Customer-only account and order links are not shown to a signed-out visitor.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Gate 5: Gmail And Outlook OTP Delivery

Respect the OTP resend countdown. Do not repeatedly click the send button.

### MAIL-01: Gmail Delivery

1. Request three OTP emails to the nominated Gmail account.
2. Wait at least for the resend countdown between requests.
3. Record the request and arrival time for every email.
4. Record whether each email arrived in Inbox, Promotions, or Spam.
5. In Gmail, open each message and use `More` then `Show original`.
6. Record the SPF, DKIM, and DMARC results without recording the OTP.

Expected result:

- All three messages arrive.
- Messages arrive in Inbox, not Spam or Junk.
- Each message arrives within two minutes.
- SPF shows `PASS`.
- DKIM shows `PASS` for the configured sender domain.
- DMARC shows `PASS` before production launch.
- The sender name and domain are recognizable and consistent.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### MAIL-02: Outlook Delivery

1. Repeat MAIL-01 using the nominated Outlook account.
2. In Outlook, use the message menu to view message details or message source.
3. Record the SPF, DKIM, and DMARC results without recording the OTP.

Expected result:

- All three messages arrive in Inbox within two minutes.
- SPF, DKIM, and DMARC show `PASS`.
- The email is not flagged as suspicious or sent to Junk.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### MAIL-03: SMTP2GO Evidence

Coordinator-assisted test.

1. The coordinator opens SMTP2GO activity.
2. Match each Gmail and Outlook test message by recipient and time.
3. Confirm SMTP2GO reports successful delivery and no rejection.
4. Save screenshots with recipient addresses partially hidden.

Expected result:

- All six test messages can be traced in SMTP2GO.
- There are no failed, rejected, or suppressed deliveries.
- The verified sender domain matches the visible From domain.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Gate 6: Backup, Restore, Alerts And Deployment Proof

This entire gate is coordinator-assisted. Testers must not change infrastructure settings.

### OPS-01: Database Backup And Restore

1. The coordinator creates a known backup marker in staging and records its time.
2. The coordinator takes or selects a database backup.
3. The coordinator restores it into a new temporary Supabase project or isolated database.
4. The coordinator runs all migrations and the tenant verification command against the restored database.
5. The coordinator connects a temporary test deployment to the restored database.
6. A tester signs in to the temporary restored application.
7. Verify companies, restaurants, staff membership, menu, inventory, orders, payments, cancellations, and refunds.
8. Compare record counts and several known records with the source backup.
9. Record backup time, restore start, restore finish, data loss window, and total recovery time.
10. Delete the temporary restore only after evidence has been approved.

Expected result:

- The restore completes without modifying staging or production.
- The restored application starts and allows login.
- Required records and relationships are intact.
- The deployment cell and tenant verification pass.
- Recovery Point Objective and Recovery Time Objective are recorded.
- Any Supabase Storage files are tested separately because database backup alone does not restore stored objects.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### OPS-02: Webhook Failure Alert

1. The coordinator creates a controlled Stripe webhook failure in staging.
2. Confirm Stripe Workbench shows a failed or pending delivery.
3. Record when the failed delivery occurred.
4. Confirm the configured monitoring service sends an alert to the nominated person or channel.
5. Record when the alert arrived.
6. The coordinator restores normal webhook handling.
7. Resend the same Stripe event.
8. Confirm Stripe receives HTTP `200` and Foodie processes the event once.

Expected result:

- The alert identifies staging, the webhook endpoint, time, and error.
- The alert arrives within the agreed alert target, recommended within five minutes.
- Recovery and resend produce a successful delivery.
- No duplicate order, payment, cancellation, or refund is created.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

### OPS-03: Vercel Deployment SHA Verification

Run this immediately before UAT begins and again before production promotion.

1. The coordinator records the approved full Git commit SHA.
2. Open the matching Vercel project.
3. Open the active deployment for the staging domain.
4. Confirm the deployment status is `Ready`.
5. Under `Source`, compare the Vercel commit SHA with the approved Git SHA.
6. Confirm the deployment came from the expected branch.
7. Confirm the staging domain is attached to that exact deployment.
8. Record the Vercel deployment ID, Git SHA, branch, deployment time, and function region.

Expected result:

- The Vercel and Git SHAs match exactly.
- The expected branch and domain are shown.
- The deployment is `Ready` and runs in the approved region.
- The SHA tested by UAT is the same SHA selected for release.

Result: [ ] PASS [ ] FAIL [ ] BLOCKED

## Defect Priority

| Priority | Examples | Release rule |
| --- | --- | --- |
| Blocker | Cross-restaurant data leak, wrong charge/refund, access after disable, failed restore, wrong release SHA | Go-live prohibited |
| Major | Login cannot complete, paid order not released, OTP not delivered, restaurant context is wrong | Go-live prohibited |
| Minor | Visual alignment or wording issue with no security, data, payment, or workflow impact | Product owner decision |

## Final Sign-Off

| Gate | Result | Tester | Date | Evidence link | Defect IDs |
| --- | --- | --- | --- | --- | --- |
| 1. Payments and webhooks | | | | | |
| 2. Session revocation | | | | | |
| 3. Restaurant isolation | | | | | |
| 4. OTP and Google authentication | | | | | |
| 5. Gmail and Outlook delivery | | | | | |
| 6. Recovery, alerts and deployment | | | | | |

Final decision: [ ] GO [ ] NO-GO

UAT lead:

Product owner:

Approved release Git SHA:
Approval date and time:

## Go-Live Rule

Go live only when:

- Every required test is `PASS`.
- No Blocker or Major defect remains open.
- Payment and refund records match Stripe.
- The backup restore has been demonstrated, not merely assumed.
- The tested Git SHA exactly matches the release deployment.
- One final smoke test passes after the release deployment.

## Reference Links

- [Stripe test card guidance](https://docs.stripe.com/testing?numbers-or-method-or-token=tokens)
- [Stripe webhook retries, duplicates, and event ordering](https://docs.stripe.com/webhooks?lang=node&locale=en-GB)
- [SMTP2GO SPF, DKIM, and DMARC guidance](https://support.smtp2go.com/hc/en-gb/articles/28543815517209-SPF-DKIM-and-DMARC-Overview)
- [Supabase backup and restore guidance](https://supabase.com/docs/guides/platform/backups)
- [Vercel deployment system variables](https://vercel.com/docs/environment-variables/system-environment-variables)
# Workforce scheduling

1. Open **Staff jobs** and confirm the employee has an active assigned job.
2. Open **Staff schedule**, add a shift, and confirm overlapping shifts are rejected.
3. Open **My schedule** as the assigned employee and confirm the published shift appears in the restaurant timezone.
4. Open **Time clock**, select the scheduled shift, then clock in, take a break, end the break, and clock out.
5. Open **Staff shifts** and confirm the completed worked shift appears for the correct employee and restaurant.
6. Approve the completed timesheet and download **Export approved**.
7. Confirm the CSV contains the employee, job, worked minutes, approved time, and approver.
8. Open **My schedule**, submit a time-off request, and confirm an overlapping open request is rejected.
9. Open **Staff schedule**, approve the request, and confirm a shift cannot be added during approved leave.
10. Confirm leave approval is blocked when a published shift already overlaps the requested dates.
11. Cancel the approved request from **My schedule** and confirm the dates can be scheduled again.
12. Save a weekly availability pattern from **My schedule**.
13. Confirm **Staff schedule** blocks a shift outside those hours unless the manager records an override reason.
14. Confirm the saved shift shows the availability override reason in schedule history.
15. Publish an **Open shift** and confirm only staff assigned to its job can offer to cover it.
16. Request cover for an assigned future shift and confirm the employee cannot volunteer for their own request.
17. Approve a qualified volunteer and confirm the original schedule is reassigned without creating a duplicate shift.
18. Confirm competing offers are declined and the filled request leaves the open queue.
19. Confirm cancelling a shift also closes its open cover request.
20. Open a staff member, assign an hourly pay rate to one of their jobs, then clock in and out under that job.
21. Change the assignment rate after clock-out and confirm the completed shift retains the original rate and gross pay.
22. Approve the timesheet, export approved records, and confirm hourly rate, currency, and gross pay are present.
23. Add a payroll employee reference, run **Payroll CSV**, and confirm the reference and gross pay appear in the downloaded file.
24. Remove the payroll reference or use an approved shift without a captured rate and confirm payroll export is blocked with a clear setup message.
25. Create a bounded payroll export, confirm it appears in export history, and re-download the exact file.
26. Try exporting the same approved shift again and confirm duplicate payroll inclusion is blocked.

# Ingredient and recipe inventory

1. Open **Inventory** as a staff member with inventory management access.
2. Add an ingredient with a base unit, opening quantity and low-stock threshold.
3. Edit the ingredient and confirm current quantity is read-only; update the balance through **Stock movements** instead.
4. Select a menu product under **Product recipes**, enable the ingredient and enter the quantity consumed by one product.
5. Save the recipe, refresh the page and confirm the product retains the ingredient and quantity.
6. Confirm a zero or negative recipe quantity is rejected.
7. Confirm a user without inventory management access cannot open the screen or call the ingredient and recipe APIs.
8. Confirm existing finished-product stock controls still load and save independently.
9. Place an order with a recipe product and confirm ingredient stock decreases by the recipe quantity multiplied by the ordered quantity.
10. Change the product recipe after ordering, cancel the item and confirm the original snapshotted quantity is restored.
11. Reduce an ingredient below the required recipe quantity and confirm the order is rejected without making any stock negative.
12. Record a stock receipt and confirm both the ingredient balance and movement history increase by that quantity.
13. Record waste and confirm the balance decreases; attempt waste above the available balance and confirm it is rejected without changing stock.
14. Record a signed adjustment and confirm its reason, operator, before balance and after balance appear in movement history.
15. Enter a physical stock count and confirm the system records the difference as variance, including a zero variance count.
16. Confirm order consumption appears as **Order use** and a later item or order cancellation appears as **Restored**, both linked to the original order item reference.

# Suppliers and purchase orders

1. Open **Inventory** and find **Procurement**.
2. Add a supplier with contact details, refresh the page and confirm it remains available.
3. Create a draft purchase order with at least one ingredient, ordered quantity and optional unit cost.
4. Edit the draft and confirm supplier, expected date, notes and ingredient lines can change before placement.
5. Place the purchase order and confirm draft editing is no longer available.
6. Receive only part of one line and confirm the order becomes **Part received**, the received and outstanding quantities reconcile, and ingredient stock increases once.
7. Repeat the same receipt request or double-submit it and confirm stock is not added twice.
8. Attempt to receive above the outstanding quantity and confirm the request is rejected without changing stock.
9. Receive the remaining quantity and confirm the order becomes **Received** with zero outstanding quantity.
10. Confirm each receipt shows the receiving operator and creates a linked **Receipt** entry in ingredient movement history.
11. Cancel a separate draft or ordered purchase order and confirm no ingredient stock changes.
12. Confirm inactive suppliers cannot be selected for new purchase orders and ordered/received purchase orders cannot be edited.

# Stock transfers

1. Open **Inventory** at Restaurant A and find **Stock transfers**.
2. Create an outbound draft to active sibling Restaurant B, map a source ingredient to a destination ingredient with the same base unit, and enter a quantity.
3. Edit the draft and confirm the destination, note, ingredient mapping and quantity can change before dispatch.
4. Attempt to map ingredients with different base units and confirm the transfer is rejected.
5. Attempt to dispatch more than Restaurant A has in stock and confirm the whole transfer is rejected without changing any balance.
6. Dispatch a valid transfer and confirm Restaurant A stock decreases once and a linked **Transfer out** movement appears.
7. Repeat the dispatch request and confirm stock is not deducted again.
8. Sign in to Restaurant B, open the **Inbound** tab and confirm the in-transit transfer is visible.
9. Receive the exact dispatched quantity and confirm Restaurant B stock increases once with zero variance and a linked **Transfer in** movement.
10. For a separate transfer, receive less than was dispatched and confirm the actual quantity increases Restaurant B stock while the shortfall remains visible as variance.
11. Repeat the receipt request and confirm stock is not added again.
12. Confirm a draft can be cancelled without changing stock and an in-transit or received transfer cannot be cancelled or edited.
13. Confirm restaurants outside the source company cannot be selected or accessed through transfer APIs.

# Menu availability schedules

1. Open **Menu Manager**, find **Menu availability**, and add a named schedule such as **Breakfast**.
2. Add one or more weekly periods and confirm the displayed timezone matches the restaurant timezone.
3. Assign a category, save, and confirm its products appear on the ordering menu during an active period.
4. Change the period so it is currently inactive and confirm the assigned category disappears from both customer and staff ordering menus.
5. Confirm the category and its products remain visible in **Menu Manager** while unavailable for ordering.
6. Assign an individual product to a second inactive schedule and confirm that product is hidden even while its category schedule is active.
7. Activate the product schedule and confirm the product returns without changing other products in the category.
8. Assign the same category or product to two schedules and confirm either active schedule makes it available.
9. Add an overnight period, such as Friday 22:00 to Saturday 02:00, and confirm it remains available after midnight until the closing time.
10. Pause a schedule and confirm its assignments become unavailable without deleting the schedule or menu records.
11. Leave a category and product unassigned and confirm they remain available whenever the restaurant accepts orders.
12. Open an item in the ordering menu, make its assigned schedule inactive before submission, and confirm the order is rejected instead of accepting a stale selection.
13. Confirm a staff member without menu-management permission cannot load or update availability schedules.

# Allergens and dietary information

1. Open **Menu Manager**, add or edit a product, and confirm dietary and product labels are separate from allergen declarations.
2. Confirm the allergen section lists the 14 regulated allergens and each supports **Not declared**, **Contains**, and **May contain**.
3. Save a product with at least one dietary label, one **Contains** declaration and one **May contain** declaration.
4. Refresh **Menu Manager** and confirm all selected labels and declarations remain selected.
5. Open the staff ordering menu and confirm the product shows its dietary labels plus written **Contains** and **May contain** information.
6. Open the customer ordering link and confirm the same declarations are visible before the item is added to the cart.
7. Confirm the ordering menu includes a prompt asking customers to tell restaurant staff about food allergies.
8. Edit the product, change a declaration, remove another declaration, save, and confirm both staff and customer menus update.
9. Submit the same allergen twice with different declarations through the API and confirm the request is rejected.
10. Confirm the former **Egg**, **Contains Dairy**, and **Contains Nuts** tags are not offered as ordinary labels and existing assignments were migrated to structured allergen declarations.
11. Confirm a product with no allergen declarations remains orderable and does not show an empty allergen warning.
12. Confirm a staff member without menu-management permission cannot change product allergen declarations.
