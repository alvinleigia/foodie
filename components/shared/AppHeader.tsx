"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  UtensilsIcon,
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
import { canAccessNavigationPath, formatRole } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";
import { cn } from "@/lib/utils";

type AppHeaderUser = {
  name?: string | null;
  role: MembershipRole;
};

type NavigationItem = {
  href: string;
  label: string;
  description?: string;
};

type AppHeaderProps = {
  activePath?: string;
  className?: string;
  customerMenu?: {
    orderHref?: string;
    ordersHref?: string;
  };
  navigationItems?: NavigationItem[];
  user?: AppHeaderUser | null;
};

const defaultNavigationItems: NavigationItem[] = [
  {
    href: "/platform",
    label: "Platform",
    description: "SaaS owner console",
  },
  {
    href: "/platform/companies",
    label: "Companies",
    description: "Parent company tenants",
  },
  {
    href: "/platform/users/memberships",
    label: "User Memberships",
    description: "Review cross-tenant access",
  },
  {
    href: "/company",
    label: "Company",
    description: "Restaurants and reporting",
  },
  {
    href: "/company/users",
    label: "Company Users",
    description: "Manage user access",
  },
  {
    href: "/restaurant",
    label: "Restaurant",
    description: "Restaurant setup",
  },
  {
    href: "/operations/orders",
    label: "Orders",
    description: "Live order operations",
  },
  {
    href: "/operations/menu",
    label: "Menu Manager",
    description: "Categories and products",
  },
  {
    href: "/operations/inventory",
    label: "Inventory",
    description: "Stock control",
  },
  {
    href: "/audit-logs",
    label: "Audit logs",
    description: "Security and change history",
  },
  {
    href: "/order",
    label: "Customer order",
    description: "Public ordering page",
  },
];

function BrandLogo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3">
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
  className,
  customerMenu,
  navigationItems = defaultNavigationItems,
  user,
}: AppHeaderProps) {
  const visibleNavigationItems = user
    ? navigationItems.filter((item) => canAccessNavigationPath(user.role, item.href))
    : navigationItems;

  return (
    <header
      className={cn(
        "mb-8 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-stone-950/55 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur",
        className,
      )}
    >
      <BrandLogo />

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
                    {formatRole(user.role)}
                  </span>
                </span>
                <span className="grid size-9 place-items-center rounded-lg bg-white text-sm font-semibold text-stone-950">
                  {(user.name ?? "U").trim().slice(0, 1).toUpperCase()}
                </span>
                <ChevronDownIcon className="size-4 text-stone-400" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72" tone="dark">
            <DropdownMenuLabel>
              <span className="block text-stone-500">My Account</span>
              <span className="mt-1 block text-sm font-semibold text-stone-100">
                {user.name ?? "Account"}
              </span>
              <span className="mt-0.5 block text-xs text-stone-400">
                {formatRole(user.role)}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {visibleNavigationItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5",
                    activePath === item.href && "bg-white/10 text-white",
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="text-xs text-stone-500">{item.description}</span>
                  ) : null}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : customerMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <MenuIcon className="size-4" />
              Menu
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64" tone="dark">
            <DropdownMenuLabel>
              <span className="block text-stone-500">Customer</span>
              <span className="mt-1 block text-sm font-semibold text-stone-100">
                Order menu
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={customerMenu.orderHref ?? "/order"}>
                <UtensilsIcon />
                Order menu
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={customerMenu.ordersHref ?? "/order/status"}>
                <ClipboardListIcon />
                Your orders
              </Link>
            </DropdownMenuItem>
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
