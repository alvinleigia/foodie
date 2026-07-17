"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { getStaffHomePathForOrganization } from "@/lib/staff-home";
import { resolveStaffAccessCandidate } from "@/lib/staff-auth";

export type LoginState = {
  error?: string;
};

export async function authenticate(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    const username = formData.get("username");
    const access = await resolveStaffAccessCandidate(username, {
      accessScope: { type: "PLATFORM" },
    });
    const redirectTo = access
      ? getStaffHomePathForOrganization(access.role, {
          slug: access.organizationSlug,
          type: access.organizationType,
        })
      : null;

    await signIn("credentials", {
      username,
      password: formData.get("password"),
      redirectTo: redirectTo ?? "/dashboard",
    });

    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid username or password." };
      }

      return { error: "Unable to sign in right now." };
    }

    throw error;
  }
}
