import { DefaultSession } from "next-auth";

import type { MembershipRole } from "@/lib/staff-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: MembershipRole;
      membershipId?: string;
      organizationId: string;
      locationId: string;
      username?: string;
    };
  }

  interface User {
    role: MembershipRole;
    membershipId?: string;
    organizationId: string;
    locationId: string;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: MembershipRole;
    membershipId?: string;
    organizationId?: string;
    locationId?: string;
    username?: string;
  }
}
