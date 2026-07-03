"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DownloadIcon,
  ImageIcon,
  PackageCheckIcon,
  PackageXIcon,
  PencilLineIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  TagsIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/lib/api-client";
import { formatPrice } from "@/lib/formatters";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuModifierGroupRecord,
  MenuTagRecord,
} from "@/types/menu";

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
  isSoldOut: boolean;
  tagIds: string[];
  modifierGroupIds: string[];
};

type ModifierGroupDraft = {
  name: string;
  description: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: string;
  maxSelections: string;
  sortOrder: string;
  isActive: boolean;
};

type ModifierOptionDraft = {
  groupId: string;
  name: string;
  priceDelta: string;
  sortOrder: string;
  isActive: boolean;
  isSoldOut: boolean;
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
  isSoldOut: false,
  tagIds: [],
  modifierGroupIds: [],
};

const emptyModifierGroupDraft: ModifierGroupDraft = {
  name: "",
  description: "",
  selectionType: "MULTIPLE",
  isRequired: false,
  minSelections: "0",
  maxSelections: "",
  sortOrder: "0",
  isActive: true,
};

const emptyModifierOptionDraft: ModifierOptionDraft = {
  groupId: "",
  name: "",
  priceDelta: "0",
  sortOrder: "0",
  isActive: true,
  isSoldOut: false,
};

