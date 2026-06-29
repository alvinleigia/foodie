import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authenticateStaff } from "@/lib/staff-auth";
import { resolveLocationAccess, resolveMembershipAccess } from "@/lib/location-access";
import type { MembershipRole } from "@/lib/staff-auth";

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
      async authorize(credentials) {
        return authenticateStaff(credentials?.username, credentials?.password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const staffUser = user as {
          id: string;
          role?: MembershipRole;
          organizationId?: string;
          locationId?: string;
          username?: string;
        };

        token.sub = staffUser.id;
        token.role = staffUser.role ?? "ORDER_OPERATOR";
        token.organizationId = staffUser.organizationId;
        token.locationId = staffUser.locationId;
        token.username = staffUser.username;
      }

      if (trigger === "update" && token.sub) {
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
      if (session.user) {
        session.user.id = typeof token.sub === "string" ? token.sub : "";
        session.user.role =
          (typeof token.role === "string" ? token.role : "ORDER_OPERATOR") as MembershipRole;
        session.user.organizationId =
          typeof token.organizationId === "string" ? token.organizationId : "";
        session.user.locationId =
          typeof token.locationId === "string" ? token.locationId : "";
        session.user.username =
          typeof token.username === "string" ? token.username : undefined;
      }

      return session;
    },
  },
});
