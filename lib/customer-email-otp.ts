import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { customerEmailOtps } from "@/db/schema";
import { getOrCreateEmailCustomer } from "@/lib/customer-auth";
import { customerEmailOtpVerifySchema } from "@/lib/validations/customer-email-otp";

const otpExpiryMs = 10 * 60 * 1000;
const otpResendCooldownMs = 60 * 1000;
const otpRequestWindowMs = 15 * 60 * 1000;
const otpMaxRequestsPerWindow = 5;
const otpMaxAttempts = 5;

export class CustomerEmailOtpCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Wait before requesting another code.");
    this.name = "CustomerEmailOtpCooldownError";
  }
}

function getOtpSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for customer email codes.");
  }

  return secret;
}

function hashOtp(id: string, email: string, code: string) {
  return createHmac("sha256", getOtpSecret())
    .update(`${id}:${email}:${code}`)
    .digest("hex");
}

function otpHashesMatch(expectedHash: string, actualHash: string) {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function sendCustomerEmailOtp(email: string, code: string, id: string) {
  const apiKey = process.env.SMTP2GO_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Customer email delivery is not configured.");
  }

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      sender: from,
      to: [email],
      subject: "Your sign-in code",
      text_body: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html_body: `<p>Your sign-in code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
      custom_headers: [
        { header: "X-OTP-Request-ID", value: id },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: { failed?: number; succeeded?: number } }
    | null;

  if (
    !response.ok ||
    payload?.data?.failed !== 0 ||
    payload?.data?.succeeded !== 1
  ) {
    throw new Error(`Email delivery failed with status ${response.status}.`);
  }
}

export function isCustomerEmailOtpConfigured() {
  return Boolean(
    process.env.AUTH_SECRET && process.env.SMTP2GO_API_KEY && process.env.EMAIL_FROM,
  );
}

export async function requestCustomerEmailOtp(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const now = new Date();
  const db = getDb();
  const recentOtps = await db
    .select({ createdAt: customerEmailOtps.createdAt })
    .from(customerEmailOtps)
    .where(
      and(
        eq(customerEmailOtps.email, email),
        gt(customerEmailOtps.createdAt, new Date(now.getTime() - otpRequestWindowMs)),
      ),
    )
    .orderBy(desc(customerEmailOtps.createdAt))
    .limit(otpMaxRequestsPerWindow);

  if (recentOtps.length >= otpMaxRequestsPerWindow) {
    const oldestRequest = recentOtps[recentOtps.length - 1];
    const retryAfterMs =
      oldestRequest.createdAt.getTime() + otpRequestWindowMs - now.getTime();
    throw new CustomerEmailOtpCooldownError(
      Math.max(1, Math.ceil(retryAfterMs / 1000)),
    );
  }

  const latestOtp = recentOtps[0];

  if (latestOtp) {
    const retryAfterMs =
      latestOtp.createdAt.getTime() + otpResendCooldownMs - now.getTime();

    if (retryAfterMs > 0) {
      throw new CustomerEmailOtpCooldownError(Math.ceil(retryAfterMs / 1000));
    }
  }

  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(now.getTime() + otpExpiryMs);

  await db.transaction(async (tx) => {
    await tx
      .update(customerEmailOtps)
      .set({ consumedAt: now, updatedAt: now })
      .where(
        and(
          eq(customerEmailOtps.email, email),
          isNull(customerEmailOtps.consumedAt),
        ),
      );

    await tx.insert(customerEmailOtps).values({
      id,
      email,
      codeHash: hashOtp(id, email, code),
      expiresAt,
      updatedAt: now,
    });
  });

  try {
    await sendCustomerEmailOtp(email, code, id);
  } catch (error) {
    await db
      .update(customerEmailOtps)
      .set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(eq(customerEmailOtps.id, id));
    throw error;
  }

  return { expiresAt };
}

export async function authenticateCustomerEmailOtp(credentials: unknown) {
  const parsed = customerEmailOtpVerifySchema.safeParse(credentials);

  if (!parsed.success) {
    return null;
  }

  const { code, email } = parsed.data;
  const now = new Date();
  const db = getDb();

  const customer = await db.transaction(async (tx) => {
    const [otp] = await tx
      .select()
      .from(customerEmailOtps)
      .where(
        and(
          eq(customerEmailOtps.email, email),
          isNull(customerEmailOtps.consumedAt),
          gt(customerEmailOtps.expiresAt, now),
        ),
      )
      .orderBy(desc(customerEmailOtps.createdAt))
      .limit(1);

    if (!otp || otp.attempts >= otpMaxAttempts) {
      return null;
    }

    const codeMatches = otpHashesMatch(otp.codeHash, hashOtp(otp.id, email, code));

    if (!codeMatches) {
      const nextAttempts = otp.attempts + 1;
      await tx
        .update(customerEmailOtps)
        .set({
          attempts: sql`${customerEmailOtps.attempts} + 1`,
          consumedAt: nextAttempts >= otpMaxAttempts ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(customerEmailOtps.id, otp.id),
            eq(customerEmailOtps.attempts, otp.attempts),
            isNull(customerEmailOtps.consumedAt),
          ),
        );
      return null;
    }

    const [consumedOtp] = await tx
      .update(customerEmailOtps)
      .set({ consumedAt: now, updatedAt: now })
      .where(
        and(
          eq(customerEmailOtps.id, otp.id),
          eq(customerEmailOtps.attempts, otp.attempts),
          isNull(customerEmailOtps.consumedAt),
        ),
      )
      .returning({ id: customerEmailOtps.id });

    return consumedOtp ? email : null;
  });

  return customer ? getOrCreateEmailCustomer(customer) : null;
}
