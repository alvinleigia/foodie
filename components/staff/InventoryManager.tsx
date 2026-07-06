"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CircleOffIcon,
  PackageCheckIcon,
  PackageXIcon,
  PencilLineIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  type FieldErrors,
  getApiErrorMessage,
  getApiValidationErrors,
  getFieldError,
  getFirstFieldError,
  hasFieldErrors,
} from "@/lib/api-client";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InventoryRecord, InventoryStatus } from "@/types/inventory";

type InventoryDraft = {
  currentQuantity: string;
  isTracked: boolean;
  lowStockThreshold: string;
  notes: string;
  unit: string;
};

type InventoryField = keyof InventoryDraft & string;

const statusConfig: Record<
  InventoryStatus,
  {
    className: string;
    icon: typeof PackageCheckIcon;
    label: string;
  }
> = {
  ok: {
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: PackageCheckIcon,
    label: "In stock",
  },
  low: {
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    icon: AlertTriangleIcon,
    label: "Low stock",
  },
  out: {
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    icon: PackageXIcon,
    label: "Out",
  },
  not_tracked: {
    className: "bg-stone-100 text-stone-600 ring-stone-200",
    icon: CircleOffIcon,
    label: "Not tracked",
  },
};

function toDraft(record: InventoryRecord): InventoryDraft {
  return {
    currentQuantity: record.currentQuantity,
    isTracked: record.isTracked,
    lowStockThreshold: record.lowStockThreshold,
    notes: record.notes ?? "",
    unit: record.unit,
  };
}

function formatQuantity(value: string) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue.toLocaleString();
}

