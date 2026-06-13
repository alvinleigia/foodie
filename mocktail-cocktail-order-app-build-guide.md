# Mocktail / Cocktail Order App — Build Guide for Coding Bots

## 1. Project Summary

Build a **Next.js app** where customers can open a public order link, select a mocktail/cocktail, place an order, track order status on the same device, and cancel only before preparation starts.

A **mixologist user** should see incoming orders, start preparing them, mark them ready, play a voice announcement calling the customer, and mark the order as delivered.

All orders must be saved in **Supabase PostgreSQL** using **Drizzle ORM**. Use **Zod** for request validation.

For the MVP, drink categories and drink products should come from a static JSON/TypeScript data file, not from the database.

---

## 2. Tech Stack

Use:

- Next.js App Router
- TypeScript
- Drizzle ORM
- Supabase PostgreSQL
- Zod
- Tailwind CSS
- shadcn/ui if needed
- localStorage for customer-side order tracking
- Browser `SpeechSynthesis` API for order announcement

Avoid initially:

- WebSockets
- Supabase Realtime
- Admin drink management
- Payment integration
- Complex authentication for customers

---

## 3. Main User Roles

### Customer

Customer does not log in.

Customer can:

- Enter name
- Select category
- Select drink
- Place order
- View their active orders from localStorage
- Cancel their own order only while it is `PENDING`

### Mixologist

Mixologist should be logged in or protected by a simple auth mechanism.

Mixologist can:

- View active orders
- Cancel an order only while it is `PENDING`
- Mark order as `PREPARING`
- Mark order as `READY`
- Play announcement repeatedly
- Mark order as `DELIVERED`

### Admin

Admin can be added later.

Future admin can:

- View analytics
- Manage mixologist users
- Manage drinks if drinks are later moved to database

---

## 4. Core Order Status Flow

Allowed flow:

```txt
PENDING → PREPARING → READY → DELIVERED
```

Cancellation flow:

```txt
PENDING → CANCELLED
```

Important rule:

```txt
Only PENDING orders can be cancelled.
Once an order becomes PREPARING, neither customer nor mixologist can cancel it.
```

Possible statuses:

```ts
type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";
```

---

## 5. MVP Routes

Recommended routes:

```txt
/order
/mixologist
/api/orders
/api/orders/status
/api/orders/[id]/cancel
/api/orders/[id]/start
/api/orders/[id]/ready
/api/orders/[id]/announce
/api/orders/[id]/deliver
```

Optional later:

```txt
/admin
/admin/analytics
/admin/orders
```

---

## 6. Suggested Folder Structure

```txt
src/
  app/
    order/
      page.tsx
    mixologist/
      page.tsx
    api/
      orders/
        route.ts
        status/
          route.ts
        [id]/
          cancel/
            route.ts
          start/
            route.ts
          ready/
            route.ts
          announce/
            route.ts
          deliver/
            route.ts

  components/
    order/
      OrderForm.tsx
      CustomerOrderStatus.tsx
    mixologist/
      MixologistOrderBoard.tsx
      OrderCard.tsx

  data/
    drinks.ts

  db/
    index.ts
    schema.ts

  lib/
    validations/
      order.ts
    order-token.ts
    order-number.ts
    auth.ts
```

---

## 7. Static Drinks Data

For MVP, store categories and drinks in:

```txt
src/data/drinks.ts
```

Example:

```ts
export const drinkCategories = [
  {
    id: "mocktails",
    name: "Mocktails",
    drinks: [
      {
        id: "virgin-mojito",
        name: "Virgin Mojito",
        isActive: true,
      },
      {
        id: "blue-lagoon",
        name: "Blue Lagoon",
        isActive: true,
      },
      {
        id: "fruit-punch",
        name: "Fruit Punch",
        isActive: true,
      },
    ],
  },
  {
    id: "cocktails",
    name: "Cocktails",
    drinks: [
      {
        id: "mojito",
        name: "Mojito",
        isActive: true,
      },
      {
        id: "cosmopolitan",
        name: "Cosmopolitan",
        isActive: true,
      },
      {
        id: "margarita",
        name: "Margarita",
        isActive: true,
      },
    ],
  },
] as const;
```

