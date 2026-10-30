"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheckIcon,
  PackagePlusIcon,
  PencilLineIcon,
  PlusIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { TableSectionSkeleton } from "@/components/shared/SectionSkeletons";
import { useFormValidation } from "@/components/shared/useFormValidation";
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
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, requestJson } from "@/lib/api-client";
import { formatAppDateTime } from "@/lib/date-format";
import type {
  IngredientInventoryConfiguration,
  IngredientMovementType,
  IngredientRecord,
} from "@/types/ingredient-inventory";

type IngredientDraft = {
  id: string | null;
  name: string;
  unit: string;
  currentQuantity: string;
  lowStockThreshold: string;
  notes: string;
  isActive: boolean;
};

type IngredientField =
  | "currentQuantity"
  | "isActive"
  | "lowStockThreshold"
  | "name"
  | "notes"
  | "unit";

type MovementAction = "ADJUSTMENT" | "RECEIPT" | "STOCKTAKE" | "WASTE";

const movementOptions: Array<{
  value: MovementAction;
  label: string;
}> = [
  { value: "RECEIPT", label: "Receive stock" },
  { value: "WASTE", label: "Record waste" },
  { value: "ADJUSTMENT", label: "Adjust stock" },
  { value: "STOCKTAKE", label: "Stock count" },
];

const movementLabels: Record<IngredientMovementType, string> = {
  ADJUSTMENT: "Adjustment",
  OPENING: "Opening",
  RECEIPT: "Receipt",
  RESTORE: "Restored",
  SALE: "Order use",
  STOCKTAKE: "Stock count",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  WASTE: "Waste",
};

const emptyIngredient: IngredientDraft = {
  id: null,
  name: "",
  unit: "g",
  currentQuantity: "0",
  lowStockThreshold: "0",
  notes: "",
  isActive: true,
};

function formatQuantity(value: string) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

function getRecipeDraft(
  configuration: IngredientInventoryConfiguration,
  productId: string,
) {
  const recipe =
    configuration.products.find((product) => product.id === productId)?.recipe ?? [];

  return Object.fromEntries(
    recipe.map((line) => [line.ingredientId, formatQuantity(line.quantity)]),
  );
}