export function InventoryManager() {
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, InventoryDraft>>({});
  const [fieldErrorsByItem, setFieldErrorsByItem] = useState<
    Record<string, FieldErrors<InventoryField>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const groupedInventory = useMemo(() => {
    const groups = new Map<string, { categoryName: string; items: InventoryRecord[] }>();

    for (const record of inventory) {
      const group = groups.get(record.categoryId) ?? {
        categoryName: record.categoryName,
        items: [],
      };

      group.items.push(record);
      groups.set(record.categoryId, group);
    }

    return Array.from(groups.entries()).map(([categoryId, group]) => ({
      categoryId,
      ...group,
    }));
  }, [inventory]);

  const inventorySummary = useMemo(
    () => ({
      low: inventory.filter((record) => record.status === "low").length,
      notTracked: inventory.filter((record) => record.status === "not_tracked").length,
      out: inventory.filter((record) => record.status === "out").length,
      tracked: inventory.filter((record) => record.status !== "not_tracked").length,
    }),
    [inventory],
  );

  useEffect(() => {
    async function loadInventory() {
      const response = await fetch("/api/inventory");
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Failed to load inventory.");
        setInventory([]);
        setIsLoading(false);
        return;
      }

      const nextInventory = payload.inventory ?? [];
      setInventory(nextInventory);
      setDrafts(
        Object.fromEntries(
          nextInventory.map((record: InventoryRecord) => [record.menuItemId, toDraft(record)]),
        ),
      );
      setError(null);
      setIsLoading(false);
    }

    void loadInventory();
  }, []);

  function updateDraft(menuItemId: string, patch: Partial<InventoryDraft>) {
    if (editingItemId !== menuItemId) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [menuItemId]: {
        ...(current[menuItemId] ?? {
          currentQuantity: "0.00",
          isTracked: true,
          lowStockThreshold: "0.00",
          notes: "",
          unit: "servings",
        }),
        ...patch,
      },
    }));

    setFieldErrorsByItem((current) => {
      const currentErrors = current[menuItemId];
      if (!currentErrors) {
        return current;
      }

      const nextErrors = { ...currentErrors };
      for (const field of Object.keys(patch) as InventoryField[]) {
        delete nextErrors[field];
      }

      return {
        ...current,
        [menuItemId]: nextErrors,
      };
    });
  }

  function startEditing(record: InventoryRecord) {
    setDrafts((current) => ({
      ...current,
      [record.menuItemId]: toDraft(record),
    }));
    setEditingItemId(record.menuItemId);
    setFieldErrorsByItem((current) => ({ ...current, [record.menuItemId]: {} }));
    setError(null);
  }

  function cancelEditing(record: InventoryRecord) {
    setDrafts((current) => ({
      ...current,
      [record.menuItemId]: toDraft(record),
    }));
    setEditingItemId(null);
    setFieldErrorsByItem((current) => ({ ...current, [record.menuItemId]: {} }));
    setError(null);
  }

  async function saveInventory(record: InventoryRecord) {
    const draft = drafts[record.menuItemId] ?? toDraft(record);
    setPendingAction(record.menuItemId);

    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menuItemId: record.menuItemId,
        ...draft,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      const validation = getApiValidationErrors<InventoryField>(payload);
      const message =
        validation.formError ??
        getFirstFieldError(validation.fieldErrors) ??
        getApiErrorMessage(payload);

      setFieldErrorsByItem((current) => ({
        ...current,
        [record.menuItemId]: validation.fieldErrors,
      }));
      setError(validation.formError);
      if (response.status >= 500 || (!hasFieldErrors(validation.fieldErrors) && !validation.formError)) {
        toast.error(message);
      }
      setPendingAction(null);
      return;
    }

    const nextInventory = payload.inventory ?? [];
    setInventory(nextInventory);
    setDrafts(
      Object.fromEntries(
        nextInventory.map((item: InventoryRecord) => [item.menuItemId, toDraft(item)]),
      ),
    );
    setEditingItemId(null);
    setFieldErrorsByItem((current) => ({ ...current, [record.menuItemId]: {} }));
    setError(null);
    setPendingAction(null);
    toast.success(`${record.itemName} inventory updated.`);
  }

  return (
    <Card className="rounded-xl border-white/60 bg-white/92 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
      <CardHeader className="px-6 pt-6">
        <SectionHeader
          eyebrow="Inventory"
          title="Track product stock"
          description="Manage stock levels for this restaurant location. Inventory records are linked to menu products."
          meta={
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              Location-scoped stock control
            </p>
          }
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-6">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner className="text-stone-500" />
            Loading inventory...
          </div>
        ) : inventory.length === 0 ? (
          <EmptyState
            title="No menu products yet"
            description="Add products in Menu Manager first, then stock records will appear here."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InventorySummaryCard
                icon={PackageCheckIcon}
                label="Tracked products"
                value={inventorySummary.tracked}
                description="Products with live stock control."
                className="text-emerald-700"
              />
              <InventorySummaryCard
                icon={AlertTriangleIcon}
                label="Low stock"
                value={inventorySummary.low}
                description="At or below the alert threshold."
                className="text-amber-700"
              />
              <InventorySummaryCard
                icon={PackageXIcon}
                label="Out of stock"
                value={inventorySummary.out}
                description="Blocked from customer ordering."
                className="text-rose-700"
              />
              <InventorySummaryCard
                icon={CircleOffIcon}
                label="Not tracked"
                value={inventorySummary.notTracked}
                description="Available unless manually sold out."
                className="text-stone-500"
              />
            </div>

            {groupedInventory.map((group) => (
              <Card key={group.categoryId} className="rounded-xl border-stone-200 bg-white shadow-none">
                <CardContent className="space-y-4 px-5 py-5">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-950">{group.categoryName}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                      {group.items.length} products
                    </p>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((record) => {
                      const draft = drafts[record.menuItemId] ?? toDraft(record);
                      const fieldErrors = fieldErrorsByItem[record.menuItemId] ?? {};
                      const isEditing = editingItemId === record.menuItemId;
                      const isAnotherItemEditing = editingItemId !== null && !isEditing;
                      const isSaving = pendingAction === record.menuItemId;
                      const StatusIcon = statusConfig[record.status].icon;

                      return (
                        <div
                          key={record.menuItemId}
                          className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                        >
                          <div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold text-stone-950">
                                  {record.itemName}
                                </p>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${statusConfig[record.status].className}`}
                                >
                                  <StatusIcon className="size-3.5" />
                                  {statusConfig[record.status].label}
                                </span>
                                {record.itemIsSoldOut ? (
                                  <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                    Menu sold out
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-stone-500">
                                Current stock: {formatQuantity(record.currentQuantity)} {record.unit}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-4">
                            <FormField
                              label="Current quantity"
                              error={getFieldError(fieldErrors, "currentQuantity")}
                              errorId={`inventory-current-quantity-${record.menuItemId}`}
                            >
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.currentQuantity}
                                disabled={!isEditing || isSaving}
                                aria-invalid={Boolean(getFieldError(fieldErrors, "currentQuantity"))}
                                aria-describedby={
                                  getFieldError(fieldErrors, "currentQuantity")
                                    ? `inventory-current-quantity-${record.menuItemId}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  updateDraft(record.menuItemId, {
                                    currentQuantity: event.target.value,
                                  })
                                }
                              />
                            </FormField>
                            <FormField
                              label="Low stock alert"
                              error={getFieldError(fieldErrors, "lowStockThreshold")}
                              errorId={`inventory-low-stock-${record.menuItemId}`}
                            >
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.lowStockThreshold}
                                disabled={!isEditing || isSaving}
                                aria-invalid={Boolean(getFieldError(fieldErrors, "lowStockThreshold"))}
                                aria-describedby={
                                  getFieldError(fieldErrors, "lowStockThreshold")
                                    ? `inventory-low-stock-${record.menuItemId}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  updateDraft(record.menuItemId, {
                                    lowStockThreshold: event.target.value,
                                  })
                                }
                              />
                            </FormField>
                            <FormField
                              label="Unit"
                              error={getFieldError(fieldErrors, "unit")}
                              errorId={`inventory-unit-${record.menuItemId}`}
                            >
                              <Input
                                value={draft.unit}
                                disabled={!isEditing || isSaving}
                                aria-invalid={Boolean(getFieldError(fieldErrors, "unit"))}
                                aria-describedby={
                                  getFieldError(fieldErrors, "unit")
                                    ? `inventory-unit-${record.menuItemId}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  updateDraft(record.menuItemId, { unit: event.target.value })
                                }
                              />
                            </FormField>
                            <div className="md:mt-6">
                              <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
                                <Checkbox
                                  checked={draft.isTracked}
                                  disabled={!isEditing || isSaving}
                                  onCheckedChange={(checked) =>
                                    updateDraft(record.menuItemId, {
                                      isTracked: checked === true,
                                    })
                                  }
                                />
                                Track stock
                              </label>
                              {getFieldError(fieldErrors, "isTracked") ? (
                                <p className="mt-2 text-sm text-rose-600">
                                  {getFieldError(fieldErrors, "isTracked")}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-4">
                            <FormField
                              label="Inventory notes"
                              error={getFieldError(fieldErrors, "notes")}
                              errorId={`inventory-notes-${record.menuItemId}`}
                            >
                              <Textarea
                                rows={2}
                                value={draft.notes}
                                disabled={!isEditing || isSaving}
                                aria-invalid={Boolean(getFieldError(fieldErrors, "notes"))}
                                aria-describedby={
                                  getFieldError(fieldErrors, "notes")
                                    ? `inventory-notes-${record.menuItemId}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  updateDraft(record.menuItemId, { notes: event.target.value })
                                }
                                placeholder="Supplier, storage notes, batch reminders..."
                              />
                            </FormField>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => cancelEditing(record)}
                                  disabled={isSaving}
                                  className="min-h-10 rounded-lg"
                                >
                                  <XIcon className="size-4" />
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => void saveInventory(record)}
                                  disabled={isSaving}
                                  className="min-h-10 rounded-lg bg-stone-950 text-white hover:bg-stone-800"
                                >
                                  {isSaving ? (
                                    <Spinner className="text-white" />
                                  ) : (
                                    <SaveIcon className="size-4" />
                                  )}
                                  Save
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => startEditing(record)}
                                disabled={Boolean(pendingAction) || isAnotherItemEditing}
                                className="min-h-10 rounded-lg"
                              >
                                <PencilLineIcon className="size-4" />
                                Edit inventory
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventorySummaryCard({
  className,
  description,
  icon: Icon,
  label,
  value,
}: {
  className: string;
  description: string;
  icon: typeof PackageCheckIcon;
  label: string;
  value: number;
}) {
  return (
    <Card className="rounded-xl border-stone-200 bg-white shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-stone-950">{value}</p>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
        <Icon className={`mt-1 size-5 ${className}`} />
      </CardContent>
    </Card>
  );
}
