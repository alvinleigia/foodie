"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Spinner } from "@/components/shared/Spinner";

const SAFETY_TIMEOUT_MS = 8000;

function shouldShowForAnchor(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href");

  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  ) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (nextUrl.origin !== currentUrl.origin) {
    return false;
  }

  return (
    nextUrl.pathname !== currentUrl.pathname ||
    nextUrl.search !== currentUrl.search
  );
}

export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [isNavigating, setIsNavigating] = useState(false);
  const [isCustomerNavigation, setIsCustomerNavigation] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const settleTimer = window.setTimeout(() => {
      setIsNavigating(false);
    }, 120);

    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [routeKey]);

  useEffect(() => {
    function startNavigation(customer: boolean) {
      setIsCustomerNavigation(customer);
      setIsNavigating(true);

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setIsNavigating(false);
        timeoutRef.current = null;
      }, SAFETY_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const anchor = event.target.closest("a");

      if (anchor instanceof HTMLAnchorElement && shouldShowForAnchor(anchor)) {
        startNavigation(Boolean(anchor.closest("[data-customer-storefront]")));
      }
    }

    function handlePopState() {
      startNavigation(Boolean(document.querySelector("main[data-customer-storefront]")));
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isNavigating) {
    return null;
  }

  return (
    <div
      data-slot="route-transition-overlay"
      aria-live="polite"
      aria-busy="true"
      data-customer-storefront={isCustomerNavigation ? "" : undefined}
      data-theme-static={isCustomerNavigation ? "" : undefined}
      className={`fixed inset-0 z-[9998] grid cursor-wait place-items-center backdrop-blur-sm ${isCustomerNavigation ? "bg-teal-950/10" : "bg-stone-950/45"}`}
    >
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-muted/50">
        <div className="h-full w-1/2 animate-pulse bg-primary" />
      </div>
      <div className="grid min-w-52 place-items-center gap-4 rounded-xl border border-border bg-popover/95 px-8 py-7 text-center text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <Spinner className={isCustomerNavigation ? "size-8 text-primary" : "size-8 text-foreground"} />
        <div>
          <p className="text-base font-semibold text-foreground">Loading</p>
          <p className="mt-1 text-sm text-muted-foreground">Please wait...</p>
        </div>
      </div>
    </div>
  );
}
