import { DefaultSession } from "next-auth";

import type { MembershipRole } from "@/lib/staff-auth";

type StaffSessionUser = DefaultSession["user"] & {
  id: string;
  kind: "staff";
  role: MembershipRole;
  membershipId: string;
  organizationId: string;
  username?: string;
};

type CustomerSessionUser = DefaultSession["user"] & {
  id: string;
  kind: "customer";
  role?: never;
  membershipId?: never;
  organizationId?: never;
  username?: never;
};

declare module "next-auth" {
  interface Session {
    user: StaffSessionUser | CustomerSessionUser;
  }

  interface User {
    kind?: "staff" | "customer";
    role?: MembershipRole;
    membershipId?: string;
    organizationId?: string;
    sessionVersion?: number;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: "staff" | "customer";
    role?: MembershipRole;
    membershipId?: string;
    organizationId?: string;
    sessionVersion?: number;
    username?: string;
  }
}
