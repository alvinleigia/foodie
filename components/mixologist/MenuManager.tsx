"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, ImageIcon, PencilLineIcon, PlusIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { MenuCategoryRecord, MenuItemRecord } from "@/types/menu";

type CategoryDraft = {
  id: string | null;
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type ItemDraft = {
  id: string | null;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyCategoryDraft: CategoryDraft = {
  id: null,
  name: "",
  description: "",
  sortOrder: "0",
  isActive: true,
};

const emptyItemDraft: ItemDraft = {
  id: null,
  categoryId: "",
  name: "",
  description: "",
  price: "",
  imageUrl: "",
  sortOrder: "0",
  isActive: true,
};

function getApiErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return "Something went wrong.";
  }

  const maybeError = (payload as { error?: unknown }).error;

  if (typeof maybeError === "string") {
    return maybeError;
  }

  if (maybeError && typeof maybeError === "object") {
    const fieldErrors = (maybeError as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;
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

  return "Something went wrong.";
}

function formatPrice(price: string | null) {
  return price ? `INR ${Number(price).toFixed(2)}` : "No price";
}

export function MenuManager() {
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      }),
    [categories],
  );

  useEffect(() => {
    async function loadInitialMenu() {
      const response = await fetch("/api/menu/admin");
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Failed to load menu.");
        setCategories([]);
        setIsLoading(false);
        return;
      }

      setCategories(payload.categories ?? []);
      setError(null);
      setIsLoading(false);
    }

    void loadInitialMenu();
  }, []);

  function openCreateCategoryDialog() {
    setCategoryDraft(emptyCategoryDraft);
    setIsCategoryDialogOpen(true);
  }

  function openEditCategoryDialog(category: MenuCategoryRecord) {
    setCategoryDraft({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      sortOrder: String(category.sortOrder),
      isActive: category.isActive,
    });
    setIsCategoryDialogOpen(true);
  }

  function openCreateItemDialog(categoryId?: string) {
    setItemDraft({
      ...emptyItemDraft,
      categoryId: categoryId ?? sortedCategories[0]?.id ?? "",
    });
    setIsItemDialogOpen(true);
  }

  function openEditItemDialog(item: MenuItemRecord) {
    setItemDraft({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? "",
      price: item.price ?? "",
      imageUrl: item.imageUrl ?? "",
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
    });
    setIsItemDialogOpen(true);
  }

  async function submitCategory() {
    setPendingAction("category");
    const path = categoryDraft.id
      ? `/api/menu/categories/${categoryDraft.id}`
      : "/api/menu/categories";
    const method = categoryDraft.id ? "PATCH" : "POST";

    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: categoryDraft.name,
        description: categoryDraft.description,
        sortOrder: categoryDraft.sortOrder,
        isActive: categoryDraft.isActive,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = getApiErrorMessage(payload);
      setError(message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    setCategories(payload.categories ?? []);
    setError(null);
    setIsCategoryDialogOpen(false);
    setCategoryDraft(emptyCategoryDraft);
    setPendingAction(null);
    toast.success(categoryDraft.id ? "Category updated." : "Category added.");
  }

  async function submitItem() {
    setPendingAction("item");
    const path = itemDraft.id ? `/api/menu/items/${itemDraft.id}` : "/api/menu/items";
    const method = itemDraft.id ? "PATCH" : "POST";

    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: itemDraft.categoryId,
        name: itemDraft.name,
        description: itemDraft.description,
        price: itemDraft.price,
        imageUrl: itemDraft.imageUrl,
        sortOrder: itemDraft.sortOrder,
        isActive: itemDraft.isActive,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = getApiErrorMessage(payload);
      setError(message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    setCategories(payload.categories ?? []);
    setError(null);
    setIsItemDialogOpen(false);
    setItemDraft(emptyItemDraft);
    setPendingAction(null);
    toast.success(itemDraft.id ? "Item updated." : "Item added.");
  }

  async function exportMenu() {
    setPendingAction("export");

    const response = await fetch("/api/menu/export");

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to export menu." }));
      const message = getApiErrorMessage(payload);
      setError(message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mixologist-menu-export.csv";
    link.click();
    window.URL.revokeObjectURL(url);
    setPendingAction(null);
    toast.success("Menu export downloaded.");
  }

  async function importMenu(file: File) {
    setPendingAction("import");

    const csv = await file.text();
    const response = await fetch("/api/menu/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiErrorMessage(payload);
      setError(message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    setCategories(payload.categories ?? []);
    setError(null);
    setPendingAction(null);
    const summary = payload.summary;
    toast.success(
      `Imported menu: ${summary.createdCategories} categories added, ${summary.updatedCategories} categories updated, ${summary.createdItems} items added, ${summary.updatedItems} items updated.`,
    );
  }

  return (
    <>
      <Card className="rounded-xl border-white/60 bg-white/92 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardHeader className="px-6 pt-6">
          <SectionHeader
            eyebrow="Menu Manager"
            title="Manage categories and inventory"
            description="Create menu sections, then add products with price, description, and image links."
            meta={
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
                Google-style section layout for fast menu updates
              </p>
            }
            className="mb-0"
          />
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-6">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={openCreateCategoryDialog} className="rounded-lg bg-stone-950 text-white hover:bg-stone-800">
              <PlusIcon className="size-4" />
              Add Category
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openCreateItemDialog()}
              className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
              disabled={sortedCategories.length === 0}
            >
              <PlusIcon className="size-4" />
              Add Product
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void exportMenu()}
              disabled={pendingAction === "export"}
              className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
            >
              {pendingAction === "export" ? <Spinner className="text-stone-800" /> : <DownloadIcon className="size-4" />}
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={pendingAction === "import"}
              className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
            >
              {pendingAction === "import" ? <Spinner className="text-stone-800" /> : <UploadIcon className="size-4" />}
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void importMenu(file);
                }

                event.currentTarget.value = "";
              }}
            />
          </div>

          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-5 py-4">
            <p className="text-sm font-semibold text-stone-900">Bulk import / export</p>
            <p className="mt-2 text-sm text-stone-600">
              Export the current menu to CSV, edit it in Excel or Google Sheets, then import it back.
              Import merges rows by slug when available, or by matching section/item name.
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-400">
              Required columns: category_name, item_name
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner className="text-stone-500" />
              Loading menu...
            </div>
          ) : sortedCategories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="Create your first section, then add products under it."
            />
          ) : (
            <div className="space-y-5">
              {sortedCategories.map((category) => (
                <Card key={category.id} className="rounded-xl border-stone-200 bg-white shadow-none">
                  <CardContent className="space-y-5 px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-stone-950">{category.name}</h3>
                          {!category.isActive ? (
                            <span className="rounded-lg bg-stone-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
                              Hidden
                            </span>
                          ) : null}
                        </div>
                        {category.description ? (
                          <p className="mt-2 max-w-2xl text-sm text-stone-600">{category.description}</p>
                        ) : (
                          <p className="mt-2 text-sm text-stone-400">No section description yet.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openEditCategoryDialog(category)}
                          className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                        >
                          <PencilLineIcon className="size-4" />
                          Edit Section
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openCreateItemDialog(category.id)}
                          className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                        >
                          <PlusIcon className="size-4" />
                          Add Item
                        </Button>
                      </div>
                    </div>

                    {category.items.length === 0 ? (
                      <EmptyState
                        title="No products in this section"
                        description="Add at least one product so customers can order from it."
                        className="bg-white"
                      />
                    ) : (
                      <div className="space-y-3">
                        {category.items.map((item) => (
                          <div
                            key={item.id}
                            className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 md:grid-cols-[80px_1fr_auto_auto]"
                          >
                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-white">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="size-6 text-stone-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold text-stone-950">{item.name}</p>
                                {!item.isActive ? (
                                  <span className="rounded-lg bg-stone-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-600">
                                    Hidden
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-stone-600">
                                {item.description || "No description yet."}
                              </p>
                            </div>
                            <div className="text-left md:text-right">
                              <p className="text-sm font-semibold text-stone-900">{formatPrice(item.price)}</p>
                            </div>
                            <div className="flex justify-start md:justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openEditItemDialog(item)}
                                className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                              >
                                <PencilLineIcon className="size-4" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">
              {categoryDraft.id ? "Edit category" : "Add category"}
            </DialogTitle>
            <DialogDescription>
              Set up a section the way Google groups menu entries, then attach products underneath it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-4">
            <FormField label="Category name">
              <Input
                value={categoryDraft.name}
                onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                value={categoryDraft.description}
                onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))}
                rows={4}
              />
            </FormField>
            <FormField label="Sort order">
              <Input
                type="number"
                min="0"
                value={categoryDraft.sortOrder}
                onChange={(event) => setCategoryDraft((current) => ({ ...current, sortOrder: event.target.value }))}
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={categoryDraft.isActive}
                onCheckedChange={(checked) =>
                  setCategoryDraft((current) => ({ ...current, isActive: checked === true }))
                }
              />
              Show this category to customers
            </label>
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)} className="rounded-lg">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitCategory()}
              disabled={pendingAction === "category"}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {pendingAction === "category" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Saving...
                </span>
              ) : categoryDraft.id ? (
                "Save Category"
              ) : (
                "Add Category"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-4xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">
              {itemDraft.id ? "Edit product" : "Add product"}
            </DialogTitle>
            <DialogDescription>
              Match the Google menu flow: choose a section, then fill in name, price, description, and photo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(100vh-15rem)] gap-4 overflow-x-hidden overflow-y-auto px-6 pb-4">
            <FormField label="Category">
              <NativeSelect
                value={itemDraft.categoryId}
                onChange={(event) => setItemDraft((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">Choose a category</option>
                {sortedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Product name">
                <Input
                  value={itemDraft.name}
                  onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
              <FormField label="Price">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={itemDraft.price}
                  onChange={(event) => setItemDraft((current) => ({ ...current, price: event.target.value }))}
                  placeholder="9.99"
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
            </div>

            <FormField label="Description">
              <Textarea
                value={itemDraft.description}
                onChange={(event) => setItemDraft((current) => ({ ...current, description: event.target.value }))}
                rows={4}
              />
            </FormField>

            <FormField label="Image URL">
              <Input
                type="url"
                value={itemDraft.imageUrl}
                onChange={(event) => setItemDraft((current) => ({ ...current, imageUrl: event.target.value }))}
                placeholder="https://..."
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <FormField label="Sort order">
                <Input
                  type="number"
                  min="0"
                  value={itemDraft.sortOrder}
                  onChange={(event) => setItemDraft((current) => ({ ...current, sortOrder: event.target.value }))}
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-medium text-stone-700">Image preview</p>
                <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {itemDraft.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={itemDraft.imageUrl} alt={itemDraft.name || "Preview"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <ImageIcon className="size-7" />
                      <span className="text-xs uppercase tracking-[0.2em]">No image</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={itemDraft.isActive}
                onCheckedChange={(checked) =>
                  setItemDraft((current) => ({ ...current, isActive: checked === true }))
                }
              />
              Show this product to customers
            </label>
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)} className="rounded-lg">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitItem()}
              disabled={pendingAction === "item"}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {pendingAction === "item" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Saving...
                </span>
              ) : itemDraft.id ? (
                "Save Product"
              ) : (
                "Add Product"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
