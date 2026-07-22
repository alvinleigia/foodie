"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  UtensilsIcon,
  WrenchIcon,
} from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canAccessNavigation, formatRole } from "@/lib/role-access";
import { clearStoredCustomerOrders } from "@/lib/customer-orders";
import {
  staffNavigationItems,
  type StaffNavigationGroup,
  type StaffNavigationItem,
} from "@/lib/staff-navigation";
import type { MembershipRole } from "@/lib/staff-auth";
import type { StaffPermission } from "@/lib/staff-permissions";
import { cn } from "@/lib/utils";

type AppHeaderUser = {
  contextName?: string | null;
  name?: string | null;
  permissions?: StaffPermission[];
  role: MembershipRole;
};

type AppHeaderProps = {
  activePath?: string;
  brandHref?: string;
  className?: string;
  customerMenu?: {
    accountHref?: string;
    customerName?: string | null;
    loginHref?: string;
    orderHref?: string;
    ordersHref?: string;
    privacyHref?: string;
  };
  navigationItems?: StaffNavigationItem[];
  staffOrderHref?: string;
  user?: AppHeaderUser | null;
};

const staffNavigationGroups: Array<{
  icon: typeof LayoutDashboardIcon;
  id: StaffNavigationGroup;
  label: string;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboardIcon },
  { id: "operations", label: "Operations", icon: ClipboardListIcon },
  { id: "management", label: "Management", icon: SlidersHorizontalIcon },
  { id: "security", label: "Security", icon: ShieldCheckIcon },
  { id: "system", label: "System", icon: WrenchIcon },
];

function getActiveNavigationHref(
  activePath: string | undefined,
  items: StaffNavigationItem[],
) {
  if (!activePath) {
    return undefined;
  }

  return items.reduce<string | undefined>((activeHref, item) => {
    const matches =
      activePath === item.href || activePath.startsWith(`${item.href}/`);

    if (!matches || (activeHref && activeHref.length >= item.href.length)) {
      return activeHref;
    }

    return item.href;
  }, undefined);
}

function BrandLogo({ href }: { href: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg border border-white/15 bg-white text-sm font-black tracking-tight text-stone-950 shadow-sm">
        F
      </span>
      <span>
        <span className="block text-base font-semibold leading-none text-white">
          Foodie POS
        </span>
        <span className="mt-1 block text-xs font-medium uppercase tracking-[0.18em] text-stone-400 group-hover:text-stone-300">
          AGO
        </span>
      </span>
    </Link>
  );
}

