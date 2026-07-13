"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageIcon,
  LogInIcon,
  MinusIcon,
  PlusIcon,
  PhoneIcon,
  SendIcon,
  ShoppingCartIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { LocalCustomerOrder } from "@/lib/constants";
import {
  readStoredCustomerOrders,
  syncCustomerOrdersResetMarker,
  writeStoredCustomerOrders,
} from "@/lib/customer-orders";
import { getApiErrorMessage, getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { formatPrice } from "@/lib/formatters";
import {
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from "@/lib/validations/customer";
import { FormField } from "@/components/shared/FormField";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuModifierGroupRecord,
  MenuModifierOptionRecord,
} from "@/types/menu";

type OrderFormProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  customerAuthProviders: {
    google: boolean;
  };
  isStaffOrder?: boolean;
  locationQrSlug?: string;
  locationSlug?: string;
  onOrderCreated?: (order: LocalCustomerOrder) => void;
};

type CartItem = {
  lineId: string;
  categoryId: string;
  categoryName: string;
  drinkId: string;
  drinkName: string;
  quantity: number;
  notes: string;
  unitPrice: string | null;
  stockLimit: number | null;
  modifierGroups: MenuModifierGroupRecord[];
  modifierSelections: CartModifierSelection[];
};

type CartModifierSelection = {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  quantity: number;
  priceDelta: string;
};

type CustomizerState = {
  mode: "new" | "edit";
  item: CartItem;
};

type OrderDraft = {
  customerName: string;
};

function withPublicContext(path: string, options: { locationQrSlug?: string; locationSlug?: string }) {
  const { locationQrSlug, locationSlug } = options;

  if (locationQrSlug) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}qr=${encodeURIComponent(locationQrSlug)}`;
  }

  if (!locationSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}location=${encodeURIComponent(locationSlug)}`;
}

function getStockLimit(drink: MenuItemRecord) {
  if (drink.inventoryStatus === "not_tracked" || !drink.inventoryQuantity) {
    return null;
  }

  const quantity = Number(drink.inventoryQuantity);

  if (!Number.isFinite(quantity)) {
    return null;
  }

  return Math.max(0, Math.floor(quantity));
}

function getStockLimitError(drinkName: string, stockLimit: number) {
  return stockLimit <= 0
    ? `${drinkName} is currently unavailable.`
    : `Only ${stockLimit} ${stockLimit === 1 ? "item is" : "items are"} available for ${drinkName}.`;
}

function getCartItemUnitTotal(item: CartItem) {
  const basePrice = item.unitPrice ? Number(item.unitPrice) : 0;
  const modifierPrice = getCartItemModifierUnitTotal(item);

  if (!item.unitPrice && modifierPrice === 0) {
    return null;
  }

  return basePrice + modifierPrice;
}

function getCartItemModifierUnitTotal(item: CartItem) {
  return item.modifierSelections.reduce(
    (sum, modifier) => sum + Number(modifier.priceDelta) * modifier.quantity,
    0,
  );
}

function getCartItemLineTotal(item: CartItem) {
  const unitTotal = getCartItemUnitTotal(item);
  return unitTotal === null ? null : unitTotal * item.quantity;
}

function formatCartItemLineTotal(item: CartItem, currency: string) {
  const lineTotal = getCartItemLineTotal(item);
  return lineTotal === null ? "-" : formatPrice(lineTotal, { currency });
}

function getModifierSelection(
  item: CartItem,
  group: MenuModifierGroupRecord,
  option: MenuModifierOptionRecord,
) {
  return item.modifierSelections.find(
    (selection) => selection.groupId === group.id && selection.modifierId === option.id,
  );
}

