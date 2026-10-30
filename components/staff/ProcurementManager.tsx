"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2Icon,
  ClipboardListIcon,
  PackageCheckIcon,
  PencilLineIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { TableSectionSkeleton } from "@/components/shared/SectionSkeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, requestJson } from "@/lib/api-client";
import { formatAppDate, formatAppDateTime } from "@/lib/date-format";
import type {
  InventoryProcurementConfiguration,
  InventorySupplierRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
} from "@/types/inventory-procurement";

type SupplierDraft = {
  id: string | null;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accountReference: string;
  notes: string;
  isActive: boolean;
};

type PurchaseOrderLineDraft = {
  enabled: boolean;
  orderedQuantity: string;
  unitCost: string;
  notes: string;
};

const emptySupplier: SupplierDraft = {
  id: null,
  name: "",
  contactName: "",
  email: "",
  phone: "",
  accountReference: "",
  notes: "",
  isActive: true,
};

const statusLabels: Record<PurchaseOrderStatus, string> = {
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Part received",
  RECEIVED: "Received",
};

const statusClasses: Record<PurchaseOrderStatus, string> = {
  CANCELLED: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  DRAFT: "border-border bg-muted text-muted-foreground",
  ORDERED: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  PARTIALLY_RECEIVED: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  RECEIVED: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function formatQuantity(value: string) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(value));
}

