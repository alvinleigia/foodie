import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { customerOAuthAccounts, customers } from "@/db/schema";

type OAuthCustomerInput = {
  email: string;
  name: string;
  provider: string;
  providerAccountId: string;
};

export async function getOrCreateOAuthCustomer(input: OAuthCustomerInput) {
  const email = input.email.trim().toLowerCase();
  const providedName = input.name.trim();
  const name = providedName || email.split("@")[0];
  const provider = input.provider.trim().toLowerCase();
  const providerAccountId = input.providerAccountId.trim();

  if (!email || !provider || !providerAccountId) {
    throw new Error("OAuth customer identity is incomplete.");
  }

  return getDb().transaction(async (tx) => {
    const [existingAccount] = await tx
      .select({
        email: customers.email,
        id: customers.id,
        name: customers.name,
      })
      .from(customerOAuthAccounts)
      .innerJoin(customers, eq(customers.id, customerOAuthAccounts.customerId))
      .where(
        and(
          eq(customerOAuthAccounts.provider, provider),
          eq(customerOAuthAccounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);

    if (existingAccount) {
      if (!existingAccount.name.trim() && providedName) {
        const [updatedAccount] = await tx
          .update(customers)
          .set({ name: providedName, updatedAt: new Date() })
          .where(
            and(
              eq(customers.id, existingAccount.id),
              sql`btrim(${customers.name}) = ''`,
            ),
          )
          .returning({
            email: customers.email,
            id: customers.id,
            name: customers.name,
          });

        return updatedAccount ?? existingAccount;
      }

      return existingAccount;
    }

    let [customer] = await tx
      .select({
        email: customers.email,
        id: customers.id,
        name: customers.name,
      })
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);

    if (!customer) {
      [customer] = await tx
        .insert(customers)
        .values({
          email,
          emailVerifiedAt: new Date(),
          name,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({
          email: customers.email,
          id: customers.id,
          name: customers.name,
        });
    }

    if (!customer) {
      [customer] = await tx
        .select({
          email: customers.email,
          id: customers.id,
          name: customers.name,
        })
        .from(customers)
        .where(eq(customers.email, email))
        .limit(1);
    }

    if (!customer) {
      throw new Error("Unable to create the customer account.");
    }

    if (!customer.name.trim() && providedName) {
      const [updatedCustomer] = await tx
        .update(customers)
        .set({ name: providedName, updatedAt: new Date() })
        .where(
          and(
            eq(customers.id, customer.id),
            sql`btrim(${customers.name}) = ''`,
          ),
        )
        .returning({
          email: customers.email,
          id: customers.id,
          name: customers.name,
        });

      customer = updatedCustomer ?? customer;
    }

    await tx
      .insert(customerOAuthAccounts)
      .values({
        customerId: customer.id,
        provider,
        providerAccountId,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [
          customerOAuthAccounts.provider,
          customerOAuthAccounts.providerAccountId,
        ],
      });

    const [linkedAccount] = await tx
      .select({
        email: customers.email,
        id: customers.id,
        name: customers.name,
      })
      .from(customerOAuthAccounts)
      .innerJoin(customers, eq(customers.id, customerOAuthAccounts.customerId))
      .where(
        and(
          eq(customerOAuthAccounts.provider, provider),
          eq(customerOAuthAccounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);

    if (!linkedAccount) {
      throw new Error("Unable to link the customer account.");
    }

    return linkedAccount;
  });
}

export async function getOrCreateEmailCustomer(emailInput: string) {
  const email = emailInput.trim().toLowerCase();

  if (!email) {
    throw new Error("Customer email is required.");
  }

  return getDb().transaction(async (tx) => {
    let [customer] = await tx
      .select({
        email: customers.email,
        id: customers.id,
        name: customers.name,
      })
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);

    if (!customer) {
      [customer] = await tx
        .insert(customers)
        .values({
          email,
          emailVerifiedAt: new Date(),
          name: "",
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({
          email: customers.email,
          id: customers.id,
          name: customers.name,
        });
    }

    if (!customer) {
      [customer] = await tx
        .select({
          email: customers.email,
          id: customers.id,
          name: customers.name,
        })
        .from(customers)
        .where(eq(customers.email, email))
        .limit(1);
    }

    if (!customer) {
      throw new Error("Unable to create the customer account.");
    }

    await tx
      .update(customers)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(customers.id, customer.id));

    return customer;
  });
}