function createCartLineId(drinkId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${drinkId}-${crypto.randomUUID()}`;
  }

  return `${drinkId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getModifierSelectionSignature(item: CartItem) {
  return item.modifierSelections
    .map((selection) => `${selection.groupId}:${selection.modifierId}:${selection.quantity}`)
    .sort()
    .join("|");
}

function hasSameCartConfiguration(left: CartItem, right: CartItem) {
  return (
    left.drinkId === right.drinkId &&
    left.notes.trim() === right.notes.trim() &&
    getModifierSelectionSignature(left) === getModifierSelectionSignature(right)
  );
}

export function OrderForm({
  customer,
  customerAuthProviders,
  isStaffOrder = false,
  locationQrSlug,
  locationSlug,
  onOrderCreated,
}: OrderFormProps) {
  const router = useRouter();
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRecord[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [draft, setDraft] = useState<OrderDraft>({
    customerName: customer?.name ?? "",
  });
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(customer?.phone ?? "");
  const [savedCustomerPhone, setSavedCustomerPhone] = useState(customer?.phone ?? null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customizer, setCustomizer] = useState<CustomizerState | null>(null);
  const [customizerError, setCustomizerError] = useState<string | null>(null);
  const [quantityPromptItem, setQuantityPromptItem] = useState<CartItem | null>(null);
  const [screen, setScreen] = useState<"menu" | "review">("menu");
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [isCategoryBarStuck, setIsCategoryBarStuck] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryBarSentinelRef = useRef<HTMLDivElement | null>(null);
  const canPlaceOrder =
    isStaffOrder || Boolean(customer && isValidCustomerPhone(savedCustomerPhone));

  const availableTags = useMemo(() => {
    const tagsById = new Map<string, NonNullable<MenuItemRecord["tags"]>[number]>();

    for (const category of menuCategories) {
      for (const item of category.items) {
        for (const tag of item.tags ?? []) {
          tagsById.set(tag.id, tag);
        }
      }
    }

    return Array.from(tagsById.values()).sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name);
    });
  }, [menuCategories]);

  const visibleMenuCategories = useMemo(() => {
    if (!selectedTagId) {
      return menuCategories;
    }

    return menuCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          item.tags?.some((tag) => tag.id === selectedTagId),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menuCategories, selectedTagId]);

  useEffect(() => {
    let isMounted = true;

    async function loadMenu() {
      setIsLoadingMenu(true);
      const response = await fetch(withPublicContext("/api/menu", { locationQrSlug, locationSlug }));
      const payload = await response.json();

      if (!response.ok) {
        if (isMounted) {
          setMenuError(payload.error ?? "Failed to load the menu.");
          setMenuCategories([]);
          setIsLoadingMenu(false);
        }
        return;
      }

      if (isMounted) {
        setMenuCategories(payload.categories ?? []);
        setCurrency(payload.currency ?? "INR");
        setMenuError(null);
        setIsLoadingMenu(false);
        setActiveCategoryId(payload.categories?.[0]?.id);
      }
    }

    void loadMenu();

    return () => {
      isMounted = false;
    };
  }, [locationQrSlug, locationSlug]);

  useEffect(() => {
    if (visibleMenuCategories.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveCategoryId(visibleEntry.target.id.replace("menu-category-", ""));
        }
      },
      {
        root: null,
        rootMargin: "-160px 0px -55% 0px",
        threshold: [0.12, 0.35, 0.6],
      },
    );

    for (const category of visibleMenuCategories) {
      const element = categoryRefs.current[category.id];

      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [visibleMenuCategories]);

  useEffect(() => {
    const sentinel = categoryBarSentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observedSentinel = sentinel;

    function updateStickyState() {
      setIsCategoryBarStuck(observedSentinel.getBoundingClientRect().top <= 0);
    }

    updateStickyState();
    window.addEventListener("scroll", updateStickyState, { passive: true });
    window.addEventListener("resize", updateStickyState);

    return () => {
      window.removeEventListener("scroll", updateStickyState);
      window.removeEventListener("resize", updateStickyState);
    };
  }, [menuCategories.length]);

  const totalProducts = useMemo(
    () => visibleMenuCategories.reduce((count, category) => count + category.items.length, 0),
    [visibleMenuCategories],
  );

  const currentActiveCategoryId = visibleMenuCategories.some(
    (category) => category.id === activeCategoryId,
  )
    ? activeCategoryId
    : visibleMenuCategories[0]?.id;

  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const totalAmount = useMemo(() => {
    const pricedTotal = cartItems.reduce((sum, item) => {
      const lineTotal = getCartItemLineTotal(item);

      if (lineTotal === null) {
        return sum;
      }

      return sum + lineTotal;
    }, 0);

    const hasAnyPrice = cartItems.some((item) => getCartItemLineTotal(item) !== null);
    return hasAnyPrice ? pricedTotal.toFixed(2) : null;
  }, [cartItems]);

  const customerNameError =
    screen === "review" && error === "Please enter the customer's name." ? error : null;
  const reviewError = screen === "review" && error !== customerNameError ? error : null;

  function updateDraft<K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  }

  function createCartItem(category: MenuCategoryRecord, drink: MenuItemRecord): CartItem {
    return {
      lineId: createCartLineId(drink.id),
      categoryId: category.id,
      categoryName: category.name,
      drinkId: drink.id,
      drinkName: drink.name,
      quantity: 1,
      notes: "",
      unitPrice: drink.price ?? null,
      stockLimit: getStockLimit(drink),
      modifierGroups: drink.modifierGroups ?? [],
      modifierSelections: [],
    };
  }

  function getSelectedQuantityForDrink(drinkId: string, exceptLineId?: string) {
    return cartItems.reduce((sum, item) => {
      if (item.drinkId !== drinkId || item.lineId === exceptLineId) {
        return sum;
      }

      return sum + item.quantity;
    }, 0);
  }

  function canAddQuantityToCartItem(item: CartItem, quantity: number, exceptLineId?: string) {
    if (item.stockLimit === null) {
      return true;
    }

    if (getSelectedQuantityForDrink(item.drinkId, exceptLineId) + quantity > item.stockLimit) {
      setError(getStockLimitError(item.drinkName, item.stockLimit));
      return false;
    }

    return true;
  }

  function addCartLine(item: CartItem) {
    if (!canAddQuantityToCartItem(item, item.quantity, item.lineId)) {
      return false;
    }

    setCartItems((currentItems) => {
      const matchingIndex = currentItems.findIndex((currentItem) =>
        currentItem.lineId !== item.lineId && hasSameCartConfiguration(currentItem, item),
      );

      if (matchingIndex >= 0) {
        return currentItems.map((currentItem, index) =>
          index === matchingIndex
            ? {
                ...currentItem,
                quantity:
                  currentItem.stockLimit === null
                    ? Math.min(currentItem.quantity + item.quantity, 20)
                    : currentItem.quantity + item.quantity,
              }
            : currentItem,
        );
      }

      return [...currentItems, item];
    });
    setError(null);
    return true;
  }

  function addToCart(category: MenuCategoryRecord, drink: MenuItemRecord) {
    if (drink.isSoldOut || drink.isUnavailableDueToStock) {
      setError(`${drink.name} is currently unavailable.`);
      return;
    }

    const nextItem = createCartItem(category, drink);

    if (!canAddQuantityToCartItem(nextItem, 1)) {
      return;
    }

    if (nextItem.modifierGroups.length > 0) {
      setCustomizer({ mode: "new", item: nextItem });
      setCustomizerError(null);
      setError(null);
      return;
    }

    addCartLine(nextItem);
  }

  function updateCartItem(lineId: string, updater: (item: CartItem) => CartItem | null) {
    setCartItems((currentItems) =>
      currentItems.flatMap((item) => {
        if (item.lineId !== lineId) {
          return [item];
        }

        const nextItem = updater(item);
        return nextItem ? [nextItem] : [];
      }),
    );
  }

  function increaseCartItemQuantity(item: CartItem) {
    if (item.stockLimit !== null && getSelectedQuantityForDrink(item.drinkId) >= item.stockLimit) {
      setError(getStockLimitError(item.drinkName, item.stockLimit));
      return;
    }

    updateCartItem(item.lineId, (current) => ({
      ...current,
      quantity:
        current.stockLimit === null
          ? Math.min(current.quantity + 1, 20)
          : current.quantity + 1,
    }));
    setError(null);
  }

  function decreaseCartItemQuantity(lineId: string) {
    updateCartItem(lineId, (current) =>
      current.quantity <= 1 ? null : { ...current, quantity: current.quantity - 1 },
    );
  }

  function requestQuantityIncrease(item: CartItem) {
    if (item.modifierGroups.length === 0) {
      increaseCartItemQuantity(item);
      return;
    }

    setQuantityPromptItem(item);
  }

  function openCustomizerForItem(item: CartItem, mode: CustomizerState["mode"] = "edit") {
    setCustomizer({
      mode,
      item: {
        ...item,
        modifierSelections: [...item.modifierSelections],
      },
    });
    setCustomizerError(null);
    setError(null);
  }

  function openNewCustomizationFromLine(item: CartItem) {
    openCustomizerForItem(
      {
        ...item,
        lineId: createCartLineId(item.drinkId),
        quantity: 1,
        notes: "",
        modifierSelections: [...item.modifierSelections],
      },
      "new",
    );
  }

  function updateCustomizerItem(updater: (item: CartItem) => CartItem) {
    setCustomizer((current) =>
      current
        ? {
            ...current,
            item: updater(current.item),
          }
        : current,
    );
  }

  function toggleCustomizerModifier(
    group: MenuModifierGroupRecord,
    option: MenuModifierOptionRecord,
  ) {
    const cartItem = customizer?.item ?? null;
    const existingSelection = cartItem ? getModifierSelection(cartItem, group, option) : null;

    if (
      cartItem &&
      !existingSelection &&
      group.selectionType === "MULTIPLE" &&
      group.maxSelections !== null
    ) {
      const currentGroupSelections = cartItem.modifierSelections.filter(
        (selection) => selection.groupId === group.id,
      );

      if (currentGroupSelections.length >= group.maxSelections) {
        setCustomizerError(`Choose up to ${group.maxSelections} option(s) for ${group.name}.`);
        return;
      }
    }

    updateCustomizerItem((current) => {
      const currentSelection = getModifierSelection(current, group, option);

      if (currentSelection) {
        if (group.selectionType === "SINGLE" && group.isRequired) {
          return current;
        }

        return {
          ...current,
          modifierSelections: current.modifierSelections.filter(
            (selection) =>
              !(selection.groupId === group.id && selection.modifierId === option.id),
          ),
        };
      }

      const nextSelection: CartModifierSelection = {
        groupId: group.id,
        groupName: group.name,
        modifierId: option.id,
        modifierName: option.name,
        quantity: 1,
        priceDelta: option.priceDelta,
      };

      if (group.selectionType === "SINGLE") {
        return {
          ...current,
          modifierSelections: [
            ...current.modifierSelections.filter((selection) => selection.groupId !== group.id),
            nextSelection,
          ],
        };
      }

      return {
        ...current,
        modifierSelections: [...current.modifierSelections, nextSelection],
      };
    });
    setCustomizerError(null);
  }

  function saveCustomization() {
    if (!customizer) {
      return;
    }

    const modifierError = getModifierValidationError([customizer.item]);

    if (modifierError) {
      setCustomizerError(modifierError);
      return;
    }

    if (
      !canAddQuantityToCartItem(
        customizer.item,
        customizer.item.quantity,
        customizer.mode === "edit" ? customizer.item.lineId : undefined,
      )
    ) {
      return;
    }

    if (customizer.mode === "edit") {
      setCartItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.lineId === customizer.item.lineId ? customizer.item : currentItem,
        ),
      );
      setCustomizer(null);
      setCustomizerError(null);
      setError(null);
      return;
    }

    if (addCartLine(customizer.item)) {
      setCustomizer(null);
      setCustomizerError(null);
    }
  }

  function getModifierValidationError(items = cartItems) {
    for (const item of items) {
      for (const group of item.modifierGroups) {
        const selectedCount = item.modifierSelections.filter(
          (selection) => selection.groupId === group.id,
        ).length;

        if (group.isRequired && selectedCount === 0) {
          return `Choose an option for ${group.name} on ${item.drinkName}.`;
        }

        if (selectedCount < group.minSelections) {
          return `Choose at least ${group.minSelections} option(s) for ${group.name} on ${item.drinkName}.`;
        }

        if (group.maxSelections !== null && selectedCount > group.maxSelections) {
          return `Choose up to ${group.maxSelections} option(s) for ${group.name} on ${item.drinkName}.`;
        }
      }
    }

    return null;
  }

  function scrollToCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    categoryRefs.current[categoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function goToReview() {
    if (cartItems.length === 0) {
      setError("Add at least one drink to the cart.");
      return;
    }

    const modifierError = getModifierValidationError();

    if (modifierError) {
      setError(modifierError);
      setIsCartOpen(true);
      return;
    }

    setError(null);
    setIsCartOpen(false);
    setScreen("review");
  }

  async function confirmOrder() {
    if (!isStaffOrder && !customer) {
      setError("Sign in before placing your order.");
      return;
    }

    if (!canPlaceOrder) {
      setError("Add a valid phone number before placing your order.");
      return;
    }

    if (draft.customerName.trim().length < 2) {
      setError("Please enter the customer's name.");
      return;
    }

    const modifierError = getModifierValidationError();

    if (modifierError) {
      setError(modifierError);
      setScreen("menu");
      setIsCartOpen(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch(withPublicContext("/api/orders", { locationQrSlug, locationSlug }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: draft.customerName.trim(),
        items: cartItems.map((item) => ({
          categoryId: item.categoryId,
          drinkId: item.drinkId,
          quantity: item.quantity,
          notes: item.notes.trim(),
          modifiers: item.modifierSelections.map((modifier) => ({
            groupId: modifier.groupId,
            modifierId: modifier.modifierId,
            quantity: modifier.quantity,
          })),
        })),
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "Failed to place order."));
      setIsSubmitting(false);
      return;
    }

    const nextOrder: LocalCustomerOrder = {
      orderId: payload.orderId,
      orderNo: payload.orderNo,
      orderDate: payload.orderDate,
      customerToken: payload.customerToken,
      customerName: payload.customerName,
      categoryName: payload.categoryName,
      drinkName: payload.drinkName,
      itemCount: payload.itemCount,
      items: payload.items,
      status: payload.status,
      createdAt: payload.createdAt,
    };

    syncCustomerOrdersResetMarker(payload.ordersResetAt ?? null);
    const existingOrders = readStoredCustomerOrders();
    writeStoredCustomerOrders([nextOrder, ...existingOrders]);

    onOrderCreated?.(nextOrder);
    toast.success(`Order #${payload.orderNo} placed successfully.`);
    setDraft({ customerName: "" });
    setCartItems([]);
    setIsCartOpen(false);
    setIsSubmitting(false);
    setScreen("menu");
    router.push(
      locationSlug
        ? `/order/status/${encodeURIComponent(locationSlug)}`
        : withPublicContext("/order/status", { locationQrSlug }),
    );
  }

  async function startGoogleLogin() {
    setIsStartingLogin(true);
    setError(null);

    try {
      await signIn("google", { redirectTo: window.location.href });
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      setIsStartingLogin(false);
    }
  }

  async function saveCustomerPhone() {
    if (!isValidCustomerPhone(customerPhone)) {
      setError("Enter a valid phone number with country code.");
      return;
    }

    setIsSavingPhone(true);
    setError(null);

    try {
      const payload = await requestJson<{ customer: { phone: string | null } }>(
        "/api/customer/profile",
        {
          body: { phone: customerPhone },
          fallbackError: "Phone number could not be saved.",
          method: "PATCH",
        },
      );
      const phone = payload.customer.phone ?? normalizeCustomerPhone(customerPhone);
      setCustomerPhone(phone);
      setSavedCustomerPhone(phone);
      toast.success("Phone number saved.");
    } catch (phoneError) {
      setError(getCaughtErrorMessage(phoneError, "Phone number could not be saved."));
    } finally {
      setIsSavingPhone(false);
    }
  }

  return (
    <>
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Your cart</SheetTitle>
            <SheetDescription>
              Adjust quantities and add notes for each item before reviewing the order.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {cartItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-stone-900">Your cart is empty</p>
                <p className="mt-2 text-sm text-stone-500">
                  Add drinks from the menu cards to start building the order.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {cartItems.map((item) => {
                  const modifierUnitTotal = getCartItemModifierUnitTotal(item);
                  const itemUnitTotal = getCartItemUnitTotal(item);

                  return (
                    <div
                      key={item.lineId}
                      className="rounded-xl border border-stone-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-stone-950">
                            {item.drinkName}
                          </p>
                          <p className="text-sm text-stone-500">{item.categoryName}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => updateCartItem(item.lineId, () => null)}
                          className="rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Trash2Icon className="size-4" />
                          Remove
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-1 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-stone-500">Base item</span>
                          <span className="font-medium text-stone-900">
                            {formatPrice(item.unitPrice, { currency })}
                          </span>
                        </div>
                        {item.modifierSelections.length > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-stone-500">Add-ons</span>
                            <span className="font-medium text-stone-900">
                              {modifierUnitTotal > 0
                                ? `+ ${formatPrice(modifierUnitTotal, { currency })}`
                                : "Included"}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2 font-semibold text-stone-950">
                          <span>Item total</span>
                          <span>{formatPrice(itemUnitTotal, { currency })}</span>
                        </div>
                        {item.quantity > 1 ? (
                          <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
                            <span>Line total for {item.quantity} item(s)</span>
                            <span className="font-semibold text-stone-900">
                              {formatCartItemLineTotal(item, currency)}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center overflow-hidden rounded-lg border border-stone-200">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => decreaseCartItemQuantity(item.lineId)}
                            className="rounded-none"
                          >
                            <MinusIcon className="size-4" />
                          </Button>
                          <span className="min-w-12 px-4 text-center text-sm font-semibold text-stone-950">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => requestQuantityIncrease(item)}
                            disabled={
                              item.stockLimit !== null &&
                              getSelectedQuantityForDrink(item.drinkId) >= item.stockLimit
                            }
                            className="rounded-none"
                          >
                            <PlusIcon className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {item.modifierGroups.length > 0 ? (
                        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-stone-950">Customization</p>
                              <p className="mt-0.5 text-xs text-stone-500">
                                {item.modifierSelections.length > 0
                                  ? "Selected add-ons for this cart line."
                                  : "No add-ons selected for this cart line."}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openCustomizerForItem(item)}
                              className="h-9 rounded-lg bg-white"
                            >
                              <ButtonLabel icon={TagsIcon}>Edit</ButtonLabel>
                            </Button>
                          </div>

                          {item.modifierSelections.length > 0 ? (
                            <div className="mt-3 grid gap-2">
                              {item.modifierSelections.map((modifier) => (
                                <div
                                  key={`${item.lineId}-${modifier.groupId}-${modifier.modifierId}`}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-stone-900">
                                    {modifier.groupName}: {modifier.modifierName}
                                  </span>
                                  <span className="text-xs font-semibold text-stone-600">
                                    {Number(modifier.priceDelta) > 0
                                      ? `+ ${formatPrice(modifier.priceDelta, { currency })}`
                                      : "Included"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <FormField label="Notes for this item">
                          <Textarea
                            value={item.notes}
                            onChange={(event) =>
                              updateCartItem(item.lineId, (current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Less ice, no garnish, serve later..."
                          />
                        </FormField>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SheetFooter>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{totalQuantity} item(s)</p>
                <p className="text-base font-semibold text-stone-950">
                  {formatPrice(totalAmount, { currency })}
                </p>
              </div>
              <Button
                type="button"
                onClick={goToReview}
                disabled={isSubmitting || isLoadingMenu || Boolean(menuError) || cartItems.length === 0}
                className="min-h-12 rounded-lg bg-stone-950 px-5 py-3 text-white hover:bg-stone-800"
              >
                Review Order
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(customizer)}
        onOpenChange={(open) => {
          if (!open) {
            setCustomizer(null);
            setCustomizerError(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl p-0 sm:max-w-xl">
          {customizer ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>
                  {customizer.mode === "edit" ? "Edit customization" : "Customize item"}
                </DialogTitle>
                <DialogDescription>
                  Choose add-ons for {customizer.item.drinkName}. Each different customization is
                  kept as a separate cart line.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 px-6 py-5">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-stone-950">
                        {customizer.item.drinkName}
                      </p>
                      <p className="text-sm text-stone-500">{customizer.item.categoryName}</p>
                    </div>
                    <div className="min-w-44 text-right text-xs text-stone-500">
                      <div className="flex items-center justify-between gap-3">
                        <span>Base item</span>
                        <span className="font-medium text-stone-900">
                          {formatPrice(customizer.item.unitPrice, { currency })}
                        </span>
                      </div>
                      {customizer.item.modifierSelections.length > 0 ? (
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>Add-ons</span>
                          <span className="font-medium text-stone-900">
                            {getCartItemModifierUnitTotal(customizer.item) > 0
                              ? `+ ${formatPrice(getCartItemModifierUnitTotal(customizer.item), {
                                  currency,
                                })}`
                              : "Included"}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-stone-200 pt-2 text-sm font-semibold text-stone-950">
                        <span>Item total</span>
                        <span>{formatPrice(getCartItemUnitTotal(customizer.item), { currency })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {customizer.item.modifierGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-stone-950">{group.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {group.selectionType === "SINGLE" ? "Choose one" : "Choose any"}
                          {group.isRequired ? " - Required" : ""}
                        </p>
                      </div>
                      {group.maxSelections !== null ? (
                        <span className="rounded-md bg-stone-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                          Max {group.maxSelections}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const selection = getModifierSelection(customizer.item, group, option);

                        return (
                          <label
                            key={option.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                          >
                            <span className="inline-flex items-center gap-3">
                              <Checkbox
                                checked={Boolean(selection)}
                                disabled={option.isSoldOut}
                                onCheckedChange={() => toggleCustomizerModifier(group, option)}
                              />
                              <span className="font-medium text-stone-900">
                                {option.name}
                                {option.isSoldOut ? " (sold out)" : ""}
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-stone-600">
                              {Number(option.priceDelta) > 0
                                ? `+ ${formatPrice(option.priceDelta, { currency })}`
                                : "Included"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {customizerError ? (
                  <p className="text-sm text-rose-600">{customizerError}</p>
                ) : null}
              </div>

              <DialogFooter className="border-t border-stone-200 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCustomizer(null);
                    setCustomizerError(null);
                  }}
                  className="min-h-11 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveCustomization}
                  className="min-h-11 rounded-lg bg-stone-950 text-white hover:bg-stone-800"
                >
                  <ButtonLabel icon={customizer.mode === "edit" ? TagsIcon : PlusIcon}>
                    {customizer.mode === "edit" ? "Save Customization" : "Add to Cart"}
                  </ButtonLabel>
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(quantityPromptItem)}
        onOpenChange={(open) => {
          if (!open) {
            setQuantityPromptItem(null);
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] rounded-xl sm:w-fit sm:min-w-[38rem] sm:max-w-[44rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add another {quantityPromptItem?.drinkName ?? "item"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Continue with the same customization or create a separate cart line with different
              add-ons.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row sm:flex-nowrap sm:justify-end">
            <AlertDialogCancel className="w-full whitespace-nowrap sm:w-auto">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full whitespace-nowrap sm:w-auto"
              onClick={() => {
                if (quantityPromptItem) {
                  increaseCartItemQuantity(quantityPromptItem);
                }

                setQuantityPromptItem(null);
              }}
            >
              Same customization
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full whitespace-nowrap sm:w-auto"
              onClick={() => {
                if (quantityPromptItem) {
                  openNewCustomizationFromLine(quantityPromptItem);
                }

                setQuantityPromptItem(null);
              }}
            >
              Customize separately
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {screen === "review" ? (
        <Card className="overflow-hidden rounded-xl border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
          <CardHeader className="px-6 pt-6">
            <SectionHeader
              eyebrow="Review order"
              title="Confirm order"
              meta={
                <p className="text-sm text-stone-600">
                  Add the customer name or table number and double-check the cart before sending it to the bar queue.
                </p>
              }
              className="mb-0"
            />
          </CardHeader>

          <CardContent className="grid gap-4 px-6 pb-6">
            {!isStaffOrder && !customer ? (
              <div className="-mx-6 grid gap-4 border-y border-stone-200 bg-stone-50 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-stone-950">Sign in to continue</p>
                  <p className="mt-1 text-sm text-stone-600">
                    Your orders will be saved to your account for easy tracking and reordering.
                  </p>
                </div>
                {customerAuthProviders.google ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startGoogleLogin}
                    disabled={isStartingLogin}
                    className="min-h-11 rounded-lg border-stone-300 bg-white px-4"
                  >
                    {isStartingLogin ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner />
                        Connecting...
                      </span>
                    ) : (
                      <ButtonLabel icon={LogInIcon}>Continue with Google</ButtonLabel>
                    )}
                  </Button>
                ) : (
                  <p className="text-sm font-medium text-amber-700">
                    Customer login is temporarily unavailable.
                  </p>
                )}
              </div>
            ) : customer ? (
              <div className="-mx-6 grid gap-4 border-y border-stone-200 bg-emerald-50 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">
                    Signed in as {customer.name || customer.email}
                  </p>
                  {customer.email ? (
                    <p className="mt-1 text-sm text-emerald-800">{customer.email}</p>
                  ) : null}
                </div>
                {isValidCustomerPhone(savedCustomerPhone) ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                    <PhoneIcon className="size-4" />
                    {savedCustomerPhone}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <FormField
                      label="Phone number"
                      description="Required for order fulfilment. Include the country code."
                      htmlFor="review-customer-phone"
                    >
                      <Input
                        id="review-customer-phone"
                        type="tel"
                        value={customerPhone}
                        onChange={(event) => {
                          setCustomerPhone(event.target.value);
                          setError(null);
                        }}
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                        disabled={isSavingPhone}
                        className="h-11 border-emerald-200 bg-white"
                      />
                    </FormField>
                    <Button
                      type="button"
                      onClick={saveCustomerPhone}
                      disabled={isSavingPhone}
                      className="min-h-11"
                    >
                      {isSavingPhone ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="text-white" />
                          Saving...
                        </span>
                      ) : (
                        <ButtonLabel icon={PhoneIcon}>Save phone</ButtonLabel>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            <FormField label="Customer name or table number" htmlFor="review-customer-name">
              <Input
                id="review-customer-name"
                value={draft.customerName}
                onChange={(event) => {
                  updateDraft("customerName", event.target.value);

                  if (customerNameError && event.target.value.trim().length >= 2) {
                    setError(null);
                  }
                }}
                placeholder="Enter customer name or table number"
                disabled={isSubmitting}
                aria-invalid={Boolean(customerNameError)}
                aria-describedby={customerNameError ? "review-customer-name-error" : undefined}
                className="h-12 rounded-xl border-stone-200 bg-white px-4 text-base aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-100"
              />
              {customerNameError ? (
                <p id="review-customer-name-error" className="text-sm text-rose-600">
                  {customerNameError}
                </p>
              ) : null}
            </FormField>

            {reviewError ? <p className="text-sm text-rose-600">{reviewError}</p> : null}

            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-stone-950">Order summary</p>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
                  {totalQuantity} item(s)
                </p>
              </div>

              <div className="mt-4 grid gap-3">
                {cartItems.map((item) => {
                  const modifierUnitTotal = getCartItemModifierUnitTotal(item);
                  const itemUnitTotal = getCartItemUnitTotal(item);

                  return (
                    <div key={item.lineId} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900">
                          {item.drinkName} x{item.quantity}
                        </p>
                        <p className="text-stone-500">{item.categoryName}</p>
                        <div className="mt-2 grid gap-1 text-xs text-stone-500">
                          <p>
                            Base item:{" "}
                            <span className="font-medium text-stone-700">
                              {formatPrice(item.unitPrice, { currency })}
                            </span>
                          </p>
                          {item.modifierSelections.length > 0 ? (
                            <p>
                              Add-ons:{" "}
                              <span className="font-medium text-stone-700">
                                {modifierUnitTotal > 0
                                  ? `+ ${formatPrice(modifierUnitTotal, { currency })}`
                                  : "Included"}
                              </span>
                            </p>
                          ) : null}
                          <p>
                            Item total:{" "}
                            <span className="font-medium text-stone-700">
                              {formatPrice(itemUnitTotal, { currency })}
                            </span>{" "}
                            each
                          </p>
                        </div>
                        {item.modifierSelections.length > 0 ? (
                          <div className="mt-2 grid gap-1">
                            {item.modifierSelections.map((modifier) => (
                              <p
                                key={`${item.lineId}-${modifier.groupId}-${modifier.modifierId}`}
                                className="text-xs text-stone-500"
                              >
                                {modifier.groupName}: {modifier.modifierName}
                                {Number(modifier.priceDelta) > 0
                                  ? ` + ${formatPrice(modifier.priceDelta, { currency })}`
                                  : ""}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {item.notes.trim() ? (
                          <p className="mt-1 text-xs text-stone-500">Note: {item.notes.trim()}</p>
                        ) : null}
                      </div>
                      <p className="font-medium text-stone-900">
                        {formatCartItemLineTotal(item, currency)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="my-4 border-t border-dashed border-stone-200" />

              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-4 text-stone-600">
                  <span>Items</span>
                  <span>{totalQuantity}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-stone-600">
                  <span>Pricing</span>
                  <span>{totalAmount ? "Calculated" : "Price on request"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-3 font-semibold text-stone-950">
                  <span>To Pay</span>
                  <span>{formatPrice(totalAmount, { currency })}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setScreen("menu");
                }}
                disabled={isSubmitting}
                className="min-h-12 rounded-lg py-3"
              >
                <ButtonLabel icon={ArrowLeftIcon}>Back to Menu</ButtonLabel>
              </Button>
              <Button
                type="button"
                onClick={confirmOrder}
                disabled={isSubmitting || cartItems.length === 0 || !canPlaceOrder}
                className="min-h-12 rounded-lg bg-stone-950 py-3 text-white hover:bg-stone-800"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    Placing Order...
                  </span>
                ) : (
                  <ButtonLabel icon={SendIcon}>Confirm Order</ButtonLabel>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card className="overflow-visible rounded-xl border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
        <CardHeader className="px-6 pt-6">
          <SectionHeader
            eyebrow="Place an order"
            title="What Are You Having Today?"
            meta={
              <p className="text-sm text-stone-600">
                Build the order from the menu, then review everything in the cart drawer.
              </p>
            }
            className="mb-0"
          />
        </CardHeader>

        <CardContent className="px-6 pb-6">
          <div className="grid gap-5">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-stone-950">Choose your drinks</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Tap add on any card, then adjust quantity and notes in the cart.
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
                  {isLoadingMenu ? "Loading menu..." : `${menuCategories.length} categories - ${totalProducts} products`}
                </p>
              </div>

              {!isLoadingMenu && availableTags.length > 0 ? (
                <div className="rounded-xl border border-stone-200 bg-white/80 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    <TagsIcon className="size-3.5" />
                    Filter by tag
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Button
                      type="button"
                      variant={selectedTagId ? "outline" : "default"}
                      onClick={() => setSelectedTagId(null)}
                      className={
                        selectedTagId
                          ? "h-9 shrink-0 rounded-lg border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-100"
                          : "h-9 shrink-0 rounded-lg bg-stone-950 px-4 text-sm text-white hover:bg-stone-800"
                      }
                    >
                      All
                    </Button>
                    {availableTags.map((tag) => (
                      <Button
                        key={tag.id}
                        type="button"
                        variant={selectedTagId === tag.id ? "default" : "outline"}
                        onClick={() => setSelectedTagId(tag.id)}
                        className={
                          selectedTagId === tag.id
                            ? "h-9 shrink-0 rounded-lg bg-stone-950 px-4 text-sm text-white hover:bg-stone-800"
                            : "h-9 shrink-0 rounded-lg border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-100"
                        }
                      >
                        {tag.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {isLoadingMenu ? (
                <div className="grid gap-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-xl border border-stone-200 bg-white p-4">
                      <div className="h-5 w-32 animate-pulse rounded-md bg-stone-200" />
                      <div className="mt-4 grid gap-4">
                        {Array.from({ length: 4 }).map((__, cardIndex) => (
                          <div
                            key={cardIndex}
                            className="grid grid-cols-[1fr_92px] gap-4 border-b border-stone-100 pb-4 last:border-b-0"
                          >
                            <div className="space-y-2">
                              <div className="h-4 w-3/4 animate-pulse rounded-md bg-stone-200" />
                              <div className="h-3 w-full animate-pulse rounded-md bg-stone-100" />
                              <div className="h-3 w-2/3 animate-pulse rounded-md bg-stone-100" />
                              <div className="h-8 w-24 animate-pulse rounded-lg bg-stone-100" />
                            </div>
                            <div className="aspect-square animate-pulse rounded-lg bg-stone-100" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-6">
                  {visibleMenuCategories.length > 0 ? (
                    <>
                    <div ref={categoryBarSentinelRef} className="h-px" />
                    <div
                      className={`sticky top-0 z-20 overflow-x-auto border-y border-stone-200 px-4 py-3 shadow-sm backdrop-blur transition-[margin,padding,background-color] duration-200 ${
                        isCategoryBarStuck
                          ? "-mx-6 bg-white/70 px-6"
                          : "bg-white/95"
                      }`}
                    >
                      <div className="flex min-w-max gap-2">
                        {visibleMenuCategories.map((category) => (
                          <Button
                            key={category.id}
                            type="button"
                            variant={currentActiveCategoryId === category.id ? "default" : "outline"}
                            onClick={() => scrollToCategory(category.id)}
                            className={
                              currentActiveCategoryId === category.id
                                ? "h-9 rounded-lg bg-stone-950 px-4 text-sm text-white hover:bg-stone-800"
                                : "h-9 rounded-lg border-stone-300 bg-white px-4 text-sm text-stone-700 hover:bg-stone-100"
                            }
                          >
                            {category.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                    </>
                  ) : null}

                  {visibleMenuCategories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-stone-950">No matching menu items</p>
                      <p className="mt-2 text-sm text-stone-500">
                        Choose another tag or clear the filter to see the full menu.
                      </p>
                    </div>
                  ) : null}

                  {visibleMenuCategories.map((category) => (
                    <section
                      key={category.id}
                      id={`menu-category-${category.id}`}
                      ref={(element) => {
                        categoryRefs.current[category.id] = element;
                      }}
                      className="scroll-mt-28 rounded-xl border border-stone-200 bg-white p-4"
                    >
                      <div className="mb-4">
                        <p className="text-xl font-semibold text-stone-950">{category.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                          {category.items.length} options
                        </p>
                        {category.description ? (
                          <p className="mt-2 text-sm text-stone-600">{category.description}</p>
                        ) : null}
                      </div>

                      {category.items.length === 0 ? (
                        <p className="text-sm text-stone-500">No drinks in this category yet.</p>
                      ) : (
                        <div className="grid gap-4">
                          {category.items.map((drink) => {
                            const selectedCartItems = cartItems.filter(
                              (item) => item.drinkId === drink.id,
                            );
                            const cartItem = selectedCartItems[0] ?? null;
                            const latestCartItem =
                              selectedCartItems[selectedCartItems.length - 1] ?? null;
                            const selectedQuantity = selectedCartItems.reduce(
                              (sum, item) => sum + item.quantity,
                              0,
                            );
                            const hasSelectedItem = selectedQuantity > 0;
                            const hasModifiers = Boolean(drink.modifierGroups?.length);
                            const stockLimit = getStockLimit(drink);
                            const hasReachedStockLimit =
                              stockLimit !== null && selectedQuantity >= stockLimit;
                            const isUnavailable =
                              drink.isSoldOut || drink.isUnavailableDueToStock;
                            const unavailableLabel = drink.isSoldOut
                              ? "Sold out"
                              : drink.isUnavailableDueToStock
                                ? "Out of stock"
                                : null;

                            return (
                              <div
                                key={drink.id}
                                className={`grid grid-cols-[1fr_96px] gap-4 border-b border-stone-100 pb-4 last:border-b-0 sm:grid-cols-[1fr_128px] ${
                                  hasSelectedItem ? "rounded-lg bg-emerald-50/70 p-3 ring-1 ring-emerald-200" : ""
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold leading-snug text-stone-950">
                                      {drink.name}
                                    </p>
                                    {hasSelectedItem ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-stone-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                                        <CheckIcon className="size-3" />
                                        x{selectedQuantity}
                                      </span>
                                    ) : null}
                                    {unavailableLabel ? (
                                      <span className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                                        {unavailableLabel}
                                      </span>
                                    ) : null}
                                    {drink.inventoryStatus === "low" ? (
                                      <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                                        Low stock
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-sm text-stone-500">
                                    {drink.description || ""}
                                  </p>
                                  {drink.tags && drink.tags.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {drink.tags.map((tag) => (
                                        <span
                                          key={tag.id}
                                          className="rounded-md border border-stone-200 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600"
                                        >
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  {drink.modifierGroups && drink.modifierGroups.length > 0 ? (
                                    <div className="mt-2">
                                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                        Customizable
                                      </span>
                                    </div>
                                  ) : null}
                                  <p className="mt-3 text-sm font-semibold text-stone-950">
                                    {formatPrice(drink.price ?? null, { currency })}
                                  </p>
                                  {hasModifiers && latestCartItem ? (
                                    <div className="mt-3 inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => decreaseCartItemQuantity(latestCartItem.lineId)}
                                        disabled={isSubmitting}
                                        aria-label={`Reduce ${drink.name} quantity`}
                                        className="h-9 rounded-none px-3 text-emerald-900 hover:bg-emerald-50"
                                      >
                                        <MinusIcon className="size-4" />
                                      </Button>
                                      <span className="min-w-10 px-3 text-center text-sm font-semibold text-stone-950">
                                        {selectedQuantity}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => requestQuantityIncrease(latestCartItem)}
                                        disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                        aria-label={`Increase ${drink.name} quantity`}
                                        className="h-9 rounded-none px-3 text-emerald-900 hover:bg-emerald-50 disabled:text-stone-300"
                                      >
                                        <PlusIcon className="size-4" />
                                      </Button>
                                    </div>
                                  ) : hasModifiers ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => addToCart(category, drink)}
                                      disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                      className={
                                        isUnavailable || hasReachedStockLimit
                                          ? "mt-3 h-9 rounded-lg border-stone-300 bg-stone-100 px-4 text-stone-400"
                                          : "mt-3 h-9 rounded-lg border-stone-300 bg-white px-4 text-stone-700 hover:bg-stone-100"
                                      }
                                    >
                                      {!isUnavailable && !hasReachedStockLimit ? (
                                        <TagsIcon className="size-4" />
                                      ) : null}
                                      {isUnavailable
                                        ? unavailableLabel
                                        : hasReachedStockLimit
                                          ? "Limit reached"
                                          : "Customize"}
                                    </Button>
                                  ) : cartItem ? (
                                    <div className="mt-3 inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => decreaseCartItemQuantity(cartItem.lineId)}
                                        disabled={isSubmitting}
                                        aria-label={`Reduce ${drink.name} quantity`}
                                        className="h-9 rounded-none px-3 text-emerald-900 hover:bg-emerald-50"
                                      >
                                        <MinusIcon className="size-4" />
                                      </Button>
                                      <span className="min-w-10 px-3 text-center text-sm font-semibold text-stone-950">
                                        {selectedQuantity}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => requestQuantityIncrease(cartItem)}
                                        disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                        aria-label={`Increase ${drink.name} quantity`}
                                        className="h-9 rounded-none px-3 text-emerald-900 hover:bg-emerald-50 disabled:text-stone-300"
                                      >
                                        <PlusIcon className="size-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => addToCart(category, drink)}
                                      disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                      className={
                                        isUnavailable || hasReachedStockLimit
                                          ? "mt-3 h-9 rounded-lg border-stone-300 bg-stone-100 px-4 text-stone-400"
                                          : "mt-3 h-9 rounded-lg border-stone-300 bg-white px-4 text-stone-700 hover:bg-stone-100"
                                      }
                                    >
                                      {!isUnavailable && !hasReachedStockLimit ? (
                                        <PlusIcon className="size-4" />
                                      ) : null}
                                      {isUnavailable
                                        ? unavailableLabel
                                        : hasReachedStockLimit
                                          ? "Limit reached"
                                          : "Add"}
                                    </Button>
                                  )}
                                </div>

                                <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                                  {drink.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={drink.imageUrl}
                                      alt={drink.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-stone-300">
                                      <ImageIcon className="size-7" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>

            {menuError ? <p className="text-sm text-rose-600">{menuError}</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
        </CardContent>
      </Card>
      )}

      {screen === "menu" && cartItems.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(40,26,20,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-950">
                {totalQuantity} item(s) selected
              </p>
              <p className="truncate text-xs text-stone-500">
                {cartItems[0].drinkName}
                {cartItems.length > 1 ? ` + ${cartItems.length - 1} more` : ""}
                {" - "}
                {formatPrice(totalAmount, { currency })}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setIsCartOpen(true)}
              disabled={isSubmitting || isLoadingMenu || Boolean(menuError)}
              className="h-12 shrink-0 rounded-lg bg-stone-950 px-5 text-white hover:bg-stone-800"
            >
              <ShoppingCartIcon className="size-4" />
              View Cart
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
