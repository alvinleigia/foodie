import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authenticateCustomerEmailOtp } from "@/lib/customer-email-otp";
import { consumeCustomerAuthHandoff } from "@/lib/customer-auth-handoff";
import { authenticateStaff } from "@/lib/staff-auth";
import { isPlatformAdministrationDomain } from "@/lib/deployment-domain";
import { validateStaffSessionAccess } from "@/lib/staff-session";
import type { MembershipRole } from "@/lib/staff-auth";

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth(() => {
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

        if (!isPlatformAdministrationDomain(requestHost)) {
          return null;
        }

        return authenticateStaff(credentials?.username, credentials?.password, {
          accessScope: { type: "PLATFORM" },
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
    Credentials({
      id: "customer-auth-handoff",
      name: "Customer session handoff",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials, request) {
        const customer = await consumeCustomerAuthHandoff(
          credentials?.token,
          request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
        );

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
  ],
  callbacks: {
    async signIn({ account, user }) {
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

      if (account.provider === "customer-auth-handoff") {
        return user.kind === "customer" && Boolean(user.email);
      }

      return false;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        if (user.kind === "customer") {
          token.sub = user.id;
          token.kind = "customer";
          delete token.role;
          delete token.membershipId;
          delete token.organizationId;
          delete token.sessionVersion;
          delete token.username;

          return token;
        }

        const staffUser = user as {
          id: string;
          membershipId: string;
          role: MembershipRole;
          organizationId: string;
          sessionVersion: number;
          username?: string;
        };

        token.sub = staffUser.id;
        token.kind = "staff";
        token.membershipId = staffUser.membershipId;
        token.role = staffUser.role;
        token.organizationId = staffUser.organizationId;
        token.sessionVersion = staffUser.sessionVersion;
        token.username = staffUser.username;
      }

      if (!token.kind && token.role) {
        token.kind = "staff";
      }

      if (token.kind !== "staff") {
        return token.kind === "customer" ? token : null;
      }

      const nextUser = session?.user as { membershipId?: unknown } | undefined;
      const requestedMembershipId =
        trigger === "update" && typeof nextUser?.membershipId === "string"
          ? nextUser.membershipId
          : token.membershipId;

      if (
        typeof token.sub !== "string" ||
        typeof requestedMembershipId !== "string"
      ) {
        return null;
      }

      const access = await validateStaffSessionAccess({
        membershipId: requestedMembershipId,
        sessionVersion: token.sessionVersion,
        userId: token.sub,
      });

      if (!access) {
        return null;
      }

      token.membershipId = access.membershipId;
      token.role = access.role;
      token.organizationId = access.organizationId;
      token.sessionVersion = access.sessionVersion;

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
          membershipId: token.membershipId as string,
          role: token.role as MembershipRole,
          organizationId: token.organizationId as string,
          username: typeof token.username === "string" ? token.username : undefined,
        },
      };
    },
  },
  };
});
