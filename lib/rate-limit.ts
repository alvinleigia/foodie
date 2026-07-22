import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { rateLimitWindows } from "@/db/schema";

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitRow = {
  requestCount: number;
  resetAt: Date;
};

function hashRateLimitKey(key: string) {
  const authSecret = process.env.AUTH_SECRET;

  if (!authSecret) {
    throw new Error("AUTH_SECRET is required for shared rate limiting.");
  }

  return createHmac("sha256", authSecret).update(key).digest("hex");
}

export function getRequestRateLimitKey(request: Request, scope: string) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";

  return `${scope}:${ip}`;
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitInput): Promise<RateLimitResult> {
  if (!key || !Number.isInteger(limit) || limit < 1 || windowMs < 1) {
    throw new Error("Invalid rate limit configuration.");
  }

  const keyHash = hashRateLimitKey(key);
  const result = await getDb().execute(sql<RateLimitRow>`
    INSERT INTO ${rateLimitWindows} (
      ${rateLimitWindows.keyHash},
      ${rateLimitWindows.requestCount},
      ${rateLimitWindows.resetAt},
      ${rateLimitWindows.updatedAt}
    )
    VALUES (
      ${keyHash},
      1,
      now() + (${windowMs} * interval '1 millisecond'),
      now()
    )
    ON CONFLICT (${rateLimitWindows.keyHash}) DO UPDATE
    SET
      ${rateLimitWindows.requestCount} = CASE
        WHEN ${rateLimitWindows.resetAt} <= now() THEN 1
        ELSE least(${rateLimitWindows.requestCount} + 1, ${limit + 1})
      END,
      ${rateLimitWindows.resetAt} = CASE
        WHEN ${rateLimitWindows.resetAt} <= now()
          THEN now() + (${windowMs} * interval '1 millisecond')
        ELSE ${rateLimitWindows.resetAt}
      END,
      ${rateLimitWindows.updatedAt} = now()
    RETURNING
      ${rateLimitWindows.requestCount} AS "requestCount",
      ${rateLimitWindows.resetAt} AS "resetAt"
  `);
  const row = result[0] as RateLimitRow | undefined;

  if (!row) {
    throw new Error("Shared rate limiter did not return a result.");
  }

  const currentTime = Date.now();
  const resetAt = new Date(row.resetAt).getTime();
  const requestCount = Number(row.requestCount);
  const allowed = requestCount <= limit;

  return {
    allowed,
    limit,
    remaining: allowed ? Math.max(0, limit - requestCount) : 0,
    resetAt,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((resetAt - currentTime) / 1000)),
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
