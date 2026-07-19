import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

import { getOrCreateOAuthCustomer } from "@/lib/customer-auth";
import {
  getCustomerOAuthContextFromRequest,
  type CustomerOAuthContext,
} from "@/lib/customer-oauth-context";
import { assertOrganizationFeaturesEnabled } from "@/lib/feature-entitlements";
import type { SocialAuthProvider } from "@/lib/organization-integration-types";
import {
  resolveOrganizationOAuthIntegration,
} from "@/lib/organization-oauth-settings";

const providerTypeMap = {
  apple: "APPLE",
  facebook: "FACEBOOK",
  google: "GOOGLE",
} as const satisfies Record<string, SocialAuthProvider>;

const secureCookies = process.env.NODE_ENV === "production";
const securePrefix = secureCookies ? "__Secure-" : "";
const hostPrefix = secureCookies ? "__Host-" : "";

export const customerSocialSessionCookieName =
  `${securePrefix}foodie.customer-social.session-token`;

const standardCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: secureCookies,
};
const callbackCookieOptions = {
  ...standardCookieOptions,
  sameSite: secureCookies ? ("none" as const) : ("lax" as const),
};

async function getSocialProviders(context: CustomerOAuthContext | null) {
  if (!context) {
    return [];
  }

  try {
    await assertOrganizationFeaturesEnabled(
      context.organizationId,
      ["ordering.customer_accounts", "auth.social"],
    );
  } catch {
    return [];
  }

  const effective = await resolveOrganizationOAuthIntegration(
    context.organizationId,
    providerTypeMap[context.provider],
  );

  if (effective.status !== "CONFIGURED") {
    return [];
  }

  const credentials = {
    clientId: effective.clientId,
    clientSecret: effective.clientSecret,
  };

  if (context.provider === "google") {
    return [Google(credentials)];
  }

  if (context.provider === "apple") {
    return [Apple(credentials)];
  }

  return [Facebook(credentials)];
}

function hasTrustedOAuthEmail(
  provider: string,
  profile: Record<string, unknown> | undefined,
) {
  if (provider === "google") {
    return profile?.email_verified === true;
  }

  if (provider === "apple") {
    return profile?.email_verified === true || profile?.email_verified === "true";
  }

  return provider === "facebook";
}

export const {
  auth: customerSocialAuth,
  handlers: customerSocialHandlers,
} = NextAuth(async (request) => {
  const context = getCustomerOAuthContextFromRequest(request);

  return {
    basePath: "/api/customer-social-auth",
    cookies: {
      sessionToken: {
        name: customerSocialSessionCookieName,
        options: standardCookieOptions,
      },
      callbackUrl: {
        name: `${securePrefix}foodie.customer-social.callback-url`,
        options: callbackCookieOptions,
      },
      csrfToken: {
        name: `${hostPrefix}foodie.customer-social.csrf-token`,
        options: standardCookieOptions,
      },
      pkceCodeVerifier: {
        name: `${securePrefix}foodie.customer-social.pkce.code-verifier`,
        options: { ...callbackCookieOptions, maxAge: 15 * 60 },
      },
      state: {
        name: `${securePrefix}foodie.customer-social.state`,
        options: { ...callbackCookieOptions, maxAge: 15 * 60 },
      },
      nonce: {
        name: `${securePrefix}foodie.customer-social.nonce`,
        options: callbackCookieOptions,
      },
    },
    pages: {
      error: "/customer/auth/social",
      signIn: "/customer/auth/social",
    },
    providers: await getSocialProviders(context),
    session: { strategy: "jwt" },
    callbacks: {
      async signIn({ account, profile, user }) {
        if (
          !context ||
          !account ||
          !["apple", "facebook", "google"].includes(account.provider) ||
          account.provider !== context.provider ||
          !user.email ||
          !hasTrustedOAuthEmail(
            account.provider,
            profile as Record<string, unknown> | undefined,
          )
        ) {
          return false;
        }

        try {
          await assertOrganizationFeaturesEnabled(context.organizationId, [
            "ordering.customer_accounts",
            "auth.social",
          ]);
        } catch {
          return false;
        }

        const customer = await getOrCreateOAuthCustomer({
          email: user.email,
          name: user.name ?? "",
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });

        user.id = customer.id;
        user.kind = "customer";
        user.email = customer.email;
        user.name = customer.name;

        return true;
      },
      jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.kind = "customer";
        }

        return token;
      },
      session({ session, token }) {
        return {
          ...session,
          user: {
            email: session.user.email,
            id: typeof token.sub === "string" ? token.sub : "",
            image: session.user.image,
            kind: "customer" as const,
            name: session.user.name,
          },
        };
      },
    },
  };
});
