"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  isRestaurantOpenForCustomerOrders,
  type RestaurantWorkingHours,
} from "@/lib/working-hours";

export function RestaurantWorkingHoursWatcher({
  workingHours,
}: {
  workingHours: RestaurantWorkingHours;
}) {
  const router = useRouter();
  const wasOpen = useRef(
    isRestaurantOpenForCustomerOrders(workingHours),
  );

  useEffect(() => {
    if (!workingHours.enabled) {
      return;
    }

    function refreshWhenStatusChanges() {
      const isOpen = isRestaurantOpenForCustomerOrders(workingHours);

      if (isOpen !== wasOpen.current) {
        wasOpen.current = isOpen;
        router.refresh();
      }
    }

    const interval = window.setInterval(refreshWhenStatusChanges, 30_000);
    window.addEventListener("focus", refreshWhenStatusChanges);
    document.addEventListener("visibilitychange", refreshWhenStatusChanges);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenStatusChanges);
      document.removeEventListener("visibilitychange", refreshWhenStatusChanges);
    };
  }, [router, workingHours]);

  return null;
}
