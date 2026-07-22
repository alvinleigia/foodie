import { DefaultSession } from "next-auth";

import type { MembershipRole } from "@/lib/staff-auth";
import type { StaffPermission } from "@/lib/staff-permissions";

type StaffSessionUser = DefaultSession["user"] & {
  id: string;
  kind: "staff";
  role: MembershipRole;
  membershipId: string;
  organizationId: string;
  permissions: StaffPermission[];
  username?: string;
};

type CustomerSessionUser = DefaultSession["user"] & {
  id: string;
  kind: "customer";
  role?: never;
  membershipId?: never;
  organizationId?: never;
  permissions?: never;
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
    permissions?: StaffPermission[];
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
    permissions?: StaffPermission[];
    sessionVersion?: number;
    username?: string;
  }
}