export function ProcurementManager() {
  const [configuration, setConfiguration] =
    useState<InventoryProcurementConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [supplierDraft, setSupplierDraft] =
    useState<SupplierDraft>(emptySupplier);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [isPurchaseOrderDialogOpen, setIsPurchaseOrderDialogOpen] =
    useState(false);
  const [editingPurchaseOrderId, setEditingPurchaseOrderId] = useState<
    string | null
  >(null);
  const [purchaseOrderSupplierId, setPurchaseOrderSupplierId] = useState("");
  const [purchaseOrderExpectedOn, setPurchaseOrderExpectedOn] = useState("");
  const [purchaseOrderNotes, setPurchaseOrderNotes] = useState("");
  const [purchaseOrderLines, setPurchaseOrderLines] = useState<
    Record<string, PurchaseOrderLineDraft>
  >({});
  const [receivingOrder, setReceivingOrder] =
    useState<PurchaseOrderRecord | null>(null);
  const [receiptQuantities, setReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptIdempotencyKey, setReceiptIdempotencyKey] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setConfiguration(
          await fetchJson<InventoryProcurementConfiguration>(
            "/api/inventory/procurement",
            { fallbackError: "Failed to load procurement." },
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load procurement.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const activeSuppliers = useMemo(
    () => configuration?.suppliers.filter((supplier) => supplier.isActive) ?? [],
    [configuration],
  );
  const activeIngredients = useMemo(
    () =>
      configuration?.ingredients.filter((ingredient) => ingredient.isActive) ?? [],
    [configuration],
  );

  function openSupplier(supplier?: InventorySupplierRecord) {
    setSupplierDraft(
      supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            contactName: supplier.contactName ?? "",
            email: supplier.email ?? "",
            phone: supplier.phone ?? "",
            accountReference: supplier.accountReference ?? "",
            notes: supplier.notes ?? "",
            isActive: supplier.isActive,
          }
        : emptySupplier,
    );
    setIsSupplierDialogOpen(true);
  }

  async function saveSupplier() {
    setPendingAction("supplier");
    try {
      const result = await requestJson<InventoryProcurementConfiguration>(
        "/api/inventory/suppliers",
        {
          body: {
            ...supplierDraft,
            id: supplierDraft.id ?? undefined,
          },
          fallbackError: "Failed to save supplier.",
        },
      );
      setConfiguration(result);
      setIsSupplierDialogOpen(false);
      toast.success(supplierDraft.id ? "Supplier updated." : "Supplier added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save supplier.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function openPurchaseOrder(purchaseOrder?: PurchaseOrderRecord) {
    setEditingPurchaseOrderId(purchaseOrder?.id ?? null);
    setPurchaseOrderSupplierId(
      purchaseOrder?.supplierId ?? activeSuppliers[0]?.id ?? "",
    );
    setPurchaseOrderExpectedOn(purchaseOrder?.expectedOn ?? "");
    setPurchaseOrderNotes(purchaseOrder?.notes ?? "");
    const existingLines = new Map(
      purchaseOrder?.lines.map((line) => [line.ingredientId, line]) ?? [],
    );
    setPurchaseOrderLines(
      Object.fromEntries(
        activeIngredients.map((ingredient) => {
          const line = existingLines.get(ingredient.id);
          return [
            ingredient.id,
            {
              enabled: Boolean(line),
              orderedQuantity: line ? formatQuantity(line.orderedQuantity) : "",
              unitCost: line?.unitCost ? String(Number(line.unitCost)) : "",
              notes: line?.notes ?? "",
            },
          ];
        }),
      ),
    );
    setIsPurchaseOrderDialogOpen(true);
  }

  function updatePurchaseOrderLine(
    ingredientId: string,
    update: Partial<PurchaseOrderLineDraft>,
  ) {
    setPurchaseOrderLines((current) => ({
      ...current,
      [ingredientId]: {
        ...current[ingredientId],
        ...update,
      },
    }));
  }

  async function createPurchaseOrder() {
    setPendingAction("create-order");
    try {
      const result = await requestJson<InventoryProcurementConfiguration>(
        editingPurchaseOrderId
          ? `/api/inventory/purchase-orders/${editingPurchaseOrderId}`
          : "/api/inventory/purchase-orders",
        {
          body: {
            supplierId: purchaseOrderSupplierId,
            expectedOn: purchaseOrderExpectedOn,
            notes: purchaseOrderNotes,
            lines: Object.entries(purchaseOrderLines)
              .filter(([, line]) => line.enabled)
              .map(([ingredientId, line]) => ({
                ingredientId,
                orderedQuantity: line.orderedQuantity,
                unitCost: line.unitCost,
                notes: line.notes,
              })),
          },
          fallbackError: editingPurchaseOrderId
            ? "Failed to update purchase order."
            : "Failed to create purchase order.",
          method: editingPurchaseOrderId ? "PUT" : "POST",
        },
      );
      setConfiguration(result);
      setIsPurchaseOrderDialogOpen(false);
      toast.success(
        editingPurchaseOrderId
          ? "Purchase order draft updated."
          : "Purchase order created as a draft.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create purchase order.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateStatus(
    purchaseOrder: PurchaseOrderRecord,
    action: "CANCEL" | "ORDER",
  ) {
    setPendingAction(`${action}-${purchaseOrder.id}`);
    try {
      setConfiguration(
        await requestJson<InventoryProcurementConfiguration>(
          `/api/inventory/purchase-orders/${purchaseOrder.id}/status`,
          {
            body: { action },
            fallbackError: "Failed to update purchase order.",
          },
        ),
      );
      toast.success(action === "ORDER" ? "Purchase order placed." : "Purchase order cancelled.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update purchase order.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function openReceipt(purchaseOrder: PurchaseOrderRecord) {
    setReceivingOrder(purchaseOrder);
    setReceiptQuantities(
      Object.fromEntries(
        purchaseOrder.lines
          .filter((line) => Number(line.outstandingQuantity) > 0)
          .map((line) => [line.id, formatQuantity(line.outstandingQuantity)]),
      ),
    );
    setReceiptNotes("");
    setReceiptIdempotencyKey(crypto.randomUUID());
  }

  async function receiveStock() {
    if (!receivingOrder) return;
    setPendingAction(`receive-${receivingOrder.id}`);
    try {
      const result = await requestJson<InventoryProcurementConfiguration>(
        `/api/inventory/purchase-orders/${receivingOrder.id}/receipts`,
        {
          body: {
            idempotencyKey: receiptIdempotencyKey,
            notes: receiptNotes,
            lines: Object.entries(receiptQuantities)
              .filter(([, quantity]) => Number(quantity) > 0)
              .map(([purchaseOrderItemId, quantity]) => ({
                purchaseOrderItemId,
                quantity,
              })),
          },
          fallbackError: "Failed to receive stock.",
        },
      );
      setConfiguration(result);
      setReceivingOrder(null);
      toast.success("Stock receipt recorded.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to receive stock.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading) {
    return <TableSectionSkeleton label="Loading procurement" rows={4} />;
  }
  if (!configuration) return null;

  return (
    <>
      <Card className="mt-5">
        <CardHeader>
          <h2 className="text-xl font-semibold">Procurement</h2>
          <p className="text-sm text-muted-foreground">
            Manage suppliers, purchase orders and ingredient receipts.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">
                <ClipboardListIcon className="size-4" />
                Purchase orders
              </TabsTrigger>
              <TabsTrigger value="suppliers">
                <Building2Icon className="size-4" />
                Suppliers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="grid gap-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => openPurchaseOrder()}
                  disabled={!activeSuppliers.length || !activeIngredients.length}
                >
                  <ButtonLabel icon={PlusIcon}>New purchase order</ButtonLabel>
                </Button>
              </div>
              {!activeSuppliers.length || !activeIngredients.length ? (
                <EmptyState
                  title="Procurement setup required"
                  description="Add an active supplier and ingredient before creating a purchase order."
                />
              ) : configuration.purchaseOrders.length ? (
                <div className="divide-y divide-border border-y border-border">
                  {configuration.purchaseOrders.map((purchaseOrder) => (
                    <div key={purchaseOrder.id} className="grid gap-4 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">
                              {purchaseOrder.reference}
                            </h3>
                            <span
                              className={`rounded border px-2 py-0.5 text-xs font-medium ${statusClasses[purchaseOrder.status]}`}
                            >
                              {statusLabels[purchaseOrder.status]}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {purchaseOrder.supplierName} · Created{" "}
                            {formatAppDate(purchaseOrder.createdAt)}
                            {purchaseOrder.expectedOn
                              ? ` · Expected ${formatAppDate(purchaseOrder.expectedOn)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {purchaseOrder.status === "DRAFT" ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openPurchaseOrder(purchaseOrder)}
                                disabled={pendingAction !== null}
                              >
                                <ButtonLabel icon={PencilLineIcon}>
                                  Edit draft
                                </ButtonLabel>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void updateStatus(purchaseOrder, "ORDER")}
                                disabled={pendingAction !== null}
                              >
                                <ButtonLabel icon={SendIcon}>Place order</ButtonLabel>
                              </Button>
                            </>
                          ) : null}
                          {["ORDERED", "PARTIALLY_RECEIVED"].includes(
                            purchaseOrder.status,
                          ) ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => openReceipt(purchaseOrder)}
                              disabled={pendingAction !== null}
                            >
                              <ButtonLabel icon={PackageCheckIcon}>
                                Receive stock
                              </ButtonLabel>
                            </Button>
                          ) : null}
                          {!['CANCELLED', 'RECEIVED'].includes(
                            purchaseOrder.status,
                          ) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void updateStatus(purchaseOrder, "CANCEL")}
                              disabled={pendingAction !== null}
                            >
                              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[680px] text-left text-sm">
                          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">Ingredient</th>
                              <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                              <th className="px-4 py-2.5 text-right font-medium">Received</th>
                              <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                              <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {purchaseOrder.lines.map((line) => (
                              <tr key={line.id}>
                                <td className="px-4 py-3 font-medium">
                                  {line.ingredientName}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatQuantity(line.orderedQuantity)} {line.unit}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatQuantity(line.receivedQuantity)} {line.unit}
                                </td>
                                <td className="px-4 py-3 text-right font-medium">
                                  {formatQuantity(line.outstandingQuantity)} {line.unit}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {line.unitCost
                                    ? formatMoney(line.unitCost, purchaseOrder.currency)
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
                        <span>
                          {purchaseOrder.receipts.length} receipt
                          {purchaseOrder.receipts.length === 1 ? "" : "s"}
                          {purchaseOrder.receipts[0]
                            ? ` · Last received ${formatAppDateTime(purchaseOrder.receipts[0].createdAt)}`
                            : ""}
                        </span>
                        <span className="font-medium text-foreground">
                          {purchaseOrder.totalCost
                            ? `Order total ${formatMoney(purchaseOrder.totalCost, purchaseOrder.currency)}`
                            : "Order total not fully priced"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No purchase orders yet"
                  description="Create a draft order, place it and receive ingredient stock against it."
                />
              )}
            </TabsContent>

            <TabsContent value="suppliers" className="grid gap-4">
              <div className="flex justify-end">
                <Button type="button" onClick={() => openSupplier()}>
                  <ButtonLabel icon={PlusIcon}>Add supplier</ButtonLabel>
                </Button>
              </div>
              {configuration.suppliers.length ? (
                <div className="divide-y divide-border border-y border-border">
                  {configuration.suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{supplier.name}</p>
                          {!supplier.isActive ? (
                            <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[supplier.contactName, supplier.email, supplier.phone]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openSupplier(supplier)}
                      >
                        <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No suppliers yet"
                  description="Add a supplier before creating purchase orders."
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {supplierDraft.id ? "Edit supplier" : "Add supplier"}
            </DialogTitle>
            <DialogDescription>
              Contact and account details used for restaurant purchasing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <FormField label="Supplier name" tone="themed" className="sm:col-span-2">
              <Input
                value={supplierDraft.name}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Contact name" tone="themed">
              <Input
                value={supplierDraft.contactName}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    contactName: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Account reference" tone="themed">
              <Input
                value={supplierDraft.accountReference}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    accountReference: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Email" tone="themed">
              <Input
                type="email"
                value={supplierDraft.email}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Phone" tone="themed">
              <Input
                value={supplierDraft.phone}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Notes" tone="themed" className="sm:col-span-2">
              <Textarea
                value={supplierDraft.notes}
                onChange={(event) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </FormField>
            <label className="flex items-center gap-3 sm:col-span-2">
              <Checkbox
                checked={supplierDraft.isActive}
                onCheckedChange={(checked) =>
                  setSupplierDraft((current) => ({
                    ...current,
                    isActive: checked === true,
                  }))
                }
              />
              <span>Supplier is active</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSupplierDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveSupplier()}
              disabled={pendingAction !== null}
            >
              Save supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPurchaseOrderDialogOpen}
        onOpenChange={setIsPurchaseOrderDialogOpen}
      >
        <DialogContent className="p-0 sm:max-w-4xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {editingPurchaseOrderId ? "Edit purchase order" : "New purchase order"}
            </DialogTitle>
            <DialogDescription>
              Create a draft with ingredient quantities and optional unit costs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Supplier" tone="themed">
                <NativeSelect
                  value={purchaseOrderSupplierId}
                  onChange={(event) =>
                    setPurchaseOrderSupplierId(event.target.value)
                  }
                >
                  {activeSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Expected date" tone="themed">
                <Input
                  type="date"
                  value={purchaseOrderExpectedOn}
                  onChange={(event) => setPurchaseOrderExpectedOn(event.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Order notes" tone="themed">
              <Textarea
                value={purchaseOrderNotes}
                onChange={(event) => setPurchaseOrderNotes(event.target.value)}
              />
            </FormField>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3"><span className="sr-only">Include</span></th>
                    <th className="px-4 py-3 font-medium">Ingredient</th>
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Unit cost</th>
                    <th className="px-4 py-3 font-medium">Line note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeIngredients.map((ingredient) => {
                    const line = purchaseOrderLines[ingredient.id];
                    return (
                      <tr key={ingredient.id}>
                        <td className="px-4 py-3">
                          <Checkbox
                            aria-label={`Include ${ingredient.name}`}
                            checked={line?.enabled ?? false}
                            onCheckedChange={(checked) =>
                              updatePurchaseOrderLine(ingredient.id, {
                                enabled: checked === true,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {ingredient.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {ingredient.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            aria-label={`${ingredient.name} ordered quantity`}
                            type="number"
                            min="0.001"
                            step="0.001"
                            disabled={!line?.enabled}
                            value={line?.orderedQuantity ?? ""}
                            onChange={(event) =>
                              updatePurchaseOrderLine(ingredient.id, {
                                orderedQuantity: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            aria-label={`${ingredient.name} unit cost`}
                            type="number"
                            min="0"
                            step="0.0001"
                            disabled={!line?.enabled}
                            value={line?.unitCost ?? ""}
                            onChange={(event) =>
                              updatePurchaseOrderLine(ingredient.id, {
                                unitCost: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            aria-label={`${ingredient.name} line note`}
                            disabled={!line?.enabled}
                            value={line?.notes ?? ""}
                            onChange={(event) =>
                              updatePurchaseOrderLine(ingredient.id, {
                                notes: event.target.value,
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPurchaseOrderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void createPurchaseOrder()}
              disabled={pendingAction !== null}
            >
              {editingPurchaseOrderId ? "Save draft" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receivingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setReceivingOrder(null);
        }}
      >
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Receive {receivingOrder?.reference}</DialogTitle>
            <DialogDescription>
              Confirm quantities delivered now. Outstanding quantities remain open.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto px-6 py-5">
            {receivingOrder?.lines
              .filter((line) => Number(line.outstandingQuantity) > 0)
              .map((line) => (
                <div
                  key={line.id}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
                >
                  <div>
                    <p className="font-medium">{line.ingredientName}</p>
                    <p className="text-sm text-muted-foreground">
                      Outstanding {formatQuantity(line.outstandingQuantity)} {line.unit}
                    </p>
                  </div>
                  <FormField label={`Received ${line.unit}`} tone="themed">
                    <Input
                      aria-label={`${line.ingredientName} received quantity`}
                      type="number"
                      min="0"
                      max={line.outstandingQuantity}
                      step="0.001"
                      value={receiptQuantities[line.id] ?? ""}
                      onChange={(event) =>
                        setReceiptQuantities((current) => ({
                          ...current,
                          [line.id]: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                </div>
              ))}
            <FormField label="Receipt note" tone="themed">
              <Textarea
                value={receiptNotes}
                onChange={(event) => setReceiptNotes(event.target.value)}
                placeholder="Delivery note, batch or discrepancy details"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReceivingOrder(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void receiveStock()}
              disabled={pendingAction !== null}
            >
              <ButtonLabel icon={PackageCheckIcon}>Confirm receipt</ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