When placing an order, save a snapshot of both category and drink in the order table:

```txt
categoryId
categoryName
drinkId
drinkName
```

This ensures analytics still work even if JSON drink names change later.

---

## 8. Environment Variables

Create `.env.local`:

```env
DATABASE_URL="your-supabase-postgres-pooler-url"
```

Use Supabase pooler URL for serverless deployment.

---

## 9. Drizzle Setup

Install:

```bash
npm install drizzle-orm postgres zod
npm install -D drizzle-kit
```

Create `src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
});

export const db = drizzle(client, { schema });
```

Use `prepare: false` for Supabase transaction pooler compatibility.

---

## 10. Drizzle Schema

Create `src/db/schema.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "MIXOLOGIST",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export const cancelledByTypeEnum = pgEnum("cancelled_by_type", [
  "CUSTOMER",
  "MIXOLOGIST",
  "ADMIN",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),

  orderNo: integer("order_no").notNull().unique(),

  customerName: text("customer_name").notNull(),
  customerToken: text("customer_token").notNull(),

  categoryId: text("category_id").notNull(),
  categoryName: text("category_name").notNull(),

  drinkId: text("drink_id").notNull(),
  drinkName: text("drink_name").notNull(),

  status: orderStatusEnum("status").default("PENDING").notNull(),

  preparedById: uuid("prepared_by_id").references(() => users.id),

  startedAt: timestamp("started_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),

  cancelledByType: cancelledByTypeEnum("cancelled_by_type"),
  cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id),
  cancelReason: text("cancel_reason"),

  announcementCount: integer("announcement_count").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

---

## 11. Zod Validation

Create `src/lib/validations/order.ts`:

```ts
import { z } from "zod";
import { drinkCategories } from "@/data/drinks";

export const createOrderSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(80, "Name is too long"),
    categoryId: z.string().min(1, "Category is required"),
    drinkId: z.string().min(1, "Drink is required"),
  })
  .superRefine((data, ctx) => {
    const category = drinkCategories.find(
      (item) => item.id === data.categoryId
    );

    if (!category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "Invalid category selected",
      });
      return;
    }

    const drink = category.drinks.find(
      (item) => item.id === data.drinkId && item.isActive
    );

    if (!drink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drinkId"],
        message: "Invalid drink selected",
      });
    }
  });

export const customerCancelOrderSchema = z.object({
  customerToken: z.string().min(20),
  cancelReason: z.string().trim().max(200).optional(),
});

export const staffCancelOrderSchema = z.object({
  cancelReason: z.string().trim().max(200).optional(),
});