export function MenuManager() {
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [modifierGroups, setModifierGroups] = useState<MenuModifierGroupRecord[]>([]);
  const [tags, setTags] = useState<MenuTagRecord[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isModifierGroupDialogOpen, setIsModifierGroupDialogOpen] = useState(false);
  const [isModifierOptionDialogOpen, setIsModifierOptionDialogOpen] = useState(false);
  const [isClearMenuDialogOpen, setIsClearMenuDialogOpen] = useState(false);
  const [clearMenuConfirmationText, setClearMenuConfirmationText] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const [modifierGroupDraft, setModifierGroupDraft] = useState<ModifierGroupDraft>(emptyModifierGroupDraft);
  const [modifierOptionDraft, setModifierOptionDraft] = useState<ModifierOptionDraft>(emptyModifierOptionDraft);
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
        setModifierGroups([]);
        setIsLoading(false);
        return;
      }

      setCategories(payload.categories ?? []);
      setModifierGroups(payload.modifierGroups ?? []);
      setTags(payload.tags ?? []);
      setCurrency(payload.currency ?? "INR");
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
      isSoldOut: item.isSoldOut,
      tagIds: item.tags?.map((tag) => tag.id) ?? [],
      modifierGroupIds: item.modifierGroups?.map((group) => group.id) ?? [],
    });
    setIsItemDialogOpen(true);
  }

  function toggleItemDraftTag(tagId: string, isSelected: boolean) {
    setItemDraft((current) => ({
      ...current,
      tagIds: isSelected
        ? Array.from(new Set([...current.tagIds, tagId]))
        : current.tagIds.filter((currentTagId) => currentTagId !== tagId),
    }));
  }

  function toggleItemDraftModifierGroup(groupId: string, isSelected: boolean) {
    setItemDraft((current) => ({
      ...current,
      modifierGroupIds: isSelected
        ? Array.from(new Set([...current.modifierGroupIds, groupId]))
        : current.modifierGroupIds.filter((currentGroupId) => currentGroupId !== groupId),
    }));
  }

  function openCreateModifierGroupDialog() {
    setModifierGroupDraft(emptyModifierGroupDraft);
    setIsModifierGroupDialogOpen(true);
  }

  function openCreateModifierOptionDialog(groupId?: string) {
    setModifierOptionDraft({
      ...emptyModifierOptionDraft,
      groupId: groupId ?? modifierGroups[0]?.id ?? "",
    });
    setIsModifierOptionDialogOpen(true);
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
        isSoldOut: itemDraft.isSoldOut,
        tagIds: itemDraft.tagIds,
        modifierGroupIds: itemDraft.modifierGroupIds,
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

  async function submitModifierGroup() {
    const minSelections = Number(modifierGroupDraft.minSelections);
    const maxSelections = modifierGroupDraft.maxSelections.trim()
      ? Number(modifierGroupDraft.maxSelections)
      : null;

    if (
      maxSelections !== null
      && Number.isFinite(minSelections)
      && Number.isFinite(maxSelections)
      && maxSelections < minSelections
    ) {
      const message = "Maximum selections cannot be lower than minimum selections.";
      setError(message);
      toast.error(message);
      return;
    }

    setPendingAction("modifier-group");

    const response = await fetch("/api/menu/modifier-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: modifierGroupDraft.name,
        description: modifierGroupDraft.description,
        selectionType: modifierGroupDraft.selectionType,
        isRequired: modifierGroupDraft.isRequired,
        minSelections: modifierGroupDraft.minSelections,
        maxSelections: modifierGroupDraft.maxSelections,
        sortOrder: modifierGroupDraft.sortOrder,
        isActive: modifierGroupDraft.isActive,
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
    setModifierGroups(payload.modifierGroups ?? []);
    setError(null);
    setIsModifierGroupDialogOpen(false);
    setModifierGroupDraft(emptyModifierGroupDraft);
    setPendingAction(null);
    toast.success("Add-on group added.");
  }

  async function submitModifierOption() {
    setPendingAction("modifier-option");

    const response = await fetch("/api/menu/modifiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: modifierOptionDraft.groupId,
        name: modifierOptionDraft.name,
        priceDelta: modifierOptionDraft.priceDelta,
        sortOrder: modifierOptionDraft.sortOrder,
        isActive: modifierOptionDraft.isActive,
        isSoldOut: modifierOptionDraft.isSoldOut,
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
    setModifierGroups(payload.modifierGroups ?? []);
    setError(null);
    setIsModifierOptionDialogOpen(false);
    setModifierOptionDraft(emptyModifierOptionDraft);
    setPendingAction(null);
    toast.success("Add-on option added.");
  }

  async function toggleItemSoldOut(item: MenuItemRecord) {
    const nextSoldOutState = !item.isSoldOut;
    setPendingAction(`sold-out:${item.id}`);

    const response = await fetch(`/api/menu/items/${item.id}/sold-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSoldOut: nextSoldOutState }),
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
    toast.success(
      nextSoldOutState
        ? `${item.name} marked sold out.`
        : `${item.name} is available again.`,
    );
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
    link.download = "staff-menu-export.csv";
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

  async function seedStarterMenu() {
    setPendingAction("seed");

    const response = await fetch("/api/menu/seed", {
      method: "POST",
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
    toast.success(
      `Starter menu seeded: ${payload.summary.createdCategories} categories and ${payload.summary.createdItems} products added.`,
    );
  }

  async function clearCurrentMenu() {
    setPendingAction("clear-menu");

    const response = await fetch("/api/menu/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationText: clearMenuConfirmationText }),
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
    setClearMenuConfirmationText("");
    setIsClearMenuDialogOpen(false);
    setPendingAction(null);
    toast.success(payload.message ?? "Current menu cleared.");
  }

  return (
    <>
      <Card className="rounded-xl border-white/60 bg-white/92 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardHeader className="px-6 pt-6">
          <SectionHeader
            eyebrow="Menu Manager"
            title="Manage categories and products"
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
            <Button
              type="button"
              variant="outline"
              onClick={() => void seedStarterMenu()}
              disabled={pendingAction === "seed" || sortedCategories.length > 0}
              className="rounded-lg border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              {pendingAction === "seed" ? (
                <Spinner className="text-amber-900" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              Seed Starter Menu
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setIsClearMenuDialogOpen(true)}
              disabled={pendingAction === "clear-menu" || sortedCategories.length === 0}
              className="rounded-lg"
            >
              <Trash2Icon className="size-4" />
              Clear Current Menu
            </Button>
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
              onClick={openCreateModifierGroupDialog}
              className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
            >
              <TagsIcon className="size-4" />
              Add Add-on Group
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openCreateModifierOptionDialog()}
              className="rounded-lg border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
              disabled={modifierGroups.length === 0}
            >
              <PlusIcon className="size-4" />
              Add Add-on Option
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
            <p className="mt-2 text-sm text-stone-600">
              Use Seed Starter Menu only for a brand-new empty location. It creates the default
              cocktails and mocktails under the current restaurant/location.
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
                                {item.isSoldOut ? (
                                  <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">
                                    Sold out
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-stone-600">
                                {item.description || "No description yet."}
                              </p>
                              {item.tags && item.tags.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-600"
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {item.modifierGroups && item.modifierGroups.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.modifierGroups.map((group) => (
                                    <span
                                      key={group.id}
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700"
                                    >
                                      {group.name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="text-left md:text-right">
                              <p className="text-sm font-semibold text-stone-900">
                                {formatPrice(item.price, { currency, emptyLabel: "No price" })}
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                              <Button
                                type="button"
                                variant={item.isSoldOut ? "destructive" : "outline"}
                                onClick={() => void toggleItemSoldOut(item)}
                                disabled={pendingAction === `sold-out:${item.id}`}
                                className={
                                  item.isSoldOut
                                    ? "rounded-lg"
                                    : "rounded-lg border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                }
                              >
                                {pendingAction === `sold-out:${item.id}` ? (
                                  <Spinner className={item.isSoldOut ? "text-rose-50" : "text-emerald-700"} />
                                ) : item.isSoldOut ? (
                                  <PackageXIcon className="size-4" />
                                ) : (
                                  <PackageCheckIcon className="size-4" />
                                )}
                                {item.isSoldOut ? "Sold Out" : "In Stock"}
                              </Button>
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

          <Card className="rounded-xl border-stone-200 bg-white shadow-none">
            <CardContent className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Add-ons
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-stone-950">
                    Modifier groups
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">
                    Create reusable extras like extra patty, toppings, mixers or sauces, then attach them to products.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCreateModifierGroupDialog}
                    className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                  >
                    <TagsIcon className="size-4" />
                    Add Group
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openCreateModifierOptionDialog()}
                    disabled={modifierGroups.length === 0}
                    className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                  >
                    <PlusIcon className="size-4" />
                    Add Option
                  </Button>
                </div>
              </div>

              {modifierGroups.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
                  No add-on groups yet. Add a group, then add options and attach it to products.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {modifierGroups.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-stone-950">{group.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
                            {group.selectionType === "SINGLE" ? "Single choice" : "Multiple choice"}
                            {group.isRequired ? " - Required" : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openCreateModifierOptionDialog(group.id)}
                          className="rounded-lg border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                        >
                          <PlusIcon className="size-4" />
                          Option
                        </Button>
                      </div>
                      {group.options.length === 0 ? (
                        <p className="mt-3 text-sm text-stone-500">No options yet.</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.options.map((option) => (
                            <span
                              key={option.id}
                              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
                            >
                              {option.name}
                              {Number(option.priceDelta) > 0
                                ? ` + ${formatPrice(option.priceDelta, { currency })}`
                                : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
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
                <ButtonLabel icon={SaveIcon}>Save Category</ButtonLabel>
              ) : (
                <ButtonLabel icon={PlusIcon}>Add Category</ButtonLabel>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isClearMenuDialogOpen}
        onOpenChange={(open) => {
          if (pendingAction === "clear-menu") {
            return;
          }

          setIsClearMenuDialogOpen(open);

          if (!open) {
            setClearMenuConfirmationText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this location menu?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every category and product for the current
              restaurant/location only. Existing orders are not deleted. To confirm, type{" "}
              <span className="font-semibold text-stone-900">delete</span> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">Type delete to continue</p>
            <Input
              value={clearMenuConfirmationText}
              onChange={(event) => setClearMenuConfirmationText(event.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={pendingAction === "clear-menu"}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === "clear-menu"}>
              Keep Menu
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                pendingAction === "clear-menu" ||
                clearMenuConfirmationText.trim().toLowerCase() !== "delete"
              }
              onClick={(event) => {
                event.preventDefault();
                void clearCurrentMenu();
              }}
            >
              {pendingAction === "clear-menu" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-rose-700" />
                  Clearing...
                </span>
              ) : (
                "Delete Menu"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

            <FormField label="Tags">
              {tags.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                  No menu tags are available yet. Run the latest database migration to seed default tags.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-900"
                    >
                      <Checkbox
                        checked={itemDraft.tagIds.includes(tag.id)}
                        onCheckedChange={(checked) =>
                          toggleItemDraftTag(tag.id, checked === true)
                        }
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </FormField>

            <FormField label="Add-ons">
              {modifierGroups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                  No add-on groups are available yet. Create add-on groups in Menu Manager first.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modifierGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-900"
                    >
                      <Checkbox
                        checked={itemDraft.modifierGroupIds.includes(group.id)}
                        onCheckedChange={(checked) =>
                          toggleItemDraftModifierGroup(group.id, checked === true)
                        }
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
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
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={itemDraft.isSoldOut}
                onCheckedChange={(checked) =>
                  setItemDraft((current) => ({ ...current, isSoldOut: checked === true }))
                }
              />
              Mark this product as sold out
            </label>
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)} className="rounded-lg">
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
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
                <ButtonLabel icon={SaveIcon}>Save Product</ButtonLabel>
              ) : (
                <ButtonLabel icon={PlusIcon}>Add Product</ButtonLabel>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModifierGroupDialogOpen} onOpenChange={setIsModifierGroupDialogOpen}>
        <DialogContent className="max-w-2xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">Add add-on group</DialogTitle>
            <DialogDescription>
              Create a reusable group like toppings, extras, sauces or mixers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-4">
            <FormField label="Group name">
              <Input
                value={modifierGroupDraft.name}
                onChange={(event) =>
                  setModifierGroupDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Extra toppings"
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                value={modifierGroupDraft.description}
                onChange={(event) =>
                  setModifierGroupDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Selection type">
                <NativeSelect
                  value={modifierGroupDraft.selectionType}
                  onChange={(event) =>
                    setModifierGroupDraft((current) => ({
                      ...current,
                      selectionType: event.target.value as "SINGLE" | "MULTIPLE",
                    }))
                  }
                >
                  <option value="MULTIPLE">Multiple choice</option>
                  <option value="SINGLE">Single choice</option>
                </NativeSelect>
              </FormField>
              <FormField label="Sort order">
                <Input
                  type="number"
                  min="0"
                  value={modifierGroupDraft.sortOrder}
                  onChange={(event) =>
                    setModifierGroupDraft((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Minimum selections">
                <Input
                  type="number"
                  min="0"
                  value={modifierGroupDraft.minSelections}
                  onChange={(event) =>
                    setModifierGroupDraft((current) => ({
                      ...current,
                      minSelections: event.target.value,
                    }))
                  }
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
              <FormField label="Maximum selections">
                <Input
                  type="number"
                  min="1"
                  value={modifierGroupDraft.maxSelections}
                  onChange={(event) =>
                    setModifierGroupDraft((current) => ({
                      ...current,
                      maxSelections: event.target.value,
                    }))
                  }
                  placeholder="No limit"
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={modifierGroupDraft.isRequired}
                onCheckedChange={(checked) =>
                  setModifierGroupDraft((current) => ({
                    ...current,
                    isRequired: checked === true,
                  }))
                }
              />
              Require customers to choose from this group
            </label>
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModifierGroupDialogOpen(false)}
              className="rounded-lg"
            >
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
            </Button>
            <Button
              type="button"
              onClick={() => void submitModifierGroup()}
              disabled={pendingAction === "modifier-group"}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {pendingAction === "modifier-group" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Saving...
                </span>
              ) : (
                <ButtonLabel icon={PlusIcon}>Add Group</ButtonLabel>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModifierOptionDialogOpen} onOpenChange={setIsModifierOptionDialogOpen}>
        <DialogContent className="max-w-2xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">Add add-on option</DialogTitle>
            <DialogDescription>
              Add a selectable option inside an add-on group.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-4">
            <FormField label="Add-on group">
              <NativeSelect
                value={modifierOptionDraft.groupId}
                onChange={(event) =>
                  setModifierOptionDraft((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))
                }
              >
                <option value="">Choose a group</option>
                {modifierGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Option name">
                <Input
                  value={modifierOptionDraft.name}
                  onChange={(event) =>
                    setModifierOptionDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Extra patty"
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
              <FormField label="Extra price">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={modifierOptionDraft.priceDelta}
                  onChange={(event) =>
                    setModifierOptionDraft((current) => ({
                      ...current,
                      priceDelta: event.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
                />
              </FormField>
            </div>
            <FormField label="Sort order">
              <Input
                type="number"
                min="0"
                value={modifierOptionDraft.sortOrder}
                onChange={(event) =>
                  setModifierOptionDraft((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base"
              />
            </FormField>
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={modifierOptionDraft.isActive}
                onCheckedChange={(checked) =>
                  setModifierOptionDraft((current) => ({
                    ...current,
                    isActive: checked === true,
                  }))
                }
              />
              Show this add-on to customers
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={modifierOptionDraft.isSoldOut}
                onCheckedChange={(checked) =>
                  setModifierOptionDraft((current) => ({
                    ...current,
                    isSoldOut: checked === true,
                  }))
                }
              />
              Mark this add-on as sold out
            </label>
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModifierOptionDialogOpen(false)}
              className="rounded-lg"
            >
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
            </Button>
            <Button
              type="button"
              onClick={() => void submitModifierOption()}
              disabled={pendingAction === "modifier-option"}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {pendingAction === "modifier-option" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Saving...
                </span>
              ) : (
                <ButtonLabel icon={PlusIcon}>Add Option</ButtonLabel>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
