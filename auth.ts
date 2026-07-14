import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

import { authenticateCustomerEmailOtp } from "@/lib/customer-email-otp";
import { getOrCreateOAuthCustomer } from "@/lib/customer-auth";
import { getCustomerOAuthContextFromRequest } from "@/lib/customer-oauth-context";
import type { SocialAuthProvider } from "@/lib/organization-integration-types";
import {
  getPlatformOAuthCredentials,
  resolveOrganizationOAuthIntegration,
} from "@/lib/organization-oauth-settings";
import { authenticateStaff } from "@/lib/staff-auth";
import { resolveLocationAccess, resolveMembershipAccess } from "@/lib/location-access";
import {
  getTenantDomainAccessScopeFromDomain,
  isRootPlatformDomain,
} from "@/lib/tenant-domains";
import type { MembershipRole } from "@/lib/staff-auth";

const providerTypeMap = {
  apple: "APPLE",
  facebook: "FACEBOOK",
  google: "GOOGLE",
} as const satisfies Record<string, SocialAuthProvider>;

async function getSocialProviders(request: Parameters<typeof getCustomerOAuthContextFromRequest>[0]) {
  const credentials = {
    apple: getPlatformOAuthCredentials("APPLE"),
    facebook: getPlatformOAuthCredentials("FACEBOOK"),
    google: getPlatformOAuthCredentials("GOOGLE"),
  };
  const context = getCustomerOAuthContextFromRequest(request);

  if (context) {
    const effective = await resolveOrganizationOAuthIntegration(
      context.organizationId,
      providerTypeMap[context.provider],
    );
    credentials[context.provider] =
      effective.status === "CONFIGURED"
        ? { clientId: effective.clientId, clientSecret: effective.clientSecret }
        : null;
  }

  return {
    appleProvider: credentials.apple
      ? Apple({
          clientId: credentials.apple.clientId,
          clientSecret: credentials.apple.clientSecret,
        })
      : null,
    facebookProvider: credentials.facebook
      ? Facebook({
          clientId: credentials.facebook.clientId,
          clientSecret: credentials.facebook.clientSecret,
        })
      : null,
    googleProvider: credentials.google
      ? Google({
          clientId: credentials.google.clientId,
          clientSecret: credentials.google.clientSecret,
        })
      : null,
  };
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

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth(async (request) => {
  const { appleProvider, facebookProvider, googleProvider } =
    await getSocialProviders(request);

  return {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/staff/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const requestHost =
          request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const accessScope = await getTenantDomainAccessScopeFromDomain(requestHost);

        return authenticateStaff(credentials?.username, credentials?.password, {
          platformOnly: isRootPlatformDomain(requestHost),
          accessScope,
        });
      },
    }),
    Credentials({
      id: "customer-email-otp",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", inputMode: "numeric", type: "text" },
      },
      async authorize(credentials) {
        const customer = await authenticateCustomerEmailOtp(credentials);

        return customer
          ? {
              id: customer.id,
              email: customer.email,
              kind: "customer" as const,
              name: customer.name,
            }
          : null;
      },
    }),
    ...(googleProvider ? [googleProvider] : []),
    ...(appleProvider ? [appleProvider] : []),
    ...(facebookProvider ? [facebookProvider] : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account) {
        return false;
      }

      if (account.provider === "credentials") {
        user.kind = "staff";
        return true;
      }

      if (account.provider === "customer-email-otp") {
        return user.kind === "customer" && Boolean(user.email);
      }

      if (!["apple", "facebook", "google"].includes(account.provider)) {
        return false;
      }

      if (
        !user.email ||
        !hasTrustedOAuthEmail(
          account.provider,
          profile as Record<string, unknown> | undefined,
        )
      ) {
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
    async jwt({ token, user, trigger, session }) {
      if (user) {
        if (user.kind === "customer") {
          token.sub = user.id;
          token.kind = "customer";
          delete token.role;
          delete token.membershipId;
          delete token.organizationId;
          delete token.locationId;
          delete token.username;

          return token;
        }

        const staffUser = user as {
          id: string;
          role?: MembershipRole;
          organizationId?: string;
          locationId?: string;
          username?: string;
        };

        token.sub = staffUser.id;
        token.kind = "staff";
        token.role = staffUser.role ?? "ORDER_OPERATOR";
        token.organizationId = staffUser.organizationId;
        token.locationId = staffUser.locationId;
        token.username = staffUser.username;
      }

      if (!token.kind && token.role) {
        token.kind = "staff";
      }

      if (trigger === "update" && token.kind === "staff" && token.sub) {
        const nextUser = session?.user as
          | {
              membershipId?: unknown;
              organizationId?: unknown;
              locationId?: unknown;
            }
          | undefined;
        const membershipId =
          typeof nextUser?.membershipId === "string" ? nextUser.membershipId : "";
        const organizationId =
          typeof nextUser?.organizationId === "string" ? nextUser.organizationId : "";
        const locationId =
          typeof nextUser?.locationId === "string" ? nextUser.locationId : "";

        if (membershipId) {
          const access = await resolveMembershipAccess(token.sub, membershipId);

          if (access) {
            token.role = access.role;
            token.organizationId = access.organizationId;
            token.locationId = access.locationId ?? "";
          }
        }

        if (organizationId && locationId) {
          const access = await resolveLocationAccess(token.sub, organizationId, locationId);

          if (access) {
            token.role = access.role;
            token.organizationId = access.organizationId;
            token.locationId = access.locationId;
          }
        }
      }

      return token;
    },
    session({ session, token }) {
      const id = typeof token.sub === "string" ? token.sub : "";
      const baseUser = {
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
      };

      if (token.kind === "customer") {
        return {
          ...session,
          user: {
            ...baseUser,
            id,
            kind: "customer" as const,
          },
        };
      }

      return {
        ...session,
        user: {
          ...baseUser,
          id,
          kind: "staff" as const,
          role: (typeof token.role === "string"
            ? token.role
            : "ORDER_OPERATOR") as MembershipRole,
          organizationId:
            typeof token.organizationId === "string" ? token.organizationId : "",
          locationId: typeof token.locationId === "string" ? token.locationId : "",
          username: typeof token.username === "string" ? token.username : undefined,
        },
      };
    },
  },
  };
});
