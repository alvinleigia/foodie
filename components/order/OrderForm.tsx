"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
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
import { getApiErrorMessage } from "@/lib/api-client";
import { formatPrice } from "@/lib/formatters";
import { FormField } from "@/components/shared/FormField";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { MenuCategoryRecord, MenuItemRecord } from "@/types/menu";

type OrderFormProps = {
  locationQrSlug?: string;
  locationSlug?: string;
  onOrderCreated?: (order: LocalCustomerOrder) => void;
};

type CartItem = {
  categoryId: string;
  categoryName: string;
  drinkId: string;
  drinkName: string;
  quantity: number;
  notes: string;
  unitPrice: string | null;
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

export function OrderForm({ locationQrSlug, locationSlug, onOrderCreated }: OrderFormProps) {
  const router = useRouter();
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRecord[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [draft, setDraft] = useState<OrderDraft>({
    customerName: "",
  });
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [screen, setScreen] = useState<"menu" | "review">("menu");
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [isCategoryBarStuck, setIsCategoryBarStuck] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryBarSentinelRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (visibleMenuCategories.some((category) => category.id === activeCategoryId)) {
      return;
    }

    setActiveCategoryId(visibleMenuCategories[0]?.id);
  }, [activeCategoryId, visibleMenuCategories]);

  const totalProducts = useMemo(
    () => visibleMenuCategories.reduce((count, category) => count + category.items.length, 0),
    [visibleMenuCategories],
  );

  const totalMenuProducts = useMemo(
    () => menuCategories.reduce((count, category) => count + category.items.length, 0),
    [menuCategories],
  );

  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const totalAmount = useMemo(() => {
    const pricedTotal = cartItems.reduce((sum, item) => {
      if (!item.unitPrice) {
        return sum;
      }

      return sum + Number(item.unitPrice) * item.quantity;
    }, 0);

    const hasAnyPrice = cartItems.some((item) => item.unitPrice);
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

  function addToCart(category: MenuCategoryRecord, drink: MenuItemRecord) {
    if (drink.isSoldOut || drink.isUnavailableDueToStock) {
      setError(`${drink.name} is currently unavailable.`);
      return;
    }

    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex((item) => item.drinkId === drink.id);

      if (existingIndex >= 0) {
        return currentItems.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...currentItems,
        {
          categoryId: category.id,
          categoryName: category.name,
          drinkId: drink.id,
          drinkName: drink.name,
          quantity: 1,
          notes: "",
          unitPrice: drink.price ?? null,
        },
      ];
    });
    setError(null);
  }

  function updateCartItem(drinkId: string, updater: (item: CartItem) => CartItem | null) {
    setCartItems((currentItems) =>
      currentItems.flatMap((item) => {
        if (item.drinkId !== drinkId) {
          return [item];
        }

        const nextItem = updater(item);
        return nextItem ? [nextItem] : [];
      }),
    );
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

    setError(null);
    setIsCartOpen(false);
    setScreen("review");
  }

  async function confirmOrder() {
    if (draft.customerName.trim().length < 2) {
      setError("Please enter the customer's name.");
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
                {cartItems.map((item) => (
                  <div key={item.drinkId} className="rounded-xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-stone-950">{item.drinkName}</p>
                        <p className="text-sm text-stone-500">{item.categoryName}</p>
                        <p className="mt-1 text-sm font-semibold text-stone-900">
                          {formatPrice(item.unitPrice, { currency })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => updateCartItem(item.drinkId, () => null)}
                        className="rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                      >
                        <Trash2Icon className="size-4" />
                        Remove
                      </Button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-stone-200">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            updateCartItem(item.drinkId, (current) =>
                              current.quantity <= 1
                                ? null
                                : { ...current, quantity: current.quantity - 1 },
                            )
                          }
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
                          onClick={() =>
                            updateCartItem(item.drinkId, (current) => ({
                              ...current,
                              quantity: Math.min(current.quantity + 1, 20),
                            }))
                          }
                          className="rounded-none"
                        >
                          <PlusIcon className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <FormField label="Notes for this item">
                        <Textarea
                          value={item.notes}
                          onChange={(event) =>
                            updateCartItem(item.drinkId, (current) => ({
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
                ))}
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

      {screen === "review" ? (
        <Card className="overflow-hidden rounded-xl border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
          <CardHeader className="px-6 pt-6">
            <SectionHeader
              eyebrow="Review order"
              title="Confirm order"
              meta={
                <p className="text-sm text-stone-600">
                  Add the customer name and double-check the cart before sending it to the bar queue.
                </p>
              }
              className="mb-0"
            />
          </CardHeader>

          <CardContent className="grid gap-4 px-6 pb-6">
            <FormField label="Customer name" htmlFor="review-customer-name">
              <Input
                id="review-customer-name"
                value={draft.customerName}
                onChange={(event) => {
                  updateDraft("customerName", event.target.value);

                  if (customerNameError && event.target.value.trim().length >= 2) {
                    setError(null);
                  }
                }}
                placeholder="Enter customer name"
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
                {cartItems.map((item) => (
                  <div key={item.drinkId} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">
                        {item.drinkName} x{item.quantity}
                      </p>
                      <p className="text-stone-500">{item.categoryName}</p>
                      {item.notes.trim() ? (
                        <p className="mt-1 text-xs text-stone-500">Note: {item.notes.trim()}</p>
                      ) : null}
                    </div>
                    <p className="font-medium text-stone-900">
                      {item.unitPrice
                        ? formatPrice(Number(item.unitPrice) * item.quantity, { currency })
                        : "-"}
                    </p>
                  </div>
                ))}
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
                disabled={isSubmitting || cartItems.length === 0}
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
            title="Pick Your Next Pour"
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
                  {isLoadingMenu ? "Loading menu..." : `${menuCategories.length} categories • ${totalProducts} products`}
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
                            variant={activeCategoryId === category.id ? "default" : "outline"}
                            onClick={() => scrollToCategory(category.id)}
                            className={
                              activeCategoryId === category.id
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
                            const cartItem = cartItems.find((item) => item.drinkId === drink.id);
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
                                  cartItem ? "rounded-lg bg-emerald-50/70 p-3 ring-1 ring-emerald-200" : ""
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold leading-snug text-stone-950">
                                      {drink.name}
                                    </p>
                                    {cartItem ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-stone-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                                        <CheckIcon className="size-3" />
                                        x{cartItem.quantity}
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
                                    {drink.description || "Freshly prepared at the bar."}
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
                                  <p className="mt-3 text-sm font-semibold text-stone-950">
                                    {formatPrice(drink.price ?? null, { currency })}
                                  </p>
                                  {cartItem ? (
                                    <div className="mt-3 inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() =>
                                          updateCartItem(drink.id, (current) =>
                                            current.quantity <= 1
                                              ? null
                                              : { ...current, quantity: current.quantity - 1 },
                                          )
                                        }
                                        disabled={isSubmitting}
                                        aria-label={`Reduce ${drink.name} quantity`}
                                        className="h-9 rounded-none px-3 text-emerald-900 hover:bg-emerald-50"
                                      >
                                        <MinusIcon className="size-4" />
                                      </Button>
                                      <span className="min-w-10 px-3 text-center text-sm font-semibold text-stone-950">
                                        {cartItem.quantity}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() =>
                                          updateCartItem(drink.id, (current) => ({
                                            ...current,
                                            quantity: Math.min(current.quantity + 1, 20),
                                          }))
                                        }
                                        disabled={isSubmitting || isUnavailable}
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
                                      disabled={isSubmitting || isUnavailable}
                                      className={
                                        isUnavailable
                                          ? "mt-3 h-9 rounded-lg border-stone-300 bg-stone-100 px-4 text-stone-400"
                                          : "mt-3 h-9 rounded-lg border-stone-300 bg-white px-4 text-stone-700 hover:bg-stone-100"
                                      }
                                    >
                                      {!isUnavailable ? <PlusIcon className="size-4" /> : null}
                                      {isUnavailable ? unavailableLabel : "Add"}
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
                {" • "}
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
