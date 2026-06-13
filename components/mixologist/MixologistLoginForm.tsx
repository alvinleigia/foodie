"use client";

import { useActionState } from "react";

import { authenticate, type LoginState } from "@/app/mixologist/login/actions";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState: LoginState = {};

export function MixologistLoginForm() {
  const [state, formAction, isPending] = useActionState(authenticate, initialState);

  return (
    <Card className="rounded-xl border-white/60 bg-white/90 shadow-[0_25px_80px_rgba(28,25,23,0.16)]">
      <CardHeader className="px-8 pt-8">
        <CardDescription className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-700">
          Staff Sign In
        </CardDescription>
        <CardTitle className="text-4xl text-stone-950">Mixologist Login</CardTitle>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <form action={formAction} className="grid gap-5">
          <FormField label="Username" htmlFor="mixologist-username">
            <Input
              id="mixologist-username"
              name="username"
              type="text"
              required
              disabled={isPending}
              className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
            />
          </FormField>

          <FormField label="Password" htmlFor="mixologist-password">
            <Input
              id="mixologist-password"
              name="password"
              type="password"
              required
              disabled={isPending}
              className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
            />
          </FormField>

          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

          <Button
            type="submit"
            disabled={isPending}
            size="lg"
            className="mt-1 h-12 rounded-lg bg-stone-950 text-sm font-semibold text-white hover:bg-stone-800"
          >
            {isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
