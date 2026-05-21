"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { drinkCategories } from "@/data/drinks";
import { LocalCustomerOrder } from "@/lib/constants";
import {
  readStoredCustomerOrders,
  syncCustomerOrdersResetMarker,
  writeStoredCustomerOrders,
} from "@/lib/customer-orders";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type OrderFormProps = {
  onOrderCreated: (order: LocalCustomerOrder) => void;
};

type OrderDraft = {
  customerName: string;
  categoryId: string;
  drinkId: string;
};

function getApiErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return "Failed to place order.";
  }

  const maybeError = (payload as { error?: unknown }).error;

  if (typeof maybeError === "string") {
    return maybeError;
  }

  if (maybeError && typeof maybeError === "object") {
    const fieldErrors = (maybeError as { fieldErrors?: Record<string, string[] | undefined> })
      .fieldErrors;
    const formErrors = (maybeError as { formErrors?: string[] }).formErrors;

    const firstFieldMessage = fieldErrors
      ? Object.values(fieldErrors).flat().find((message) => typeof message === "string")
      : undefined;

    if (firstFieldMessage) {
      return firstFieldMessage;
    }

    if (formErrors?.[0]) {
      return formErrors[0];
    }
  }

  return "Failed to place order.";
}

export function OrderForm({ onOrderCreated }: OrderFormProps) {
  const [draft, setDraft] = useState<OrderDraft>({
    customerName: "",
    categoryId: "",
    drinkId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const selectedCategory = useMemo(
    () => drinkCategories.find((category) => category.id === draft.categoryId),
    [draft.categoryId],
  );

  const drinks = selectedCategory?.drinks.filter((drink) => drink.isActive) ?? [];
  const selectedDrink = drinks.find((drink) => drink.id === draft.drinkId);

  function updateDraft<K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  }

  function validateDraft() {
    if (draft.customerName.trim().length < 2) {
      return "Please enter the customer's name.";
    }

    if (!draft.categoryId) {
      return "Please choose a category.";
    }

    if (!draft.drinkId) {
      return "Please choose a drink.";
    }

    return null;
  }

  function openConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateDraft();

    if (validationError) {
      setError(validationError);
      setIsConfirmOpen(false);
      return;
    }

    setError(null);
    setIsConfirmOpen(true);
  }

  async function confirmOrder() {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: draft.customerName.trim(),
        categoryId: draft.categoryId,
        drinkId: draft.drinkId,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(getApiErrorMessage(payload));
      setIsSubmitting(false);
      setIsConfirmOpen(false);
      return;
    }

    const nextOrder: LocalCustomerOrder = {
      orderId: payload.orderId,
      orderNo: payload.orderNo,
      customerToken: payload.customerToken,
      customerName: payload.customerName,
      categoryName: payload.categoryName,
      drinkName: payload.drinkName,
      status: payload.status,
      createdAt: payload.createdAt,
    };

    syncCustomerOrdersResetMarker(payload.ordersResetAt ?? null);
    const existingOrders = readStoredCustomerOrders();
    writeStoredCustomerOrders([nextOrder, ...existingOrders]);

    onOrderCreated(nextOrder);
    toast.success(`Order #${payload.orderNo} placed successfully.`);
    setDraft({
      customerName: "",
      categoryId: "",
      drinkId: "",
    });
    setIsSubmitting(false);
    setIsConfirmOpen(false);
  }

  return (
    <>
      <Card className="rounded-[2rem] border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardHeader className="px-6 pt-6">
          <SectionHeader eyebrow="Place an order" title="Pick Your Next Pour" className="mb-0" />
        </CardHeader>

        <CardContent className="px-6 pb-6">
          <form onSubmit={openConfirmation} className="grid gap-5">
            <FormField label="Customer name" htmlFor="customer-name">
              <Input
                id="customer-name"
                value={draft.customerName}
                onChange={(event) => updateDraft("customerName", event.target.value)}
                placeholder="Enter customer name"
                disabled={isSubmitting}
                className="h-12 rounded-2xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>

            <FormField label="Category">
              <NativeSelect
                value={draft.categoryId}
                onChange={(event) => {
                  updateDraft("categoryId", event.target.value);
                  updateDraft("drinkId", "");
                }}
                disabled={isSubmitting}
              >
                <option value="">Choose a category</option>
                {drinkCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Drink">
              <NativeSelect
                value={draft.drinkId}
                onChange={(event) => updateDraft("drinkId", event.target.value)}
                disabled={isSubmitting || !draft.categoryId}
              >
                <option value="">
                  {draft.categoryId ? "Choose a drink" : "Select a category first"}
                </option>
                {drinks.map((drink) => (
                  <option key={drink.id} value={drink.id}>
                    {drink.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <Button
              type="submit"
              disabled={isSubmitting}
              size="lg"
              className="mt-1 h-12 rounded-2xl bg-stone-950 text-sm font-semibold text-white hover:bg-stone-800"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Preparing...
                </span>
              ) : (
                "Review Order"
              )}
            </Button>

            <p className="text-center text-sm text-stone-500">
              Ask Mackanzie for other spirits with mixers or not.
            </p>
          </form>
        </CardContent>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">Confirm order</DialogTitle>
            <DialogDescription className="text-sm text-stone-600">
              Double-check the selection before sending it to the bar queue.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2">
            <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
              <dl className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">Customer</dt>
                  <dd className="font-semibold text-stone-900">{draft.customerName.trim()}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">Category</dt>
                  <dd className="font-semibold text-stone-900">
                    {selectedCategory?.name ?? "-"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">Drink</dt>
                  <dd className="font-semibold text-stone-900">{selectedDrink?.name ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <DialogFooter className="rounded-b-[2rem] border-t border-stone-200 bg-stone-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isSubmitting}
              className="rounded-2xl"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={confirmOrder}
              disabled={isSubmitting}
              className="rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Placing Order...
                </span>
              ) : (
                "Confirm Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
