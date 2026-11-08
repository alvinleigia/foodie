"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckIcon,
  CreditCardIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ShoppingCartIcon,
  TagsIcon,
  TimerIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { CountryCode } from "libphonenumber-js";

import { LocalCustomerOrder } from "@/lib/constants";
import {
  readStoredCustomerOrders,
  syncCustomerOrdersResetMarker,
  writeStoredCustomerOrders,
} from "@/lib/customer-orders";
import { getApiErrorMessage } from "@/lib/api-client";
import { filterMenuCategories } from "@/lib/menu-search";
import { formatPrice } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale-defaults";
import {
  calculateBasisPointsAmount,
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import { getCustomerPrivacyHref } from "@/lib/customer-navigation";
import {
  calculateMultiTaxPricing,
  type TaxComponentInput,
  type TaxPricingMode,
} from "@/lib/tax-pricing";
import { withStaffRestaurantContext } from "@/lib/staff-restaurant-navigation";
import {
  queueOfflineStaffOrder,
  readOfflineStaffOrders,
  syncOfflineStaffOrders,
} from "@/lib/offline-staff-orders";
import {
  isValidCustomerPhone,
  getCustomerPhoneCountryCode,
  normalizeCustomerPhone,
} from "@/lib/validations/customer";
import { FormField } from "@/components/shared/FormField";
import { PhoneNumberInput } from "@/components/shared/PhoneNumberInput";
import {
  StaffCustomerSearch,
  type StaffCustomerSummary,
} from "@/components/order/StaffCustomerSearch";
import {
  CustomerLoginForm,
  type CustomerAuthProviders,
} from "@/components/order/CustomerLoginForm";
import { FulfilmentTypeSelector } from "@/components/order/FulfilmentTypeSelector";
import { CustomerRestaurantHeader } from "@/components/order/CustomerRestaurantHeader";
import { MenuItemDescription } from "@/components/order/MenuItemDescription";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { AllergenSummary } from "@/components/shared/AllergenSummary";
import { MenuSectionSkeleton } from "@/components/shared/SectionSkeletons";
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
  supportsScheduledFulfilment,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";
import {
  checkoutContactRequirementLabels,
  getPayLaterLabel,
  isCheckoutContactValid,
  type CheckoutPaymentTiming,
  type RestaurantCheckoutPolicy,
} from "@/lib/checkout-policy";
import type { RestaurantChargeSettings } from "@/lib/restaurant-charge-settings";
import {
  DEFAULT_COUNTRY_CODE,
  isSupportedCountryCode,
} from "@/lib/countries";
import { toLocalDateTimeInputValue } from "@/lib/order-fulfilment-time";
import {
  MenuCategoryRecord,
  MenuItemRecord,
  MenuModifierGroupRecord,
  MenuModifierOptionRecord,
  CustomerRestaurantIdentity,
} from "@/types/menu";

type OrderFormProps = {
  customer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    phoneVerifiedAt?: string | null;
  } | null;
  customerAuthProviders: CustomerAuthProviders;
  chargeSettings: RestaurantChargeSettings;
  checkoutPolicies: RestaurantCheckoutPolicy[];
  initialMenuData?: OrderFormMenuData;
  restaurant?: CustomerRestaurantIdentity | null;
  isStaffOrder?: boolean;
  openDineInOrder?: {
    customerName: string;
    id: string;
    orderNo: number;
  } | null;
  orderingPointQrSlug?: string;
  routeSlug?: string;
  staffRestaurantSlug?: string;
  stripePaymentsEnabled?: boolean;
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
  taxes: TaxComponentInput[];
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
  customerEmail: string;
  customerPhone: string;
  checkoutMode: "GUEST" | "ACCOUNT";
  paymentTiming: CheckoutPaymentTiming;
  fulfilmentType: OrderFulfilmentType;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryPostalCode: string;
  deliveryCountryCode: string;
  deliveryInstructions: string;
  fulfilmentTiming: "ASAP" | "SCHEDULED";
  scheduledFulfilmentAt: string;
  tipRateBps: number;
};

export type RestaurantTaxPricing = {
  pricingMode: TaxPricingMode;
  taxRateBps: number;
  taxesByMenuItemId: Record<string, TaxComponentInput[]>;
  taxOverridesByFulfilmentType: Partial<
    Record<OrderFulfilmentType, Record<string, TaxComponentInput[]>>
  >;
};

export type OrderFormMenuData = {
  categories: MenuCategoryRecord[];
  countryCode: string;
  currency: string;
  taxPricing: RestaurantTaxPricing;
};

const defaultTaxPricing: RestaurantTaxPricing = {
  pricingMode: "INCLUSIVE",
  taxRateBps: 0,
  taxesByMenuItemId: {},
  taxOverridesByFulfilmentType: {},
};

const customerTagColors: Record<string, string> = {
  red: "border-rose-200 bg-rose-50 text-rose-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-sky-200 bg-sky-50 text-sky-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
};
const customerItemActionClassName = "min-w-24 border-teal-200 bg-teal-50/70 font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-200 dark:bg-teal-50/70 dark:text-teal-800 dark:hover:bg-teal-100";

function getMenuItemTaxes(
  taxPricing: RestaurantTaxPricing,
  menuItemId: string,
  fulfilmentType: OrderFulfilmentType,
) {
  const fulfilmentOverride =
    taxPricing.taxOverridesByFulfilmentType?.[fulfilmentType]?.[menuItemId];

  if (fulfilmentOverride !== undefined) {
    return fulfilmentOverride;
  }

  const resolvedTaxes = taxPricing.taxesByMenuItemId?.[menuItemId];

  if (resolvedTaxes !== undefined) {
    return resolvedTaxes;
  }

  return taxPricing.taxRateBps > 0
    ? [
        {
          calculationOrder: 0,
          code: "DEFAULT",
          definitionId: null,
          isCompound: false,
          name: "Tax",
          rateBps: taxPricing.taxRateBps,
          treatment: "TAXABLE" as const,
        },
      ]
    : [];
}

function formatCartTaxLabel(component: TaxComponentInput) {
  if (component.treatment === "EXEMPT") {
    return `${component.name} (exempt)`;
  }

  if (component.treatment === "OUT_OF_SCOPE") {
    return `${component.name} (out of scope)`;
  }

  const rate = (component.rateBps / 100).toFixed(2).replace(/\.00$/, "");
  return `${component.name} (${rate}%)`;
}

function withOrderContext(
  path: string,
  options: {
    orderingPointQrSlug?: string;
    routeSlug?: string;
    staffRestaurantSlug?: string;
  },
) {
  const { orderingPointQrSlug, routeSlug, staffRestaurantSlug } = options;

  if (staffRestaurantSlug) {
    return withStaffRestaurantContext(path, staffRestaurantSlug);
  }

  if (orderingPointQrSlug) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}qr=${encodeURIComponent(orderingPointQrSlug)}`;
  }

  if (!routeSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}route=${encodeURIComponent(routeSlug)}`;
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

