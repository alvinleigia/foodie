"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

export async function authenticate(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    const username = formData.get("username");

    await signIn("credentials", {
      username,
      password: formData.get("password"),
      redirectTo: "/",
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