export function AppHeader({
  activePath,
  brandHref = "/",
  className,
  customerMenu,
  navigationItems = staffNavigationItems,
  staffOrderHref,
  user,
}: AppHeaderProps) {
  const visibleNavigationItems = user
    ? navigationItems
        .filter((item) =>
          canAccessNavigation(
            user.role,
            item.access,
            item.permission,
            user.permissions,
          ),
        )
        .map((item) =>
          item.href === "/order" && staffOrderHref
            ? { ...item, href: staffOrderHref }
            : item,
        )
    : navigationItems;
  const activeNavigationHref = getActiveNavigationHref(
    activePath,
    visibleNavigationItems,
  );
  const groupedNavigationItems = staffNavigationGroups
    .map((group) => ({
      ...group,
      items: visibleNavigationItems.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
  const activeNavigationGroup =
    groupedNavigationItems.find((group) =>
      group.items.some((item) => item.href === activeNavigationHref),
    )?.id ?? groupedNavigationItems[0]?.id;
  const [navigationDisclosure, setNavigationDisclosure] = useState<{
    activePath?: string;
    group: StaffNavigationGroup | null;
  }>({
    activePath,
    group: activeNavigationGroup ?? null,
  });
  const openNavigationGroup =
    navigationDisclosure.activePath === activePath
      ? navigationDisclosure.group
      : (activeNavigationGroup ?? null);

  return (
    <header
      className={cn(
        "mb-8 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-stone-950/55 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur",
        className,
      )}
    >
      <BrandLogo href={brandHref} />

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-auto rounded-lg border-white/10 bg-white/5 px-3 py-2 text-left text-white hover:bg-white/10 hover:text-white"
            >
              <span className="flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-semibold leading-none">
                    {user.name ?? "Account"}
                  </span>
                  <span className="mt-1 block text-xs text-stone-400">
                    {user.contextName ?? formatRole(user.role)}
                  </span>
                </span>
                <span className="grid size-9 place-items-center rounded-lg bg-white text-sm font-semibold text-stone-950">
                  {(user.name ?? "U").trim().slice(0, 1).toUpperCase()}
                </span>
                <ChevronDownIcon className="size-4 text-stone-400" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            collisionPadding={8}
            className="flex w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
            style={{
              maxHeight:
                "min(42rem, var(--radix-dropdown-menu-content-available-height))",
            }}
            tone="dark"
          >
            <DropdownMenuLabel className="shrink-0 px-4 py-3">
              <span className="block text-stone-500">My Account</span>
              <span className="mt-1 block text-sm font-semibold text-stone-100">
                {user.name ?? "Account"}
              </span>
              <span className="mt-0.5 block text-xs text-stone-400">
                {user.contextName ? `${user.contextName} - ` : ""}
                {formatRole(user.role)}
              </span>
            </DropdownMenuLabel>
            <div className="h-px shrink-0 bg-white/10" />
            <nav
              aria-label="Staff navigation"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
            >
              <div className="space-y-1">
                {groupedNavigationItems.map((group) => {
                  const GroupIcon = group.icon;
                  const isOpen = openNavigationGroup === group.id;

                  return (
                    <div key={group.id}>
                      <DropdownMenuItem
                        aria-expanded={isOpen}
                        className={cn(
                          "font-semibold text-stone-200",
                          isOpen && "bg-white/5 text-white",
                        )}
                        onSelect={(event) => {
                          event.preventDefault();
                          setNavigationDisclosure({
                            activePath,
                            group: isOpen ? null : group.id,
                          });
                        }}
                      >
                        <GroupIcon className="text-stone-400" />
                        <span>{group.label}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-stone-400">
                          {group.items.length}
                        </span>
                        <ChevronDownIcon
                          className={cn(
                            "ml-auto text-stone-400 transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </DropdownMenuItem>
                      {isOpen ? (
                        <div className="pb-1 pt-1">
                          {group.items.map((item) => (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex w-full flex-col items-start gap-0.5 pl-8",
                                  activeNavigationHref === item.href &&
                                    "bg-white/10 text-white",
                                )}
                              >
                                <span className="font-medium">{item.label}</span>
                                {item.description ? (
                                  <span className="text-xs text-stone-500">
                                    {item.description}
                                  </span>
                                ) : null}
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </nav>
            <div className="shrink-0 border-t border-white/10 p-1.5">
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  void signOut({ callbackUrl: "/staff/login" });
                }}
              >
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : customerMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                customerMenu.accountHref && "h-auto px-3 py-2 text-left",
              )}
            >
              {customerMenu.accountHref ? (
                <span className="flex items-center gap-3">
                  <span className="hidden text-right sm:block">
                    <span className="block text-sm font-semibold leading-none">
                      {customerMenu.customerName ?? "Account"}
                    </span>
                    <span className="mt-1 block text-xs text-stone-400">
                      Customer
                    </span>
                  </span>
                  <span className="grid size-9 place-items-center rounded-lg bg-white text-sm font-semibold text-stone-950">
                    {(customerMenu.customerName ?? "C").trim().slice(0, 1).toUpperCase()}
                  </span>
                  <ChevronDownIcon className="size-4 text-stone-400" />
                </span>
              ) : (
                <>
                  <MenuIcon className="size-4" />
                  Menu
                  <ChevronDownIcon className="size-4" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64" tone="dark">
            <DropdownMenuLabel>
              <span className="block text-stone-500">
                {customerMenu.accountHref ? "My Account" : "Customer"}
              </span>
              <span className="mt-1 block text-sm font-semibold text-stone-100">
                {customerMenu.customerName ?? "Order menu"}
              </span>
              {customerMenu.accountHref ? (
                <span className="mt-0.5 block text-xs text-stone-400">Customer</span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href={customerMenu.orderHref ?? "/order"}
                className={cn(activePath === "/order" && "bg-white/10 text-white")}
              >
                <UtensilsIcon />
                Order menu
              </Link>
            </DropdownMenuItem>
            {customerMenu.accountHref ? (
              <DropdownMenuItem asChild>
                <Link
                  href={customerMenu.ordersHref ?? "/order/status"}
                  className={cn(
                    activePath === "/order/status" && "bg-white/10 text-white",
                  )}
                >
                  <ClipboardListIcon />
                  Your orders
                </Link>
              </DropdownMenuItem>
            ) : null}
            {customerMenu.loginHref ? (
              <DropdownMenuItem asChild>
                <Link href={customerMenu.loginHref}>
                  <LogInIcon />
                  Customer sign in
                </Link>
              </DropdownMenuItem>
            ) : null}
            {customerMenu.accountHref ? (
              <DropdownMenuItem asChild>
                <Link
                  href={customerMenu.accountHref}
                  className={cn(activePath === "/account" && "bg-white/10 text-white")}
                >
                  <UserRoundIcon />
                  My account
                </Link>
              </DropdownMenuItem>
            ) : null}
            {customerMenu.privacyHref ? (
              <DropdownMenuItem asChild>
                <Link
                  href={customerMenu.privacyHref}
                  className={cn(activePath === "/privacy" && "bg-white/10 text-white")}
                >
                  <ShieldCheckIcon />
                  Privacy notice
                </Link>
              </DropdownMenuItem>
            ) : null}
            {customerMenu.accountHref ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    clearStoredCustomerOrders();
                    void signOut({ callbackUrl: customerMenu.orderHref ?? "/order" });
                  }}
                >
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button asChild className="rounded-lg">
          <Link href="/staff/login">
            <ButtonLabel icon={LogInIcon}>Login</ButtonLabel>
          </Link>
        </Button>
      )}
    </header>
  );
}
