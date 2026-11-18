"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  isRestaurantOpenForCustomerOrders,
  getRestaurantClosedMessage,
  type RestaurantWorkingHours,
} from "@/lib/working-hours";

export function RestaurantWorkingHoursWatcher({
  workingHours,
  orderingOpen,
  closedMessage,
}: {
  workingHours: RestaurantWorkingHours;
  orderingOpen: boolean;
  closedMessage: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!workingHours.enabled) {
      return;
    }

    let previousStatus = JSON.stringify([orderingOpen, closedMessage]);
    function refreshWhenStatusChanges() {
      const isOpen = isRestaurantOpenForCustomerOrders(workingHours);
      const status = JSON.stringify([isOpen, getRestaurantClosedMessage(workingHours)]);

      if (status !== previousStatus) {
        previousStatus = status;
        router.refresh();
      }
    }

    refreshWhenStatusChanges();
    const interval = window.setInterval(refreshWhenStatusChanges, 30_000);
    window.addEventListener("focus", refreshWhenStatusChanges);
    document.addEventListener("visibilitychange", refreshWhenStatusChanges);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenStatusChanges);
      document.removeEventListener("visibilitychange", refreshWhenStatusChanges);
    };
  }, [router, workingHours, orderingOpen, closedMessage]);

  return null;
}