export function IngredientRecipeManager() {
  const [configuration, setConfiguration] =
    useState<IngredientInventoryConfiguration | null>(null);
  const [ingredientDraft, setIngredientDraft] =
    useState<IngredientDraft>(emptyIngredient);
  const [isIngredientDialogOpen, setIsIngredientDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [recipeDraft, setRecipeDraft] = useState<Record<string, string>>({});
  const [movementIngredientId, setMovementIngredientId] = useState("");
  const [movementAction, setMovementAction] =
    useState<MovementAction>("RECEIPT");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const ingredientValidation = useFormValidation<IngredientField>();

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchJson<IngredientInventoryConfiguration>(
          "/api/inventory/ingredients",
          { fallbackError: "Failed to load ingredients and recipes." },
        );
        const firstProductId = result.products[0]?.id ?? "";
        setConfiguration(result);
        setSelectedProductId(firstProductId);
        setMovementIngredientId(result.ingredients[0]?.id ?? "");
        setRecipeDraft(getRecipeDraft(result, firstProductId));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load ingredients and recipes.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const selectedProduct = useMemo(
    () =>
      configuration?.products.find((product) => product.id === selectedProductId) ??
      null,
    [configuration, selectedProductId],
  );

  const availableIngredients = useMemo(
    () =>
      configuration?.ingredients.filter(
        (ingredient) => ingredient.isActive || recipeDraft[ingredient.id] !== undefined,
      ) ?? [],
    [configuration, recipeDraft],
  );

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    if (configuration) {
      setRecipeDraft(getRecipeDraft(configuration, productId));
    }
  }

  function openCreateIngredient() {
    setIngredientDraft(emptyIngredient);
    ingredientValidation.clearErrors();
    setIsIngredientDialogOpen(true);
  }

  function openEditIngredient(ingredient: IngredientRecord) {
    setIngredientDraft({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      currentQuantity: formatQuantity(ingredient.currentQuantity),
      lowStockThreshold: formatQuantity(ingredient.lowStockThreshold),
      notes: ingredient.notes ?? "",
      isActive: ingredient.isActive,
    });
    ingredientValidation.clearErrors();
    setIsIngredientDialogOpen(true);
  }

  function updateIngredient<Field extends IngredientField>(
    field: Field,
    value: IngredientDraft[Field],
  ) {
    ingredientValidation.clearFieldError(field);
    setIngredientDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveIngredient() {
    setIsSavingIngredient(true);
    ingredientValidation.clearErrors();

    try {
      const result = await requestJson<IngredientInventoryConfiguration>(
        "/api/inventory/ingredients",
        {
          body: {
            ...ingredientDraft,
            id: ingredientDraft.id ?? undefined,
          },
          fallbackError: "Failed to save ingredient.",
        },
      );
      setConfiguration(result);
      setRecipeDraft(getRecipeDraft(result, selectedProductId));
      setIsIngredientDialogOpen(false);
      toast.success(ingredientDraft.id ? "Ingredient updated." : "Ingredient added.");
    } catch (error) {
      const result = ingredientValidation.applyCaught(
        error,
        "Failed to save ingredient.",
      );
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
    } finally {
      setIsSavingIngredient(false);
    }
  }

  function toggleRecipeIngredient(ingredientId: string, enabled: boolean) {
    setRecipeDraft((current) => {
      const next = { ...current };
      if (enabled) {
        next[ingredientId] = next[ingredientId] ?? "1";
      } else {
        delete next[ingredientId];
      }
      return next;
    });
  }

  async function saveRecipe() {
    if (!selectedProductId) {
      return;
    }

    setIsSavingRecipe(true);
    try {
      const result = await requestJson<IngredientInventoryConfiguration>(
        "/api/inventory/recipes",
        {
          body: {
            menuItemId: selectedProductId,
            ingredients: Object.entries(recipeDraft).map(
              ([ingredientId, quantity]) => ({ ingredientId, quantity }),
            ),
          },
          fallbackError: "Failed to save recipe.",
        },
      );
      setConfiguration(result);
      setRecipeDraft(getRecipeDraft(result, selectedProductId));
      toast.success("Recipe saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save recipe.");
    } finally {
      setIsSavingRecipe(false);
    }
  }

  async function saveMovement() {
    if (!movementIngredientId) {
      toast.error("Choose an ingredient.");
      return;
    }

    setIsSavingMovement(true);
    try {
      const result = await requestJson<IngredientInventoryConfiguration>(
        "/api/inventory/movements",
        {
          body: {
            ingredientId: movementIngredientId,
            action: movementAction,
            quantity: movementQuantity,
            reason: movementReason,
          },
          fallbackError: "Failed to record stock movement.",
        },
      );
      setConfiguration(result);
      setMovementQuantity("");
      setMovementReason("");
      toast.success("Stock movement recorded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to record stock movement.",
      );
    } finally {
      setIsSavingMovement(false);
    }
  }

  if (isLoading) {
    return <TableSectionSkeleton label="Loading ingredient inventory" rows={4} />;
  }

  if (!configuration) {
    return null;
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Ingredients</h2>
              <p className="text-sm text-muted-foreground">
                Track reusable stock in a consistent base unit.
              </p>
            </div>
            <Button type="button" size="sm" onClick={openCreateIngredient}>
              <ButtonLabel icon={PlusIcon}>Add ingredient</ButtonLabel>
            </Button>
          </CardHeader>
          <CardContent>
            {configuration.ingredients.length ? (
              <div className="divide-y divide-border border-y border-border">
                {configuration.ingredients.map((ingredient) => {
                  const isLow =
                    Number(ingredient.lowStockThreshold) > 0 &&
                    Number(ingredient.currentQuantity) <=
                      Number(ingredient.lowStockThreshold);

                  return (
                    <div
                      key={ingredient.id}
                      className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{ingredient.name}</p>
                          {!ingredient.isActive ? (
                            <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Inactive
                            </span>
                          ) : isLow ? (
                            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                              Low stock
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatQuantity(ingredient.currentQuantity)} {ingredient.unit}
                          {ingredient.recipeUsageCount
                            ? ` · Used in ${ingredient.recipeUsageCount} recipe${ingredient.recipeUsageCount === 1 ? "" : "s"}`
                            : " · Not used in a recipe"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditIngredient(ingredient)}
                      >
                        <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-3">
                <EmptyState
                  title="No ingredients yet"
                  description="Add an ingredient before building product recipes."
                />
                <div className="flex justify-center">
                  <Button type="button" onClick={openCreateIngredient}>
                    <ButtonLabel icon={PlusIcon}>Add ingredient</ButtonLabel>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Product recipes</h2>
            <p className="text-sm text-muted-foreground">
              Define how much ingredient stock one product consumes.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            {configuration.products.length ? (
              <>
                <FormField label="Menu product" tone="themed">
                  <NativeSelect
                    value={selectedProductId}
                    onChange={(event) => selectProduct(event.target.value)}
                    className="w-full"
                  >
                    {configuration.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.categoryName} · {product.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>

                {configuration.ingredients.length ? (
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">Ingredients per item</p>
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(recipeDraft).length} selected
                      </span>
                    </div>
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {availableIngredients.map((ingredient) => {
                        const isSelected = recipeDraft[ingredient.id] !== undefined;

                        return (
                          <div
                            key={ingredient.id}
                            className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
                          >
                            <label className="flex min-w-0 items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  toggleRecipeIngredient(
                                    ingredient.id,
                                    checked === true,
                                  )
                                }
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">
                                  {ingredient.name}
                                </span>
                                {!ingredient.isActive ? (
                                  <span className="text-xs text-muted-foreground">
                                    Inactive ingredient
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            <div className="flex items-center gap-2">
                              <Input
                                aria-label={`${ingredient.name} quantity`}
                                inputMode="decimal"
                                min="0.001"
                                step="0.001"
                                type="number"
                                value={recipeDraft[ingredient.id] ?? ""}
                                disabled={!isSelected}
                                onChange={(event) =>
                                  setRecipeDraft((current) => ({
                                    ...current,
                                    [ingredient.id]: event.target.value,
                                  }))
                                }
                              />
                              <span className="w-12 text-sm text-muted-foreground">
                                {ingredient.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => void saveRecipe()}
                        disabled={isSavingRecipe || !selectedProduct}
                      >
                        <ButtonLabel icon={SaveIcon}>
                          Save recipe
                        </ButtonLabel>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Add ingredients first"
                    description="Recipes become available once this restaurant has ingredient stock."
                  />
                )}
              </>
            ) : (
              <EmptyState
                title="No menu products"
                description="Add products in Menu Manager before creating recipes."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <h2 className="text-xl font-semibold">Stock movements</h2>
          <p className="text-sm text-muted-foreground">
            Record deliveries, waste, corrections and physical stock counts.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5">
          {configuration.ingredients.length ? (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(9rem,0.6fr)_minmax(14rem,1.4fr)_auto] lg:items-end">
              <FormField label="Ingredient" tone="themed">
                <NativeSelect
                  value={movementIngredientId}
                  onChange={(event) =>
                    setMovementIngredientId(event.target.value)
                  }
                  className="w-full"
                >
                  {configuration.ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name} ({formatQuantity(ingredient.currentQuantity)}{" "}
                      {ingredient.unit})
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Movement" tone="themed">
                <NativeSelect
                  value={movementAction}
                  onChange={(event) =>
                    setMovementAction(event.target.value as MovementAction)
                  }
                  className="w-full"
                >
                  {movementOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label={
                  movementAction === "STOCKTAKE"
                    ? "Counted quantity"
                    : movementAction === "ADJUSTMENT"
                      ? "Change (+/-)"
                      : "Quantity"
                }
                tone="themed"
              >
                <Input
                  type="number"
                  step="0.001"
                  min={
                    movementAction === "STOCKTAKE" ||
                    movementAction === "RECEIPT" ||
                    movementAction === "WASTE"
                      ? "0"
                      : undefined
                  }
                  inputMode="decimal"
                  value={movementQuantity}
                  onChange={(event) => setMovementQuantity(event.target.value)}
                />
              </FormField>
              <FormField label="Reason" tone="themed">
                <Input
                  value={movementReason}
                  maxLength={240}
                  placeholder="Delivery, damage, count correction..."
                  onChange={(event) => setMovementReason(event.target.value)}
                />
              </FormField>
              <Button
                type="button"
                onClick={() => void saveMovement()}
                disabled={isSavingMovement}
              >
                <ButtonLabel
                  icon={
                    movementAction === "RECEIPT"
                      ? PackagePlusIcon
                      : movementAction === "WASTE"
                        ? Trash2Icon
                        : movementAction === "STOCKTAKE"
                          ? ClipboardCheckIcon
                          : SlidersHorizontalIcon
                  }
                >
                  Record
                </ButtonLabel>
              </Button>
            </div>
          ) : null}

          {configuration.movements.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Ingredient</th>
                    <th className="px-4 py-3 font-medium">Movement</th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Recorded by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {configuration.movements.map((movement) => {
                    const delta = Number(movement.quantityDelta);
                    return (
                      <tr key={movement.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatAppDateTime(movement.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {movement.ingredientName}
                        </td>
                        <td className="px-4 py-3">
                          {movementLabels[movement.movementType]}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                            delta < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : delta > 0
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatQuantity(movement.quantityDelta)} {movement.unit}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {formatQuantity(movement.quantityBefore)} to{" "}
                          {formatQuantity(movement.quantityAfter)} {movement.unit}
                        </td>
                        <td className="max-w-60 px-4 py-3 text-muted-foreground">
                          {movement.reason ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {movement.recordedByName ?? "System"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No stock movements yet"
              description="Opening quantities and future stock changes will appear here."
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isIngredientDialogOpen}
        onOpenChange={setIsIngredientDialogOpen}
      >
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {ingredientDraft.id ? "Edit ingredient" : "Add ingredient"}
            </DialogTitle>
            <DialogDescription>
              Use one base unit consistently in stock counts and product recipes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <FormField
              label="Ingredient name"
              tone="themed"
              error={ingredientValidation.getError("name")}
            >
              <Input
                value={ingredientDraft.name}
                onChange={(event) => updateIngredient("name", event.target.value)}
              />
            </FormField>
            <FormField
              label="Base unit"
              tone="themed"
              description="For example g, ml, each or portion."
              error={ingredientValidation.getError("unit")}
            >
              <Input
                value={ingredientDraft.unit}
                onChange={(event) => updateIngredient("unit", event.target.value)}
              />
            </FormField>
            <FormField
              label={ingredientDraft.id ? "Current quantity" : "Opening quantity"}
              tone="themed"
              description={
                ingredientDraft.id
                  ? "Use Stock movements to change this balance."
                  : undefined
              }
              error={ingredientValidation.getError("currentQuantity")}
            >
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={ingredientDraft.currentQuantity}
                disabled={ingredientDraft.id !== null}
                onChange={(event) =>
                  updateIngredient("currentQuantity", event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Low-stock threshold"
              tone="themed"
              error={ingredientValidation.getError("lowStockThreshold")}
            >
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={ingredientDraft.lowStockThreshold}
                onChange={(event) =>
                  updateIngredient("lowStockThreshold", event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Notes"
              tone="themed"
              className="sm:col-span-2"
              error={ingredientValidation.getError("notes")}
            >
              <Textarea
                value={ingredientDraft.notes}
                onChange={(event) => updateIngredient("notes", event.target.value)}
              />
            </FormField>
            <label className="flex items-center gap-3 sm:col-span-2">
              <Checkbox
                checked={ingredientDraft.isActive}
                onCheckedChange={(checked) =>
                  updateIngredient("isActive", checked === true)
                }
              />
              <span>Ingredient is active</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsIngredientDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveIngredient()}
              disabled={isSavingIngredient}
            >
              <ButtonLabel icon={SaveIcon}>
                Save ingredient
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
