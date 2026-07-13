import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

import { getOrCreateOAuthCustomer } from "@/lib/customer-auth";
import { authenticateStaff } from "@/lib/staff-auth";
import { resolveLocationAccess, resolveMembershipAccess } from "@/lib/location-access";
import {
  getTenantDomainAccessScopeFromDomain,
  isRootPlatformDomain,
} from "@/lib/tenant-domains";
import type { MembershipRole } from "@/lib/staff-auth";

const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;
const googleProvider =
  googleClientId && googleClientSecret
    ? Google({ clientId: googleClientId, clientSecret: googleClientSecret })
    : null;
const appleClientId = process.env.AUTH_APPLE_ID;
const appleClientSecret = process.env.AUTH_APPLE_SECRET;
const appleProvider =
  appleClientId && appleClientSecret
    ? Apple({ clientId: appleClientId, clientSecret: appleClientSecret })
    : null;
const facebookClientId = process.env.AUTH_FACEBOOK_ID;
const facebookClientSecret = process.env.AUTH_FACEBOOK_SECRET;
const facebookProvider =
  facebookClientId && facebookClientSecret
    ? Facebook({ clientId: facebookClientId, clientSecret: facebookClientSecret })
    : null;

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

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth({
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
    ...(googleProvider ? [googleProvider] : []),
    ...(appleProvider ? [appleProvider] : []),
    ...(facebookProvider ? [facebookProvider] : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account || account.provider === "credentials") {
        user.kind = "staff";
        return true;
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
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        if (account && account.provider !== "credentials") {
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
});
