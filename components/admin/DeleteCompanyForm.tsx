"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DeleteCompanyFormProps = {
  companyId: string;
  companyName: string;
};

function getApiError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      return error;
    }
  }

  return "Action failed.";
}

export function DeleteCompanyForm({
  companyId,
  companyName,
}: DeleteCompanyFormProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function submitDelete() {
    setIsDeleting(true);
    const response = await fetch(`/api/platform/companies/${companyId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiError(payload);
      setError(message);
      toast.error(message);
      setIsDeleting(false);
      return;
    }

    toast.success("Company deleted.");
    router.push("/platform");
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-rose-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Delete company</h3>
        <p className="text-sm leading-6 text-stone-500">
          This permanently deletes <span className="font-semibold text-stone-950">{companyName}</span>,
          including child restaurants, locations, staff assignments, menus, inventory and orders.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitDelete();
          }}
        >
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
            Export company data first if you need a backup. This action cannot be undone.
          </div>
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            Type DELETE to confirm
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              className="bg-white"
            />
          </label>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              variant="destructive"
              disabled={isDeleting || confirmation !== "DELETE"}
              className="rounded-lg"
            >
              {isDeleting ? "Deleting..." : "Delete company"}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href="/platform">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