function formatCartItemLineTotal(item: CartItem, options: Parameters<typeof formatPrice>[1]) {
  const lineTotal = getCartItemLineTotal(item);
  return lineTotal === null ? "-" : formatPrice(lineTotal, options);
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

function getCartItemCustomizationSummary(item: CartItem) {
  if (item.modifierSelections.length === 0) {
    return "No add-ons selected";
  }

  return item.modifierSelections
    .map((selection) =>
      selection.quantity > 1
        ? `${selection.modifierName} x${selection.quantity}`
        : selection.modifierName,
    )
    .join(" · ");
}

export function OrderForm({
  customer,
  customerAuthProviders,
  chargeSettings,
  checkoutPolicies,
  initialMenuData,
  restaurant,
  isStaffOrder = false,
  openDineInOrder,
  orderingPointQrSlug,
  routeSlug,
  staffRestaurantSlug,
  stripePaymentsEnabled = true,
  onOrderCreated,
}: OrderFormProps) {
  const router = useRouter();
  const enabledCheckoutPolicies = checkoutPolicies.filter((policy) => {
    if (!policy.isEnabled) {
      return false;
    }

    if (isStaffOrder) {
      return true;
    }

    const hasPaymentPath =
      policy.payLaterEnabled ||
      (policy.onlinePaymentEnabled && stripePaymentsEnabled);
    const hasLoginProvider =
      customerAuthProviders.google ||
      customerAuthProviders.apple ||
      customerAuthProviders.facebook ||
      (customerAuthProviders.email && policy.emailOtpLoginEnabled) ||
      (customerAuthProviders.phone && policy.smsOtpLoginEnabled);

    return (
      (policy.guestCheckoutEnabled &&
        policy.onlinePaymentEnabled &&
        stripePaymentsEnabled) ||
      (policy.accountCheckoutEnabled &&
        hasPaymentPath &&
        (Boolean(customer) || hasLoginProvider))
    );
  });
  const initialCheckoutPolicy =
    enabledCheckoutPolicies.find((policy) => policy.fulfilmentType === "PICKUP") ??
    enabledCheckoutPolicies[0] ??
    checkoutPolicies[0];
  const initialCheckoutMode =
    customer && initialCheckoutPolicy?.accountCheckoutEnabled
      ? "ACCOUNT"
      : initialCheckoutPolicy?.guestCheckoutEnabled && stripePaymentsEnabled
        ? "GUEST"
        : "ACCOUNT";
  const initialPaymentTiming =
    initialCheckoutMode === "GUEST"
      ? "ONLINE"
      : initialCheckoutPolicy?.defaultPaymentTiming === "ONLINE" &&
          !stripePaymentsEnabled &&
          initialCheckoutPolicy.payLaterEnabled
        ? "PAY_LATER"
        : initialCheckoutPolicy?.defaultPaymentTiming ?? "ONLINE";
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRecord[]>(
    initialMenuData?.categories ?? [],
  );
  const [currency, setCurrency] = useState(
    initialMenuData?.currency ?? DEFAULT_CURRENCY,
  );
  const priceOptions = { currency, currencyDisplay: isStaffOrder ? "code" : "symbol" } as const;
  const configuredCountryCode = initialMenuData?.countryCode ?? "";
  const initialOperatingCountryCode: CountryCode = isSupportedCountryCode(
    configuredCountryCode,
  )
    ? configuredCountryCode
    : DEFAULT_COUNTRY_CODE;
  const [operatingCountryCode, setOperatingCountryCode] =
    useState<CountryCode>(initialOperatingCountryCode);
  const [phoneCountryCode, setPhoneCountryCode] = useState<CountryCode>(
    getCustomerPhoneCountryCode(customer?.phone) ?? initialOperatingCountryCode,
  );
  const [taxPricing, setTaxPricing] = useState(
    initialMenuData?.taxPricing ?? defaultTaxPricing,
  );
  const [draft, setDraft] = useState<OrderDraft>({
    customerName: openDineInOrder?.customerName ?? customer?.name ?? "",
    customerEmail: customer?.email ?? "",
    customerPhone: customer?.phone ?? "",
    checkoutMode: initialCheckoutMode,
    paymentTiming: initialPaymentTiming,
    fulfilmentType: openDineInOrder
      ? "DINE_IN"
      : initialCheckoutPolicy?.fulfilmentType ?? "PICKUP",
    deliveryAddressLine1: "",
    deliveryAddressLine2: "",
    deliveryCity: "",
    deliveryRegion: "",
    deliveryPostalCode: "",
    deliveryCountryCode: initialOperatingCountryCode,
    deliveryInstructions: "",
    fulfilmentTiming: "ASAP",
    scheduledFulfilmentAt: "",
    tipRateBps: 0,
  });

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState(!initialMenuData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStaffCustomer, setSelectedStaffCustomer] =
    useState<StaffCustomerSummary | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [focusedCartDrinkId, setFocusedCartDrinkId] = useState<string | null>(null);
  const [customizer, setCustomizer] = useState<CustomizerState | null>(null);
  const [customizerError, setCustomizerError] = useState<string | null>(null);
  const [quantityPromptItem, setQuantityPromptItem] = useState<CartItem | null>(null);
  const [screen, setScreen] = useState<"menu" | "review">("menu");
  const [offlineOrderCount, setOfflineOrderCount] = useState(() =>
    isStaffOrder ? readOfflineStaffOrders().length : 0,
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(
    initialMenuData?.categories[0]?.id,
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [isCategoryBarStuck, setIsCategoryBarStuck] = useState(false);
  const [showCheckoutErrors, setShowCheckoutErrors] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const categoryBarRef = useRef<HTMLDivElement | null>(null);
  const categoryBarSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isStaffOrder) return;

    async function syncQueuedOrders() {
      if (!navigator.onLine) return;
      const result = await syncOfflineStaffOrders();
      setOfflineOrderCount(result.pending);

      if (result.synced > 0) {
        toast.success(
          `${result.synced} offline ${result.synced === 1 ? "order" : "orders"} synced.`,
        );
      }
    }

    const handleOnline = () => void syncQueuedOrders();
    window.addEventListener("online", handleOnline);
    void syncQueuedOrders();

    return () => window.removeEventListener("online", handleOnline);
  }, [isStaffOrder]);
  const checkoutPolicy =
    checkoutPolicies.find(
      (policy) => policy.fulfilmentType === draft.fulfilmentType,
    ) ?? initialCheckoutPolicy;
  const effectiveCheckoutMode =
    customer && checkoutPolicy?.accountCheckoutEnabled
      ? "ACCOUNT"
      : draft.checkoutMode;
  const guestCheckoutAvailable = Boolean(
    checkoutPolicy?.guestCheckoutEnabled && stripePaymentsEnabled,
  );
  const normalizedContactEmail = draft.customerEmail.trim().toLowerCase();
  const normalizedContactPhone = normalizeCustomerPhone(
    draft.customerPhone,
    phoneCountryCode,
  );
  const hasValidContactEmail =
    !normalizedContactEmail || /^\S+@\S+\.\S+$/.test(normalizedContactEmail);
  const hasValidContactPhone =
    !normalizedContactPhone ||
    isValidCustomerPhone(draft.customerPhone, phoneCountryCode);
  const hasRequiredContact = Boolean(
    checkoutPolicy &&
      isCheckoutContactValid(checkoutPolicy.contactRequirement, {
        email: normalizedContactEmail,
        phone: normalizedContactPhone,
      }),
  );
  const allowedFulfilmentTypes = enabledCheckoutPolicies.map(
    (policy) => policy.fulfilmentType,
  );
  const availableCustomerAuthProviders: CustomerAuthProviders = {
    ...customerAuthProviders,
    email:
      customerAuthProviders.email &&
      Boolean(checkoutPolicy?.emailOtpLoginEnabled),
    phone:
      customerAuthProviders.phone &&
      Boolean(checkoutPolicy?.smsOtpLoginEnabled),
  };
  const hasCustomerLoginProvider = Object.values(
    availableCustomerAuthProviders,
  ).some(Boolean);
  const contactRequirement = checkoutPolicy?.contactRequirement;
  const isEmailRequired =
    contactRequirement === "EMAIL" || contactRequirement === "EMAIL_AND_PHONE";
  const isPhoneRequired =
    contactRequirement === "PHONE" || contactRequirement === "EMAIL_AND_PHONE";
  const contactNameError =
    draft.customerName.trim().length < 2
      ? "Enter your full name."
      : null;
  const contactEmailError =
    isEmailRequired && !normalizedContactEmail
      ? "Enter your email address."
      : normalizedContactEmail && !hasValidContactEmail
        ? "Enter a valid email address, such as name@example.com."
        : contactRequirement === "EMAIL_OR_PHONE" &&
            !normalizedContactEmail &&
            !normalizedContactPhone
          ? "Enter an email address or mobile number."
          : null;
  const contactPhoneError =
    isPhoneRequired && !normalizedContactPhone
      ? "Enter your mobile number."
      : normalizedContactPhone && !hasValidContactPhone
        ? "Enter a valid mobile number for the selected country."
        : contactRequirement === "EMAIL_OR_PHONE" &&
            !normalizedContactEmail &&
            !normalizedContactPhone
          ? "Enter an email address or mobile number."
          : null;
  const deliveryAddressLine1Error =
    draft.fulfilmentType === "DELIVERY" && !draft.deliveryAddressLine1.trim()
      ? "Enter the delivery address."
      : null;
  const deliveryCityError =
    draft.fulfilmentType === "DELIVERY" && !draft.deliveryCity.trim()
      ? "Enter the town or city."
      : null;
  const deliveryPostalCodeError =
    draft.fulfilmentType === "DELIVERY" && !draft.deliveryPostalCode.trim()
      ? "Enter the postcode."
      : null;
  const deliveryCountryCodeError =
    draft.fulfilmentType === "DELIVERY" &&
    draft.deliveryCountryCode.trim().length !== 2
      ? "Enter a two-letter country code."
      : null;
  const scheduledFulfilmentError =
    supportsScheduledFulfilment(draft.fulfilmentType) &&
    draft.fulfilmentTiming === "SCHEDULED" &&
    (!draft.scheduledFulfilmentAt ||
      Number.isNaN(new Date(draft.scheduledFulfilmentAt).getTime()) ||
      new Date(draft.scheduledFulfilmentAt).getTime() <= Date.now())
      ? "Choose a future date and time."
      : null;
  const hasCheckoutFieldErrors = Boolean(
    contactNameError ||
      contactEmailError ||
      contactPhoneError ||
      deliveryAddressLine1Error ||
      deliveryCityError ||
      deliveryPostalCodeError ||
      deliveryCountryCodeError ||
      scheduledFulfilmentError,
  );
  const canPlaceOrder =
    isStaffOrder ||
    Boolean(
      checkoutPolicy?.isEnabled &&
        draft.customerName.trim().length >= 2 &&
        hasValidContactEmail &&
        hasValidContactPhone &&
        hasRequiredContact &&
        (effectiveCheckoutMode === "GUEST"
          ? guestCheckoutAvailable
          : customer && checkoutPolicy.accountCheckoutEnabled) &&
        (draft.paymentTiming === "ONLINE"
          ? checkoutPolicy.onlinePaymentEnabled && stripePaymentsEnabled
          : effectiveCheckoutMode === "ACCOUNT" && checkoutPolicy.payLaterEnabled),
    );
  const privacyHref = getCustomerPrivacyHref({
    orderingPointQrSlug,
    routeSlug,
  });

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

  const visibleMenuCategories = useMemo(
    () => filterMenuCategories(menuCategories, menuSearch, selectedTagId),
    [menuCategories, menuSearch, selectedTagId],
  );

  useEffect(() => {
    if (initialMenuData) {
      return;
    }

    let isMounted = true;

    async function loadMenu() {
      setIsLoadingMenu(true);
      const response = await fetch(
        withOrderContext("/api/menu", {
          orderingPointQrSlug,
          routeSlug,
          staffRestaurantSlug,
        }),
      );
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
        setCurrency(payload.currency ?? DEFAULT_CURRENCY);
        if (isSupportedCountryCode(payload.countryCode ?? "")) {
          setOperatingCountryCode(payload.countryCode);
          setPhoneCountryCode(payload.countryCode);
          setDraft((current) => ({
            ...current,
            deliveryCountryCode: payload.countryCode,
          }));
        }
        setTaxPricing(payload.taxPricing ?? defaultTaxPricing);
        setMenuError(null);
        setIsLoadingMenu(false);
        setActiveCategoryId(payload.categories?.[0]?.id);
      }
    }

    void loadMenu();

    return () => {
      isMounted = false;
    };
  }, [initialMenuData, orderingPointQrSlug, routeSlug, staffRestaurantSlug]);

  useEffect(() => {
    if (screen !== "menu" || visibleMenuCategories.length === 0) {
      return;
    }

    let animationFrame: number | null = null;

    function updateActiveCategory() {
      animationFrame = null;
      const activationLine = (categoryBarRef.current?.getBoundingClientRect().bottom ?? 0) + 64;
      let nextCategoryId = visibleMenuCategories[0]?.id;

      // Track headings rather than visible percentages: categories can be much
      // taller than the viewport, especially on phones.
      for (const category of visibleMenuCategories) {
        const element = categoryRefs.current[category.id];

        if (element && element.getBoundingClientRect().top <= activationLine) {
          nextCategoryId = category.id;
        }
      }

      setActiveCategoryId(nextCategoryId);
    }

    function scheduleUpdate() {
      animationFrame ??= window.requestAnimationFrame(updateActiveCategory);
    }

    updateActiveCategory();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [screen, visibleMenuCategories]);

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
  }, [screen, visibleMenuCategories]);

  const totalProducts = useMemo(
    () => visibleMenuCategories.reduce((count, category) => count + category.items.length, 0),
    [visibleMenuCategories],
  );

  const currentActiveCategoryId = visibleMenuCategories.some(
    (category) => category.id === activeCategoryId,
  )
    ? activeCategoryId
    : visibleMenuCategories[0]?.id;

  useEffect(() => {
    const bar = categoryBarRef.current;
    const button = currentActiveCategoryId
      ? categoryButtonRefs.current[currentActiveCategoryId]
      : null;

    if (screen !== "menu" || !bar || !button) {
      return;
    }

    const barBounds = bar.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const inset = 12;
    const offset = buttonBounds.left < barBounds.left + inset
      ? buttonBounds.left - barBounds.left - inset
      : buttonBounds.right > barBounds.right - inset
        ? buttonBounds.right - barBounds.right + inset
        : 0;

    if (offset !== 0) {
      bar.scrollBy({
        left: offset,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }, [currentActiveCategoryId, screen]);

  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );
  const focusedCartItems = focusedCartDrinkId
    ? cartItems.filter((item) => item.drinkId === focusedCartDrinkId)
    : [];
  const isCartProductFocused = focusedCartItems.length > 0;
  const displayedCartItems = isCartProductFocused ? focusedCartItems : cartItems;
  const focusedCartQuantity = focusedCartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const cartPricing = useMemo(() => {
    let hasAnyPrice = false;
    let listedSubtotalMinor = 0;
    let taxAmountMinor = 0;
    let totalAmountMinor = 0;
    const taxComponents = new Map<
      string,
      TaxComponentInput & {
        taxableAmountMinor: number;
        taxAmountMinor: number;
      }
    >();

    for (const item of cartItems) {
      const listedUnitTotal = getCartItemUnitTotal(item);

      if (listedUnitTotal === null) {
        continue;
      }

      hasAnyPrice = true;
      const itemTaxes = getMenuItemTaxes(
        taxPricing,
        item.drinkId,
        draft.fulfilmentType,
      );
      const unitPricing = calculateMultiTaxPricing(
        decimalToMinorUnits(String(listedUnitTotal), currency),
        itemTaxes,
        taxPricing.pricingMode,
      );
      listedSubtotalMinor += unitPricing.listedAmountMinor * item.quantity;
      taxAmountMinor += unitPricing.taxAmountMinor * item.quantity;
      totalAmountMinor += unitPricing.totalAmountMinor * item.quantity;

      for (const component of unitPricing.components) {
        const key = [
          component.code,
          component.name,
          component.treatment,
          component.rateBps,
          component.isCompound,
          component.calculationOrder,
        ].join("|");
        const summary = taxComponents.get(key) ?? {
          ...component,
          taxableAmountMinor: 0,
          taxAmountMinor: 0,
        };

        summary.taxableAmountMinor +=
          component.taxableAmountMinor * item.quantity;
        summary.taxAmountMinor += component.taxAmountMinor * item.quantity;
        taxComponents.set(key, summary);
      }
    }

    if (!hasAnyPrice) {
      return null;
    }

    return {
      listedSubtotal: minorUnitsToDecimal(listedSubtotalMinor, currency),
      taxAmount: minorUnitsToDecimal(taxAmountMinor, currency),
      taxComponents: [...taxComponents.values()]
        .sort(
          (left, right) =>
            left.calculationOrder - right.calculationOrder ||
            left.code.localeCompare(right.code),
        )
        .map((component) => ({
          ...component,
          taxableAmount: minorUnitsToDecimal(
            component.taxableAmountMinor,
            currency,
          ),
          taxAmount: minorUnitsToDecimal(component.taxAmountMinor, currency),
        })),
      totalAmount: minorUnitsToDecimal(totalAmountMinor, currency),
      totalAmountMinor,
    };
  }, [cartItems, currency, draft.fulfilmentType, taxPricing]);
  const serviceChargeEnabled =
    chargeSettings.serviceChargeEnabled &&
    chargeSettings.serviceChargeRateBps > 0 &&
    (draft.fulfilmentType === "DINE_IN"
      ? chargeSettings.serviceChargeDineIn
      : draft.fulfilmentType === "PICKUP"
        ? chargeSettings.serviceChargePickup
        : chargeSettings.serviceChargeDelivery);
  const serviceChargeAmountMinor = cartPricing && serviceChargeEnabled
    ? calculateBasisPointsAmount(
        cartPricing.totalAmountMinor,
        chargeSettings.serviceChargeRateBps,
      )
    : 0;
  const tipAmountMinor = cartPricing && !isStaffOrder && chargeSettings.tipsEnabled
    ? calculateBasisPointsAmount(
        cartPricing.totalAmountMinor + serviceChargeAmountMinor,
        draft.tipRateBps,
      )
    : 0;
  const finalTotalAmountMinor = cartPricing
    ? cartPricing.totalAmountMinor + serviceChargeAmountMinor + tipAmountMinor
    : null;
  const totalAmount = finalTotalAmountMinor === null
    ? null
    : minorUnitsToDecimal(finalTotalAmountMinor, currency);

  const customerNameError =
    isStaffOrder && screen === "review" && error === "Enter a customer name or table number."
      ? error
      : null;
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
      taxes: getMenuItemTaxes(taxPricing, drink.id, draft.fulfilmentType),
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

  function openCart() {
    setFocusedCartDrinkId(null);
    setIsCartOpen(true);
  }

  function openCartForDrink(drinkId: string) {
    setFocusedCartDrinkId(drinkId);
    setIsCartOpen(true);
  }

  function handleCartOpenChange(open: boolean) {
    setIsCartOpen(open);

    if (!open) {
      setFocusedCartDrinkId(null);
    }
  }

  function goToReview() {
    if (cartItems.length === 0) {
      setError("Add at least one drink to the cart.");
      return;
    }

    const modifierError = getModifierValidationError();

    if (modifierError) {
      setError(modifierError);
      setFocusedCartDrinkId(null);
      setIsCartOpen(true);
      return;
    }

    setError(null);
    setFocusedCartDrinkId(null);
    setIsCartOpen(false);
    setScreen("review");
  }

  async function confirmOrder() {
    setShowCheckoutErrors(true);

    if (!isStaffOrder && hasCheckoutFieldErrors) {
      setError("Check the highlighted details before continuing.");
      return;
    }

    if (!canPlaceOrder) {
      setError("Complete the required contact and payment details before placing your order.");
      return;
    }

    if (isStaffOrder && draft.customerName.trim().length < 2) {
      setError("Enter a customer name or table number.");
      return;
    }

    if (
      draft.fulfilmentType === "DELIVERY" &&
      (!draft.deliveryAddressLine1.trim() ||
        !draft.deliveryCity.trim() ||
        !draft.deliveryPostalCode.trim() ||
        draft.deliveryCountryCode.trim().length !== 2)
    ) {
      setError("Enter the delivery address, town or city, postcode, and two-letter country code.");
      return;
    }

    const scheduledFulfilmentAt =
      supportsScheduledFulfilment(draft.fulfilmentType) &&
      draft.fulfilmentTiming === "SCHEDULED"
        ? new Date(draft.scheduledFulfilmentAt)
        : null;

    if (
      scheduledFulfilmentAt &&
      (!draft.scheduledFulfilmentAt ||
        Number.isNaN(scheduledFulfilmentAt.getTime()) ||
        scheduledFulfilmentAt.getTime() <= Date.now())
    ) {
      setError("Choose a future fulfilment time.");
      return;
    }

    const modifierError = getModifierValidationError();

    if (modifierError) {
      setError(modifierError);
      setScreen("menu");
      setFocusedCartDrinkId(null);
      setIsCartOpen(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const clientRequestId = isStaffOrder ? crypto.randomUUID() : undefined;
    const endpoint = withOrderContext("/api/orders", {
      orderingPointQrSlug,
      routeSlug,
      staffRestaurantSlug,
    });
    const requestPayload = {
      clientRequestId,
      customerId: isStaffOrder ? selectedStaffCustomer?.id ?? null : undefined,
      customerName: isStaffOrder ? draft.customerName.trim() : undefined,
      checkoutMode: isStaffOrder ? undefined : effectiveCheckoutMode,
      paymentTiming: isStaffOrder ? undefined : draft.paymentTiming,
      tipRateBps: isStaffOrder ? 0 : draft.tipRateBps,
      customerContact: isStaffOrder
        ? undefined
        : {
            name: draft.customerName.trim(),
            email: normalizedContactEmail || null,
            phone: normalizedContactPhone || null,
          },
      fulfilmentType: draft.fulfilmentType,
      openDineInOrderId: openDineInOrder?.id,
      deliveryAddress:
        draft.fulfilmentType === "DELIVERY"
          ? {
              line1: draft.deliveryAddressLine1.trim(),
              line2: draft.deliveryAddressLine2.trim(),
              city: draft.deliveryCity.trim(),
              region: draft.deliveryRegion.trim(),
              postalCode: draft.deliveryPostalCode.trim(),
              countryCode: draft.deliveryCountryCode.trim().toUpperCase(),
              instructions: draft.deliveryInstructions.trim(),
            }
          : null,
      scheduledFulfilmentAt: scheduledFulfilmentAt?.toISOString() ?? null,
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
    };
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
    } catch {
      if (isStaffOrder && clientRequestId && !openDineInOrder) {
        const pending = queueOfflineStaffOrder({
          clientRequestId,
          endpoint,
          payload: requestPayload,
        });
        setOfflineOrderCount(pending);
        setCartItems([]);
        setIsSubmitting(false);
        setScreen("menu");
        toast.warning("Connection lost. Order saved on this device and will sync automatically.");
        return;
      }

      setError(
        openDineInOrder
          ? "Reconnect before adding items to an open dine-in check."
          : "The order could not reach the restaurant. Check the connection and try again.",
      );
      setIsSubmitting(false);
      return;
    }

    const payload = await response.json();

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "Failed to place order."));
      setIsSubmitting(false);
      return;
    }

    if (openDineInOrder && isStaffOrder && staffRestaurantSlug) {
      toast.success(`Items added to check #${openDineInOrder.orderNo}.`);
      router.push(
        `/restaurants/${encodeURIComponent(staffRestaurantSlug)}/orders`,
      );
      router.refresh();
      return;
    }

    const nextOrder: LocalCustomerOrder = {
      orderId: payload.orderId,
      orderNo: payload.orderNo,
      orderDate: payload.orderDate,
      organizationId: payload.organizationId,
      customerToken: payload.customerToken,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      checkoutMode: payload.checkoutMode,
      paymentTiming: payload.paymentTiming,
      fulfilmentType: payload.fulfilmentType,
      deliveryAddress: payload.deliveryAddress,
      requestedFulfilmentAt: payload.requestedFulfilmentAt,
      promisedFulfilmentAt: payload.promisedFulfilmentAt,
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

    if (typeof payload.checkoutUrl === "string" && payload.checkoutUrl) {
      toast.success("Order saved. Opening secure payment...");
      window.location.assign(payload.checkoutUrl);
      return;
    }

    toast.success(`Order #${payload.orderNo} placed successfully.`);
    setDraft({
      customerName: customer?.name ?? "",
      customerEmail: customer?.email ?? "",
      customerPhone: customer?.phone ?? "",
      checkoutMode: initialCheckoutMode,
      paymentTiming: initialPaymentTiming,
      fulfilmentType: initialCheckoutPolicy?.fulfilmentType ?? "PICKUP",
      deliveryAddressLine1: "",
      deliveryAddressLine2: "",
      deliveryCity: "",
      deliveryRegion: "",
      deliveryPostalCode: "",
      deliveryCountryCode: operatingCountryCode,
      deliveryInstructions: "",
      fulfilmentTiming: "ASAP",
      scheduledFulfilmentAt: "",
      tipRateBps: 0,
    });
    setSelectedStaffCustomer(null);
    setCartItems([]);
    setFocusedCartDrinkId(null);
    setIsCartOpen(false);
    setIsSubmitting(false);
    setScreen("menu");

    if (isStaffOrder && staffRestaurantSlug) {
      router.refresh();
      return;
    }

    router.push(
      routeSlug
        ? `/order/status/${encodeURIComponent(routeSlug)}`
        : withOrderContext("/order/status", { orderingPointQrSlug }),
    );
  }

  return (
    <div
      data-theme-static={isStaffOrder ? undefined : ""}
      className={isStaffOrder ? undefined : "customer-order-storefront text-stone-950"}
    >
      <Sheet open={isCartOpen} onOpenChange={handleCartOpenChange}>
        <SheetContent
          side="right"
          data-customer-storefront={isStaffOrder ? undefined : ""}
          data-theme-static={isStaffOrder ? undefined : ""}
        >
          <SheetHeader>
            <SheetTitle>
              {isCartProductFocused
                ? `Manage ${focusedCartItems[0].drinkName}`
                : "Your cart"}
            </SheetTitle>
            <SheetDescription>
              {isCartProductFocused
                ? `${focusedCartQuantity} item(s) across ${focusedCartItems.length} configuration(s).`
                : "Adjust quantities and add notes for each item before reviewing the order."}
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
                {isCartProductFocused ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        {focusedCartQuantity} added · {focusedCartItems.length}{" "}
                        {focusedCartItems.length === 1 ? "configuration" : "variants"}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        Other products remain in your cart.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setFocusedCartDrinkId(null)}
                    >
                      <ShoppingCartIcon className="size-4" />
                      Full cart
                    </Button>
                  </div>
                ) : null}

                {displayedCartItems.map((item, itemIndex) => {
                  const modifierUnitTotal = getCartItemModifierUnitTotal(item);
                  const itemUnitTotal = getCartItemUnitTotal(item);

                  return (
                    <div
                      key={item.lineId}
                      className={`rounded-xl border bg-white p-4 ${
                        isCartProductFocused
                          ? "border-emerald-300 ring-1 ring-emerald-100"
                          : "border-stone-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          {isCartProductFocused && focusedCartItems.length > 1 ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                              Variant {itemIndex + 1}
                            </p>
                          ) : null}
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
                            {formatPrice(item.unitPrice, priceOptions)}
                          </span>
                        </div>
                        {item.modifierSelections.length > 0 ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-stone-500">Add-ons</span>
                            <span className="font-medium text-stone-900">
                              {modifierUnitTotal > 0
                                ? `+ ${formatPrice(modifierUnitTotal, priceOptions)}`
                                : "Included"}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2 font-semibold text-stone-950">
                          <span>Item total</span>
                          <span>{formatPrice(itemUnitTotal, priceOptions)}</span>
                        </div>
                        {item.quantity > 1 ? (
                          <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
                            <span>Line total for {item.quantity} item(s)</span>
                            <span className="font-semibold text-stone-900">
                              {formatCartItemLineTotal(item, priceOptions)}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className={isStaffOrder
                          ? "inline-flex items-center overflow-hidden rounded-lg border border-stone-200"
                          : "inline-flex items-center overflow-hidden rounded-lg border border-emerald-300 bg-white text-emerald-900"}>
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
                              size="lg"
                              onClick={() => openCustomizerForItem(item)}
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
                                      ? `+ ${formatPrice(modifier.priceDelta, priceOptions)}`
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
                <p className="text-sm text-stone-500">
                  {isCartProductFocused ? "Cart total · " : ""}
                  {totalQuantity} item(s)
                </p>
                <p className="text-base font-semibold text-stone-950">
                  {formatPrice(totalAmount, priceOptions)}
                </p>
              </div>
              <Button
                type="button"
                onClick={goToReview}
                disabled={isSubmitting || isLoadingMenu || Boolean(menuError) || cartItems.length === 0}
                size="2xl"
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
        <DialogContent
          data-customer-storefront={isStaffOrder ? undefined : ""}
          data-theme-static={isStaffOrder ? undefined : ""}
          className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl p-0 sm:max-w-xl"
        >
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
                          {formatPrice(customizer.item.unitPrice, priceOptions)}
                        </span>
                      </div>
                      {customizer.item.modifierSelections.length > 0 ? (
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>Add-ons</span>
                          <span className="font-medium text-stone-900">
                            {getCartItemModifierUnitTotal(customizer.item) > 0
                              ? `+ ${formatPrice(getCartItemModifierUnitTotal(customizer.item), priceOptions)}`
                              : "Included"}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-stone-200 pt-2 text-sm font-semibold text-stone-950">
                        <span>Item total</span>
                        <span>{formatPrice(getCartItemUnitTotal(customizer.item), priceOptions)}</span>
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
                                ? `+ ${formatPrice(option.priceDelta, priceOptions)}`
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
                  size="xl"
                  onClick={() => {
                    setCustomizer(null);
                    setCustomizerError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="xl"
                  onClick={saveCustomization}
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
        <AlertDialogContent
          data-customer-storefront={isStaffOrder ? undefined : ""}
          data-theme-static={isStaffOrder ? undefined : ""}
          className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] rounded-xl sm:w-fit sm:min-w-[38rem] sm:max-w-[44rem]"
        >
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
        <Card className="overflow-hidden rounded-xl border-stone-200 bg-white shadow-[0_20px_60px_rgba(15,118,110,0.08)]">
          <CardHeader className="px-6 pt-6">
            <SectionHeader
              eyebrow="Review order"
              title={
                openDineInOrder
                  ? `Add items to check #${openDineInOrder.orderNo}`
                  : isStaffOrder
                    ? "Confirm order"
                    : "Review and pay"
              }
              meta={
                <p className="text-sm text-stone-600">
                  {openDineInOrder
                    ? `Review the new items for ${openDineInOrder.customerName} before sending them to preparation.`
                    : isStaffOrder
                    ? "Add a customer name or table number and double-check the cart before sending it to the preparation queue."
                    : "Double-check your cart and contact details before continuing to payment."}
                </p>
              }
              className="mb-0"
            />
          </CardHeader>

          <CardContent className="grid gap-6 px-6 pb-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-x-8">
              <div data-slot="order-review-fields" className="grid content-start gap-4">
            {isStaffOrder && !openDineInOrder ? (
              <StaffCustomerSearch
                staffRestaurantSlug={staffRestaurantSlug}
                selectedCustomer={selectedStaffCustomer}
                onChange={(nextCustomer) => {
                  setSelectedStaffCustomer(nextCustomer);

                  if (nextCustomer) {
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      customerName: nextCustomer.name,
                    }));
                  }
                }}
              />
            ) : null}

            {openDineInOrder ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-950">
                  Open dine-in check #{openDineInOrder.orderNo}
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  {openDineInOrder.customerName}. New items will be sent to preparation and added to the existing bill.
                </p>
              </div>
            ) : (
              <FulfilmentTypeSelector
                allowedTypes={allowedFulfilmentTypes}
                disabled={isSubmitting}
                tone={isStaffOrder ? "default" : "customer"}
                value={draft.fulfilmentType}
                onChange={(fulfilmentType) => {
                  const nextPolicy = checkoutPolicies.find(
                    (policy) => policy.fulfilmentType === fulfilmentType,
                  );
                  const supportsScheduling =
                    supportsScheduledFulfilment(fulfilmentType);
                  const nextCheckoutMode =
                    customer && nextPolicy?.accountCheckoutEnabled
                      ? "ACCOUNT"
                      : nextPolicy?.guestCheckoutEnabled && stripePaymentsEnabled
                        ? "GUEST"
                        : "ACCOUNT";

                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    fulfilmentType,
                    checkoutMode: nextCheckoutMode,
                    fulfilmentTiming: supportsScheduling
                      ? currentDraft.fulfilmentTiming
                      : "ASAP",
                    paymentTiming:
                      nextCheckoutMode === "GUEST"
                        ? "ONLINE"
                        : nextPolicy?.defaultPaymentTiming ?? "ONLINE",
                    scheduledFulfilmentAt: supportsScheduling
                      ? currentDraft.scheduledFulfilmentAt
                      : "",
                  }));
                  setError(null);
                }}
              />
            )}

            {draft.fulfilmentType === "DELIVERY" ? (
              <section
                aria-labelledby="delivery-address-heading"
                className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4"
              >
                <h3
                  id="delivery-address-heading"
                  className="text-sm font-semibold text-stone-900"
                >
                  Delivery address
                </h3>
                <FormField
                  label="Address line 1"
                  error={showCheckoutErrors ? deliveryAddressLine1Error : null}
                  errorId="delivery-address-line-1-error"
                >
                  <Input
                    autoComplete="address-line1"
                    value={draft.deliveryAddressLine1}
                    disabled={isSubmitting}
                    aria-invalid={showCheckoutErrors && Boolean(deliveryAddressLine1Error)}
                    aria-describedby={
                      showCheckoutErrors && deliveryAddressLine1Error
                        ? "delivery-address-line-1-error"
                        : undefined
                    }
                    onChange={(event) => {
                      updateDraft("deliveryAddressLine1", event.target.value);
                      setError(null);
                    }}
                  />
                </FormField>
                <FormField label="Address line 2 (optional)">
                  <Input
                    autoComplete="address-line2"
                    value={draft.deliveryAddressLine2}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      updateDraft("deliveryAddressLine2", event.target.value)
                    }
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="Town or city"
                    error={showCheckoutErrors ? deliveryCityError : null}
                    errorId="delivery-city-error"
                  >
                    <Input
                      autoComplete="address-level2"
                      value={draft.deliveryCity}
                      disabled={isSubmitting}
                      aria-invalid={showCheckoutErrors && Boolean(deliveryCityError)}
                      aria-describedby={
                        showCheckoutErrors && deliveryCityError
                          ? "delivery-city-error"
                          : undefined
                      }
                      onChange={(event) => {
                        updateDraft("deliveryCity", event.target.value);
                        setError(null);
                      }}
                    />
                  </FormField>
                  <FormField label="County / region (optional)">
                    <Input
                      autoComplete="address-level1"
                      value={draft.deliveryRegion}
                      disabled={isSubmitting}
                      onChange={(event) =>
                        updateDraft("deliveryRegion", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField
                    label="Postcode"
                    error={showCheckoutErrors ? deliveryPostalCodeError : null}
                    errorId="delivery-postcode-error"
                  >
                    <Input
                      autoComplete="postal-code"
                      value={draft.deliveryPostalCode}
                      disabled={isSubmitting}
                      aria-invalid={showCheckoutErrors && Boolean(deliveryPostalCodeError)}
                      aria-describedby={
                        showCheckoutErrors && deliveryPostalCodeError
                          ? "delivery-postcode-error"
                          : undefined
                      }
                      onChange={(event) => {
                        updateDraft("deliveryPostalCode", event.target.value);
                        setError(null);
                      }}
                    />
                  </FormField>
                  <FormField
                    label="Country code"
                    error={showCheckoutErrors ? deliveryCountryCodeError : null}
                    errorId="delivery-country-error"
                  >
                    <Input
                      autoComplete="country"
                      value={draft.deliveryCountryCode}
                      disabled={isSubmitting}
                      maxLength={2}
                      placeholder="GB"
                      aria-invalid={showCheckoutErrors && Boolean(deliveryCountryCodeError)}
                      aria-describedby={
                        showCheckoutErrors && deliveryCountryCodeError
                          ? "delivery-country-error"
                          : undefined
                      }
                      onChange={(event) => {
                        updateDraft(
                          "deliveryCountryCode",
                          event.target.value.toUpperCase(),
                        );
                        setError(null);
                      }}
                    />
                  </FormField>
                </div>
                <FormField label="Delivery instructions (optional)">
                  <Textarea
                    rows={3}
                    value={draft.deliveryInstructions}
                    disabled={isSubmitting}
                    placeholder="Entrance, floor, access code, or a safe handoff note"
                    onChange={(event) =>
                      updateDraft("deliveryInstructions", event.target.value)
                    }
                  />
                </FormField>
              </section>
            ) : null}

            {!openDineInOrder &&
            supportsScheduledFulfilment(draft.fulfilmentType) ? (
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold text-stone-950">
                  Ready time
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["ASAP", "SCHEDULED"] as const).map((timing) => {
                    const TimingIcon =
                      timing === "ASAP" ? TimerIcon : CalendarClockIcon;
                    const selected = draft.fulfilmentTiming === timing;

                    return (
                      <button
                        key={timing}
                        type="button"
                        disabled={isSubmitting}
                        aria-pressed={selected}
                        onClick={() => {
                          setDraft((currentDraft) => ({
                            ...currentDraft,
                            fulfilmentTiming: timing,
                            scheduledFulfilmentAt:
                              timing === "SCHEDULED" &&
                              !currentDraft.scheduledFulfilmentAt
                                ? toLocalDateTimeInputValue(
                                    new Date(Date.now() + 30 * 60 * 1000),
                                  )
                                : currentDraft.scheduledFulfilmentAt,
                          }));
                          setError(null);
                        }}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                          selected
                            ? isStaffOrder
                              ? "border-stone-500 bg-stone-200 text-stone-950 shadow-sm dark:border-stone-500 dark:bg-stone-700 dark:text-white"
                              : "border-teal-500 bg-teal-50 text-teal-950 shadow-sm ring-1 ring-teal-200"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        <TimingIcon className="size-4" aria-hidden="true" />
                        {timing === "ASAP" ? "ASAP" : "Schedule"}
                      </button>
                    );
                  })}
                </div>
                {draft.fulfilmentTiming === "SCHEDULED" ? (
                  <FormField
                    label={isStaffOrder ? "Promised time" : "Requested time"}
                    error={showCheckoutErrors ? scheduledFulfilmentError : null}
                    errorId="scheduled-fulfilment-error"
                  >
                    <Input
                      type="datetime-local"
                      min={toLocalDateTimeInputValue(new Date())}
                      value={draft.scheduledFulfilmentAt}
                      disabled={isSubmitting}
                      controlSize="xl"
                      aria-invalid={showCheckoutErrors && Boolean(scheduledFulfilmentError)}
                      aria-describedby={
                        showCheckoutErrors && scheduledFulfilmentError
                          ? "scheduled-fulfilment-error"
                          : undefined
                      }
                      onChange={(event) => {
                        updateDraft("scheduledFulfilmentAt", event.target.value);
                        setError(null);
                      }}
                    />
                  </FormField>
                ) : null}
              </fieldset>
            ) : null}

            {!isStaffOrder ? (
              <div className="grid gap-4">
                {!customer &&
                guestCheckoutAvailable &&
                checkoutPolicy.accountCheckoutEnabled ? (
                  <fieldset>
                    <legend className="text-sm font-semibold text-stone-950">
                      How would you like to continue?
                    </legend>
                    <p className="mt-1 text-sm text-stone-600">
                      Sign in to save this order to your account, or continue as
                      a guest.
                    </p>
                    <div className="mt-3 grid grid-cols-2 rounded-lg border border-stone-200 bg-stone-100 p-1">
                      {([
                        ["GUEST", "Guest checkout"],
                        ["ACCOUNT", "Sign in"],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={effectiveCheckoutMode === mode}
                          disabled={isSubmitting || (mode === "ACCOUNT" && !hasCustomerLoginProvider)}
                          onClick={() => {
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              checkoutMode: mode,
                              paymentTiming:
                                mode === "GUEST"
                                  ? "ONLINE"
                                  : checkoutPolicy.defaultPaymentTiming,
                            }));
                            setError(null);
                          }}
                          className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            effectiveCheckoutMode === mode
                              ? "bg-primary text-primary-foreground"
                              : "text-stone-600 hover:bg-white hover:text-stone-950"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {!customer && effectiveCheckoutMode === "ACCOUNT" ? (
                  hasCustomerLoginProvider ? (
                    <CustomerLoginForm
                      defaultPhoneCountryCode={operatingCountryCode}
                      providers={availableCustomerAuthProviders}
                      orderingPointQrSlug={orderingPointQrSlug}
                      routeSlug={routeSlug}
                      onSignedIn={(contact) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          checkoutMode: "ACCOUNT",
                          customerEmail:
                            currentDraft.customerEmail || contact.email || "",
                          customerPhone:
                            currentDraft.customerPhone || contact.phone || "",
                          paymentTiming:
                            checkoutPolicy.defaultPaymentTiming === "ONLINE" &&
                            !stripePaymentsEnabled &&
                            checkoutPolicy.payLaterEnabled
                              ? "PAY_LATER"
                              : checkoutPolicy.defaultPaymentTiming,
                        }));
                        router.refresh();
                      }}
                      title="Sign in to checkout"
                      className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                    />
                  ) : (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Account sign-in is temporarily unavailable. Choose guest checkout or contact the restaurant.
                    </p>
                  )
                ) : null}

                {customer || effectiveCheckoutMode === "GUEST" ? (
                  <section
                    aria-labelledby="contact-details-heading"
                    className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4"
                  >
                    <h3
                      id="contact-details-heading"
                      className="text-sm font-semibold text-stone-950"
                    >
                      Contact details
                    </h3>
                    {customer ? (
                      <p className="text-sm text-emerald-800">
                        Signed in{customer.name ? ` as ${customer.name}` : ""}. Details are prefilled and can be updated for this order.
                      </p>
                    ) : (
                      <p className="text-sm text-stone-600">
                        Guest orders require online payment. No account will be created.
                      </p>
                    )}
                    <p className="text-xs text-stone-500">
                      {contactRequirement
                        ? checkoutContactRequirementLabels[contactRequirement]
                        : "Email or mobile required"}
                      . Enter mobile numbers in the selected country format.
                    </p>
                    <FormField
                      label="Full name"
                      htmlFor="review-contact-name"
                      error={showCheckoutErrors ? contactNameError : null}
                      errorId="review-contact-name-error"
                    >
                      <Input
                        id="review-contact-name"
                        autoComplete="name"
                        value={draft.customerName}
                        disabled={isSubmitting}
                        aria-invalid={showCheckoutErrors && Boolean(contactNameError)}
                        aria-describedby={
                          showCheckoutErrors && contactNameError
                            ? "review-contact-name-error"
                            : undefined
                        }
                        onChange={(event) => {
                          updateDraft("customerName", event.target.value);
                          setError(null);
                        }}
                      />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label={`Email address${isEmailRequired ? " (required)" : ""}`}
                        htmlFor="review-contact-email"
                        error={showCheckoutErrors ? contactEmailError : null}
                        errorId="review-contact-email-error"
                      >
                        <Input
                          id="review-contact-email"
                          type="email"
                          autoComplete="email"
                          value={draft.customerEmail}
                          disabled={isSubmitting}
                          aria-invalid={showCheckoutErrors && Boolean(contactEmailError)}
                          aria-describedby={
                            showCheckoutErrors && contactEmailError
                              ? "review-contact-email-error"
                              : undefined
                          }
                          onChange={(event) => {
                            updateDraft("customerEmail", event.target.value);
                            setError(null);
                          }}
                        />
                      </FormField>
                      <FormField
                        label={`Mobile number${isPhoneRequired ? " (required)" : ""}`}
                        htmlFor="review-contact-phone"
                        error={showCheckoutErrors ? contactPhoneError : null}
                        errorId="review-contact-phone-error"
                      >
                        <PhoneNumberInput
                          tone="customer"
                          id="review-contact-phone"
                          value={draft.customerPhone}
                          countryCode={phoneCountryCode}
                          onCountryCodeChange={setPhoneCountryCode}
                          disabled={isSubmitting}
                          ariaInvalid={showCheckoutErrors && Boolean(contactPhoneError)}
                          ariaDescribedBy={
                            showCheckoutErrors && contactPhoneError
                              ? "review-contact-phone-error"
                              : undefined
                          }
                          onValueChange={(value) => {
                            updateDraft("customerPhone", value);
                            setError(null);
                          }}
                        />
                      </FormField>
                    </div>
                  </section>
                ) : null}

                {customer && effectiveCheckoutMode === "ACCOUNT" ? (
                  <fieldset>
                    <legend className="text-sm font-semibold text-stone-950">
                      Payment
                    </legend>
                    <div className="mt-3 grid grid-cols-2 rounded-lg border border-stone-200 bg-stone-100 p-1">
                      {checkoutPolicy?.onlinePaymentEnabled ? (
                        <button
                          type="button"
                          aria-pressed={draft.paymentTiming === "ONLINE"}
                          disabled={isSubmitting || !stripePaymentsEnabled}
                          onClick={() => updateDraft("paymentTiming", "ONLINE")}
                          className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                            draft.paymentTiming === "ONLINE"
                              ? "bg-primary text-primary-foreground"
                              : "text-stone-600 hover:bg-white"
                          }`}
                        >
                          Pay online
                        </button>
                      ) : null}
                      {checkoutPolicy?.payLaterEnabled ? (
                        <button
                          type="button"
                          aria-pressed={draft.paymentTiming === "PAY_LATER"}
                          disabled={isSubmitting}
                          onClick={() => updateDraft("paymentTiming", "PAY_LATER")}
                          className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
                            draft.paymentTiming === "PAY_LATER"
                              ? "bg-primary text-primary-foreground"
                              : "text-stone-600 hover:bg-white"
                          }`}
                        >
                          {getPayLaterLabel(draft.fulfilmentType)}
                        </button>
                      ) : null}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            ) : null}

            {isStaffOrder && !openDineInOrder ? (
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
                  controlSize="xl"
                />
                {customerNameError ? (
                  <p id="review-customer-name-error" className="text-sm text-rose-600">
                    {customerNameError}
                  </p>
                ) : null}
              </FormField>
            ) : null}

            {reviewError ? <p className="text-sm text-rose-600">{reviewError}</p> : null}

              </div>

            <aside
              data-slot="order-review-summary"
              className="rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-foreground">Order summary</p>
                <p className="text-xs font-medium text-muted-foreground">
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
                              {formatPrice(item.unitPrice, priceOptions)}
                            </span>
                          </p>
                          {item.modifierSelections.length > 0 ? (
                            <p>
                              Add-ons:{" "}
                              <span className="font-medium text-stone-700">
                                {modifierUnitTotal > 0
                                  ? `+ ${formatPrice(modifierUnitTotal, priceOptions)}`
                                  : "Included"}
                              </span>
                            </p>
                          ) : null}
                          <p>
                            Item total:{" "}
                            <span className="font-medium text-stone-700">
                              {formatPrice(itemUnitTotal, priceOptions)}
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
                                  ? ` + ${formatPrice(modifier.priceDelta, priceOptions)}`
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
                        {formatCartItemLineTotal(item, priceOptions)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {!isStaffOrder && chargeSettings.tipsEnabled ? (
                <fieldset className="mt-4 border-t border-dashed border-stone-200 pt-4">
                  <legend className="text-sm font-semibold text-stone-900">
                    Add a tip
                  </legend>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {[0, ...chargeSettings.tipPresetsBps].map((rateBps) => (
                      <button
                        key={rateBps}
                        type="button"
                        aria-pressed={draft.tipRateBps === rateBps}
                        className={`min-h-10 rounded-lg border px-2 text-sm font-semibold transition-colors ${
                          draft.tipRateBps === rateBps
                            ? "border-teal-500 bg-teal-50 text-teal-950"
                            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                        }`}
                        onClick={() => updateDraft("tipRateBps", rateBps)}
                      >
                        {rateBps === 0 ? "No tip" : `${rateBps / 100}%`}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

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
                {cartPricing && cartPricing.taxComponents.length > 0 ? (
                  <>
                    {taxPricing.pricingMode === "EXCLUSIVE" ? (
                      <div className="flex items-center justify-between gap-4 text-stone-600">
                        <span>Subtotal</span>
                        <span>{formatPrice(cartPricing.listedSubtotal, priceOptions)}</span>
                      </div>
                    ) : null}
                    {cartPricing.taxComponents.map((component) => (
                      <div
                        key={[
                          component.code,
                          component.name,
                          component.treatment,
                          component.rateBps,
                          component.calculationOrder,
                        ].join("-")}
                        className="flex items-center justify-between gap-4 text-stone-600"
                      >
                        <span>
                          {taxPricing.pricingMode === "INCLUSIVE"
                            ? `Includes ${formatCartTaxLabel(component)}`
                            : formatCartTaxLabel(component)}
                        </span>
                        <span>{formatPrice(component.taxAmount, priceOptions)}</span>
                      </div>
                    ))}
                  </>
                ) : null}
                {serviceChargeAmountMinor > 0 ? (
                  <div className="flex items-center justify-between gap-4 text-stone-600">
                    <span>Service charge ({chargeSettings.serviceChargeRateBps / 100}%)</span>
                    <span>
                      {formatPrice(
                        minorUnitsToDecimal(serviceChargeAmountMinor, currency),
                        priceOptions,
                      )}
                    </span>
                  </div>
                ) : null}
                {tipAmountMinor > 0 ? (
                  <div className="flex items-center justify-between gap-4 text-stone-600">
                    <span>Tip</span>
                    <span>
                      {formatPrice(minorUnitsToDecimal(tipAmountMinor, currency), priceOptions)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-3 font-semibold text-stone-950">
                  <span>To Pay</span>
                  <span>{formatPrice(totalAmount, priceOptions)}</span>
                </div>
              </div>
            </aside>
            </div>

            {!isStaffOrder ? (
              <div className="grid gap-3 border-t border-stone-200 pt-4">
                {!stripePaymentsEnabled ? (
                  <p className="text-sm font-medium text-amber-800">
                    Online payment is not available for this restaurant.
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-stone-500">
                  See how the restaurant and Foodie use your contact, order and payment
                  information in the{" "}
                  <Link
                    href={privacyHref}
                    className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700"
                  >
                    privacy notice
                  </Link>
                  .
                </p>
              </div>
            ) : null}

            <div
              className={
                isStaffOrder
                  ? "grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2"
                  : "grid gap-3 sm:grid-cols-2"
              }
            >
              <Button
                type="button"
                variant="outline"
                size="xl"
                onClick={() => {
                  setError(null);
                  setShowCheckoutErrors(false);
                  setScreen("menu");
                }}
                disabled={isSubmitting}
              >
                <ButtonLabel icon={ArrowLeftIcon}>Back to Menu</ButtonLabel>
              </Button>
              <Button
                type="button"
                size="xl"
                onClick={confirmOrder}
                disabled={isSubmitting || cartItems.length === 0}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    {openDineInOrder
                      ? "Adding Items..."
                      : isStaffOrder
                        ? "Placing Order..."
                        : draft.paymentTiming === "ONLINE"
                          ? "Opening Payment..."
                          : "Placing Order..."}
                  </span>
                ) : (
                  <ButtonLabel
                    icon={
                      isStaffOrder || draft.paymentTiming === "PAY_LATER"
                        ? SendIcon
                        : CreditCardIcon
                    }
                  >
                    {openDineInOrder
                      ? "Add Items"
                      : isStaffOrder
                        ? "Confirm Order"
                        : draft.paymentTiming === "ONLINE"
                          ? "Proceed to Payment"
                          : "Place Order"}
                  </ButtonLabel>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card
        className={
          isStaffOrder
            ? "overflow-visible rounded-xl border-white/60 bg-white/88 shadow-[0_20px_60px_rgba(40,26,20,0.08)]"
            : "overflow-visible rounded-none bg-white py-0 shadow-none ring-0"
        }
      >
        <CardHeader className={isStaffOrder ? "px-6 pt-6" : "gap-0 overflow-hidden p-0"}>
          {isStaffOrder ? (
            <SectionHeader
              eyebrow={openDineInOrder ? "Open dine-in check" : "Place an order"}
              title={openDineInOrder
                ? `Add items to check #${openDineInOrder.orderNo}`
                : "What Are You Having Today?"}
              meta={
                <p className="text-sm text-stone-600">
                  {openDineInOrder
                    ? `Select additional items for ${openDineInOrder.customerName}.`
                    : "Build the order from the menu, then review everything in the cart drawer."}
                </p>
              }
              className="mb-0"
            />
          ) : (
            <>
              <CustomerRestaurantHeader
                restaurant={restaurant}
                fulfilmentTypes={allowedFulfilmentTypes}
              />
              <label className="relative mt-5 block">
                <span className="sr-only">Search menu</span>
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
                />
                <Input
                  type="search"
                  controlSize="lg"
                  placeholder="Search by item name"
                  value={menuSearch}
                  onChange={(event) => setMenuSearch(event.target.value)}
                  className="border-stone-200 bg-stone-50 pl-9"
                />
              </label>
            </>
          )}
          {isStaffOrder && offlineOrderCount > 0 ? (
            <p className="mt-3 w-fit rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">
              {offlineOrderCount} offline {offlineOrderCount === 1 ? "order" : "orders"} waiting to sync
            </p>
          ) : null}
        </CardHeader>

        <CardContent className={isStaffOrder ? "px-6 pb-6" : "p-0"}>
          <div className="grid gap-5">
            <div className="grid gap-3">
              {isStaffOrder || isLoadingMenu ? (
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  {isStaffOrder ? (
                    <>
                      <p className="text-sm font-semibold text-stone-950">Choose your drinks</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Tap add on any card, then adjust quantity and notes in the cart.
                      </p>
                    </>
                  ) : null}
                </div>
                {isStaffOrder || isLoadingMenu ? (
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                    {isLoadingMenu
                      ? "Loading menu..."
                      : `${menuCategories.length} categories - ${totalProducts} products`}
                  </p>
                ) : null}
              </div>
              ) : null}

              {isStaffOrder && !isLoadingMenu && availableTags.length > 0 ? (
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
                          : "h-9 shrink-0 rounded-lg bg-teal-600 px-4 text-sm text-white hover:bg-teal-700"
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
                            ? "h-9 shrink-0 rounded-lg bg-teal-600 px-4 text-sm text-white hover:bg-teal-700"
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
                <MenuSectionSkeleton label="Loading order menu" />
              ) : (
                <div className="relative grid gap-6">
                  {visibleMenuCategories.length > 0 ? (
                    <>
                    <div ref={categoryBarSentinelRef} className="pointer-events-none absolute top-0 h-px" />
                    <div
                      data-slot="category-navigation-container"
                      className={isStaffOrder
                        ? "contents"
                        : `sticky top-0 z-20 -mx-4 min-w-0 border-b border-stone-200 bg-white px-4 transition-shadow ${
                            isCategoryBarStuck ? "shadow-sm" : ""
                          }`}
                    >
                    <div
                      ref={categoryBarRef}
                      role="navigation"
                      aria-label="Menu categories"
                      className={isStaffOrder
                        ? `sticky top-0 z-20 overflow-x-auto border-y border-stone-200 px-4 py-3 shadow-sm backdrop-blur transition-[margin,padding,background-color] duration-200 ${
                            isCategoryBarStuck ? "-mx-6 bg-white/95 px-6 shadow-md" : "bg-white"
                          }`
                        : "customer-category-navigation overflow-x-auto px-1 pt-1 pb-3"}
                    >
                      <div className="flex min-w-max gap-2">
                        {visibleMenuCategories.map((category) => (
                          <Button
                            key={category.id}
                            ref={(element) => {
                              categoryButtonRefs.current[category.id] = element;
                            }}
                            type="button"
                            size={isStaffOrder ? "default" : "xl"}
                            aria-pressed={currentActiveCategoryId === category.id}
                            variant={currentActiveCategoryId === category.id ? "default" : "outline"}
                            onClick={() => scrollToCategory(category.id)}
                            className={`${isStaffOrder ? "h-9 px-4 text-sm" : "px-5 font-semibold sm:px-6"} rounded-lg ${
                              currentActiveCategoryId === category.id
                                ? isStaffOrder
                                  ? "border-teal-600 bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                                  : "border-teal-700 bg-teal-700 text-white shadow-sm hover:bg-teal-800"
                                : `border-stone-200 bg-white text-stone-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 ${isStaffOrder ? "" : "dark:border-stone-200 dark:bg-white dark:text-stone-700 dark:hover:bg-teal-50"}`
                            }`}
                          >
                            {category.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                    </div>
                    </>
                  ) : null}

                  {visibleMenuCategories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-stone-950">No matching menu items</p>
                      <p className="mt-2 text-sm text-stone-500">
                        {isStaffOrder
                          ? "Try another item name or clear your filters."
                          : "Try another item name or clear your search."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                          setMenuSearch("");
                          setSelectedTagId(null);
                        }}
                      >
                        <ButtonLabel icon={XIcon}>
                          {isStaffOrder ? "Clear filters" : "Clear search"}
                        </ButtonLabel>
                      </Button>
                    </div>
                  ) : null}

                  {visibleMenuCategories.map((category, categoryIndex) => (
                    <section
                      key={category.id}
                      id={`menu-category-${category.id}`}
                      ref={(element) => {
                        categoryRefs.current[category.id] = element;
                      }}
                      className={isStaffOrder
                        ? "scroll-mt-28 overflow-hidden rounded-xl border border-stone-200 bg-white"
                        : "scroll-mt-28 border-b border-stone-200 bg-white"}
                    >
                      <div
                        className={isStaffOrder ? `border-b px-4 py-4 ${
                          categoryIndex % 3 === 0
                            ? "border-amber-200 bg-amber-50"
                            : categoryIndex % 3 === 1
                              ? "border-teal-200 bg-teal-50"
                              : "border-sky-200 bg-sky-50"
                        }` : "flex items-start justify-between gap-4 pb-3 pt-4"}
                      >
                        <div className="min-w-0">
                          <h2 className="text-xl font-semibold text-stone-950">{category.name}</h2>
                          {isStaffOrder ? (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                              {category.items.length} options
                            </p>
                          ) : null}
                          {category.description ? (
                            <p className="mt-2 text-sm text-stone-600">{category.description}</p>
                          ) : null}
                        </div>
                        {!isStaffOrder ? (
                          <span className="shrink-0 rounded-md bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
                            {category.items.length} options
                          </span>
                        ) : null}
                      </div>

                      {category.items.length === 0 ? (
                        <p className="p-4 text-sm text-stone-500">No items in this category yet.</p>
                      ) : (
                        <div className={isStaffOrder ? "grid gap-4 p-4" : "grid"}>
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
                            const configurationCount = selectedCartItems.length;
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
                            const formattedItemPrice = formatPrice(drink.price ?? null, priceOptions);

                            return (
                              <div
                                key={drink.id}
                                data-slot="menu-item-row"
                                data-selected={hasSelectedItem ? "true" : undefined}
                                className={`grid items-start ${
                                  !isStaffOrder && hasSelectedItem
                                    ? "rounded-lg border border-emerald-500 bg-emerald-50 px-3"
                                    : "border-b border-stone-100 last:border-b-0"
                                } ${
                                  isStaffOrder
                                    ? "grid-cols-[80px_minmax(0,1fr)] gap-3 pb-4 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                                    : "grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-3 py-6 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-6"
                                } ${
                                  isStaffOrder && hasSelectedItem
                                    ? "rounded-lg border-l-4 border-teal-500 bg-teal-50 p-3 shadow-sm ring-1 ring-teal-200"
                                    : ""
                                }`}
                              >
                                <div className={`relative aspect-square overflow-hidden rounded-lg bg-stone-100 ${isStaffOrder ? "" : "row-span-2 self-start"}`}>
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

                                <div data-slot="menu-item-details" className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold leading-snug text-stone-950">
                                      {drink.name}
                                    </p>
                                    {hasSelectedItem ? (
                                      <span
                                        data-slot="menu-item-selected-badge"
                                        className={isStaffOrder
                                          ? "inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm"
                                          : "inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-semibold uppercase text-white"}
                                      >
                                        <CheckIcon className="size-3" />
                                        In cart · {selectedQuantity}
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
                                  {isStaffOrder ? (
                                    <p className="mt-1 line-clamp-2 text-sm text-stone-500">{drink.description || ""}</p>
                                  ) : drink.description?.trim() ? (
                                    <MenuItemDescription text={drink.description} itemName={drink.name} />
                                  ) : null}
                                  {drink.tags && drink.tags.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {drink.tags.map((tag) => (
                                        <span
                                          key={tag.id}
                                          className={isStaffOrder
                                            ? "rounded-md border border-stone-200 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600"
                                            : `rounded-md border px-2 py-1 text-xs ${customerTagColors[tag.color] ?? "border-stone-200 bg-stone-50 text-stone-600"}`}
                                        >
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <AllergenSummary
                                    allergens={drink.allergens}
                                    className="mt-2"
                                    tone={isStaffOrder ? "default" : "light"}
                                    layout={isStaffOrder ? "stacked" : "inline"}
                                  />
                                  {drink.modifierGroups && drink.modifierGroups.length > 0 ? (
                                    <div className="mt-2">
                                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                        Customizable
                                      </span>
                                    </div>
                                  ) : null}
                                  {isStaffOrder ? (
                                    <p className="mt-3 text-sm font-semibold text-stone-950">{formattedItemPrice}</p>
                                  ) : null}
                                  {hasModifiers && configurationCount === 1 && cartItem ? (
                                    <p
                                      data-slot="menu-item-customization-summary"
                                      className="mt-1 line-clamp-2 text-xs text-stone-500"
                                    >
                                      {getCartItemCustomizationSummary(cartItem)}
                                    </p>
                                  ) : null}
                                </div>

                                <div
                                  data-slot="menu-item-action"
                                  className={isStaffOrder
                                    ? "col-span-2 flex min-h-9 items-center justify-end sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:min-w-28 sm:self-center"
                                    : "col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-3"}
                                >
                                  {!isStaffOrder ? (
                                    <p data-slot="menu-item-price" className="text-base font-semibold text-stone-950">{formattedItemPrice}</p>
                                  ) : null}
                                  <div className={isStaffOrder ? "contents" : "ml-auto flex min-w-0 flex-wrap justify-end gap-2"}>
                                  {hasModifiers && configurationCount > 1 ? (
                                    <div className="flex flex-col items-end gap-1.5">
                                      <span
                                        data-slot="menu-item-variant-count"
                                        className="text-xs font-medium text-stone-500"
                                      >
                                        {selectedQuantity} added · {configurationCount} variants
                                      </span>
                                      <div className="flex flex-wrap justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size={isStaffOrder ? "lg" : "xl"}
                                          className={isStaffOrder ? undefined : customerItemActionClassName}
                                          onClick={() => addToCart(category, drink)}
                                          disabled={
                                            isSubmitting || isUnavailable || hasReachedStockLimit
                                          }
                                        >
                                          {!isUnavailable && !hasReachedStockLimit ? (
                                            <PlusIcon className="size-4" />
                                          ) : null}
                                          {isUnavailable
                                            ? unavailableLabel
                                            : hasReachedStockLimit
                                              ? "Limit reached"
                                              : "Add another"}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size={isStaffOrder ? "lg" : "xl"}
                                          className={isStaffOrder ? undefined : customerItemActionClassName}
                                          onClick={() => openCartForDrink(drink.id)}
                                        >
                                          <TagsIcon className="size-4" />
                                          Manage variants
                                        </Button>
                                      </div>
                                    </div>
                                  ) : hasModifiers && latestCartItem ? (
                                    <div
                                      data-slot="menu-item-quantity"
                                      className={isStaffOrder
                                        ? "inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm"
                                        : "inline-flex items-center overflow-hidden rounded-lg border border-emerald-300 bg-white"}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => decreaseCartItemQuantity(latestCartItem.lineId)}
                                        disabled={isSubmitting}
                                        aria-label={`Reduce ${drink.name} quantity`}
                                        size={isStaffOrder ? "lg" : "xl"}
                                        className="rounded-none px-3 text-emerald-900 hover:bg-emerald-50"
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
                                        size={isStaffOrder ? "lg" : "xl"}
                                        className="rounded-none px-3 text-emerald-900 hover:bg-emerald-50 disabled:text-stone-300"
                                      >
                                        <PlusIcon className="size-4" />
                                      </Button>
                                    </div>
                                  ) : hasModifiers ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size={isStaffOrder ? "default" : "xl"}
                                      onClick={() => addToCart(category, drink)}
                                      disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                      className={
                                        !isStaffOrder ? customerItemActionClassName : isUnavailable || hasReachedStockLimit
                                          ? "h-9 rounded-lg border-stone-300 bg-stone-100 px-4 text-stone-400"
                                          : "h-9 rounded-lg border-stone-300 bg-white px-4 text-stone-700 hover:bg-stone-100"
                                      }
                                    >
                                      {!isUnavailable && !hasReachedStockLimit ? (
                                        isStaffOrder ? <TagsIcon className="size-4" /> : <SlidersHorizontalIcon className="size-4" />
                                      ) : null}
                                      {isUnavailable
                                        ? unavailableLabel
                                        : hasReachedStockLimit
                                          ? "Limit reached"
                                          : "Customize"}
                                    </Button>
                                  ) : cartItem ? (
                                    <div
                                      data-slot="menu-item-quantity"
                                      className={isStaffOrder
                                        ? "inline-flex items-center overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm"
                                        : "inline-flex items-center overflow-hidden rounded-lg border border-emerald-300 bg-white"}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => decreaseCartItemQuantity(cartItem.lineId)}
                                        disabled={isSubmitting}
                                        aria-label={`Reduce ${drink.name} quantity`}
                                        size={isStaffOrder ? "lg" : "xl"}
                                        className="rounded-none px-3 text-emerald-900 hover:bg-emerald-50"
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
                                        size={isStaffOrder ? "lg" : "xl"}
                                        className="rounded-none px-3 text-emerald-900 hover:bg-emerald-50 disabled:text-stone-300"
                                      >
                                        <PlusIcon className="size-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size={isStaffOrder ? "default" : "xl"}
                                      onClick={() => addToCart(category, drink)}
                                      disabled={isSubmitting || isUnavailable || hasReachedStockLimit}
                                      className={
                                        !isStaffOrder ? customerItemActionClassName : isUnavailable || hasReachedStockLimit
                                          ? "h-9 rounded-lg border-stone-300 bg-stone-100 px-4 text-stone-400"
                                          : "h-9 rounded-lg border-stone-300 bg-white px-4 text-stone-700 hover:bg-stone-100"
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
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-teal-200 bg-white/95 px-4 py-3 shadow-[0_-12px_34px_rgba(15,118,110,0.16)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-950">
                {totalQuantity} item(s) selected
              </p>
              <p className="truncate text-xs text-stone-500">
                {cartItems[0].drinkName}
                {cartItems.length > 1 ? ` + ${cartItems.length - 1} more` : ""}
                {" - "}
                {formatPrice(totalAmount, priceOptions)}
              </p>
            </div>
            <Button
              type="button"
              size="xl"
              onClick={openCart}
              disabled={isSubmitting || isLoadingMenu || Boolean(menuError)}
              className={isStaffOrder ? "shrink-0 bg-teal-600 text-white hover:bg-teal-700" : "shrink-0"}
            >
              <ShoppingCartIcon className="size-4" />
              View Cart
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