export const orderStatusRequestSchema = z.object({
  orders: z.array(
    z.object({
      orderId: z.string().uuid(),
      customerToken: z.string().min(20),
    })
  ),
});
```

---

## 12. Customer Token

Customers are not logged in, so every customer order must have a random secure token.

Create `src/lib/order-token.ts`:

```ts
export function generateCustomerToken() {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}
```

Save this token in the order table and return it to the customer device.

Customer localStorage should store:

```ts
type LocalCustomerOrder = {
  orderId: string;
  orderNo: number;
  customerToken: string;
  customerName: string;
  categoryName: string;
  drinkName: string;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
  createdAt: string;
};
```

Suggested localStorage key:

```txt
bar_customer_orders
```

---

## 13. Order Number Generation

For MVP, order numbers can be generated using a timestamp-based approach or by querying the latest order.

Better approach:

- Use a database sequence later.
- For MVP, query max `orderNo` and add 1.

Important: max + 1 can race under high traffic. For a real production counter, replace this with a Postgres sequence.

Simple helper idea:

```ts
// src/lib/order-number.ts
// Implement using SQL max(order_no) + 1 for MVP.
// Later replace with Postgres sequence.
```

---

## 14. API Behavior

### Create Order

Endpoint:

```txt
POST /api/orders
```

Request:

```json
{
  "customerName": "Alvin",
  "categoryId": "mocktails",
  "drinkId": "virgin-mojito"
}
```

Server must:

1. Validate with `createOrderSchema`.
2. Find category and drink from `drinkCategories`.
3. Generate customer token.
4. Generate order number.
5. Insert order with status `PENDING`.
6. Return order details and customer token.

Response:

```json
{
  "orderId": "uuid",
  "orderNo": 12,
  "customerToken": "random-token",
  "customerName": "Alvin",
  "categoryName": "Mocktails",
  "drinkName": "Virgin Mojito",
  "status": "PENDING",
  "createdAt": "2026-05-15T10:00:00.000Z"
}
```

---

### Get Customer Order Statuses

Endpoint:

```txt
POST /api/orders/status
```

Request:

```json
{
  "orders": [
    {
      "orderId": "uuid",
      "customerToken": "random-token"
    }
  ]
}
```

Server must:

- Return only orders where `id` and `customerToken` match.
- This prevents one user from tracking another user's order.

Response:

```json
{
  "orders": [
    {
      "orderId": "uuid",
      "orderNo": 12,
      "customerName": "Alvin",
      "categoryName": "Mocktails",
      "drinkName": "Virgin Mojito",
      "status": "PREPARING",
      "createdAt": "...",
      "startedAt": "...",
      "readyAt": null,
      "deliveredAt": null,
      "cancelledAt": null
    }
  ]
}
```

---

### Customer Cancel Order

Endpoint:

```txt
POST /api/orders/[id]/cancel
```

Customer request:

```json
{
  "customerToken": "random-token",
  "cancelReason": "Changed my mind"
}
```

Server rule:

```txt
Customer can cancel only if:
- order.customerToken matches
- order.status is PENDING
```

If order is already `PREPARING`, return error:

```json
{
  "error": "This order cannot be cancelled because preparation has already started."
}
```

---

### Mixologist Cancel Order

Same endpoint can be reused, but staff auth is required.

Server rule:

```txt
Mixologist can cancel only if order.status is PENDING.
```

When cancelled by mixologist:

```ts
cancelledByType = "MIXOLOGIST"
cancelledByUserId = currentUser.id
```

---

### Start Preparing

Endpoint:

```txt
POST /api/orders/[id]/start
```

Server rule:

```txt
Only PENDING orders can be marked PREPARING.
```

Update:

```ts
status = "PREPARING"
startedAt = new Date()
preparedById = currentUser.id
updatedAt = new Date()
```

---

### Mark Ready

Endpoint:

```txt
POST /api/orders/[id]/ready
```

Server rule:

```txt
Only PREPARING orders can be marked READY.
```

Update:

```ts
status = "READY"
readyAt = new Date()
updatedAt = new Date()
```

---

### Announce Ready Order

Endpoint:

```txt
POST /api/orders/[id]/announce
```

Server rule:

```txt
Only READY orders can be announced.
```

Update:

```ts
announcementCount = announcementCount + 1
updatedAt = new Date()
```

The actual sound should play on the client/browser using `SpeechSynthesis`.

---

### Mark Delivered

Endpoint:

```txt
POST /api/orders/[id]/deliver
```

Server rule:

```txt
Only READY orders can be marked DELIVERED.
```

Update:

```ts
status = "DELIVERED"
deliveredAt = new Date()
updatedAt = new Date()
```

Delivered orders should be hidden from the active mixologist stack.

---

## 15. Customer Page Requirements

Route:

```txt
/order
```

UI should contain:

- Name input
- Category select
- Drink select filtered by selected category
- Confirm Order button
- Current active orders section on top or below form

Customer active orders should come from localStorage.

On page load:

1. Read localStorage orders.
2. Send `orderId + customerToken` to `/api/orders/status`.
3. Update localStorage with latest statuses.
4. Show active orders.

Show cancel button only if status is `PENDING`.

If status is `PREPARING`, show:

```txt
Preparation has started. Cancellation is locked.
```

If status is `READY`, show:

```txt
Your drink is ready. Please collect it.
```

If status is `DELIVERED` or `CANCELLED`, it can remain in localStorage but should be visually separated or removed from active list after some time.

---

## 16. Mixologist Page Requirements

Route:

```txt
/mixologist
```

UI should show active orders sorted by creation time:

```txt
PENDING first, then PREPARING, then READY
```

Each order card should show:

- Order number
- Customer name
- Drink name
- Category name
- Status
- Time placed
- Action buttons based on status

Actions:

| Status | Buttons |
|---|---|
| PENDING | Start Preparing, Cancel |
| PREPARING | Mark Ready |
| READY | Play Message, Mark Delivered |
| DELIVERED | Hidden |
| CANCELLED | Hidden |

Polling:

- Refresh active orders every 3 to 5 seconds for MVP.

---

## 17. Voice Announcement

Client-side function:

```ts
export function playAnnouncement(customerName: string, drinkName: string) {
  const message = `${customerName}, your ${drinkName} is ready. Please collect your order.`;

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.9;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}
```

When mixologist clicks `Play Message`:

1. Play browser speech.
2. Call `/api/orders/[id]/announce` to increment `announcementCount`.

The button can be clicked multiple times.

---

## 18. Analytics To Support Later

Because every order is stored, analytics can later show:

- Total orders today
- Total delivered orders
- Total cancelled orders
- Drinks sold by category
- Top-selling drink
- Hourly order volume
- Average preparation time
- Average ready-to-delivered time
- Number of announcements per order
- Cancellation count by customer/mixologist

Useful calculations:

```txt
Preparation time = readyAt - startedAt
Pickup delay = deliveredAt - readyAt
Total completion time = deliveredAt - createdAt
```

---

## 19. Important Business Rules

Enforce all rules on the server, not only UI.

### Cancellation

```txt
Only PENDING orders can be cancelled.
```

### Start Preparing

```txt
Only PENDING orders can become PREPARING.
```

### Mark Ready

```txt
Only PREPARING orders can become READY.
```

### Mark Delivered

```txt
Only READY orders can become DELIVERED.
```

### Customer Security

```txt
Customers can only access/cancel orders using matching orderId + customerToken.
```

Do not allow customer actions based only on order ID.

---

## 20. MVP Implementation Order

Build in this order:

### Step 1: Project setup

- Create Next.js app
- Add Tailwind
- Add Drizzle
- Connect Supabase Postgres
- Create schema
- Run migration

### Step 2: Static drinks data

- Create `src/data/drinks.ts`
- Render categories and drinks on `/order`

### Step 3: Create order

- Build order form
- Add Zod validation
- Save order to database
- Save returned order to localStorage

### Step 4: Customer status

- Read localStorage orders
- Create `/api/orders/status`
- Poll every 5 seconds
- Show current order statuses

### Step 5: Customer cancellation

- Add Cancel button only for `PENDING`
- Validate `customerToken`
- Block cancellation after `PREPARING`

### Step 6: Mixologist dashboard

- Show active orders
- Add Start Preparing
- Add Cancel
- Add Mark Ready
- Add Play Message
- Add Mark Delivered

### Step 7: Announcement

- Use `SpeechSynthesis`
- Increment `announcementCount`

### Step 8: Basic analytics

- Add simple counts later

---

## 21. Notes for Coding Bot

- Keep the first version simple.
- Do not add unnecessary admin features yet.
- Do not move drinks into database yet.
- Do not use WebSockets initially.
- Use polling for simplicity.
- Prioritize correct order lifecycle rules.
- Always validate with Zod before database writes.
- Always validate current database status before changing order status.
- Never trust localStorage for authorization. Use `customerToken` verification.
- Store category and drink snapshots in each order for analytics.

---

## 22. Future Improvements

After MVP:

- Add Supabase Realtime for instant updates
- Add admin analytics dashboard
- Add drink management UI
- Add QR code order link
- Add event/session support
- Add table number or location field
- Add payment support
- Add printed token/order slip
- Add multiple mixologist counters
- Add status screen display for ready orders
- Add sound chime before announcement

