"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  CookingPotIcon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrderStatusBadge } from "@/components/shared/OrderStatusBadge";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KdsBoardPayload, KdsTicketItem } from "@/lib/kds-types";
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";
import { getOrderFulfilmentLabel } from "@/lib/order-fulfilment";

const emptyBoard: KdsBoardPayload = {
  canUpdateStatus: false,
  orders: [],
  stations: [],
};

function formatElapsedTime(createdAt: string, now: number) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(createdAt).getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIMEZONE,
  });
}

function getTicketAgeClass(createdAt: string, now: number) {
  const elapsedMinutes = (now - new Date(createdAt).getTime()) / 60_000;

  if (elapsedMinutes >= 20) {
    return "border-rose-300";
  }

  if (elapsedMinutes >= 10) {
    return "border-amber-300";
  }

  return "border-stone-200";
}

function getItemAction(item: KdsTicketItem) {
  if (item.status === "PENDING") {
    return { action: "start" as const, icon: PlayIcon, label: "Start" };
  }

  if (item.status === "PREPARING") {
    return {
      action: "ready" as const,
      icon: CheckCircleIcon,
      label: "Ready",
    };
  }

  return null;
}

export function KdsBoard() {
  const [board, setBoard] = useState<KdsBoardPayload>(emptyBoard);
  const [selectedStation, setSelectedStation] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef<AbortController | null>(null);
  const hasTicketsRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const syncBoard = useCallback(async (silent = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/orders/kds", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Preparation tickets could not be loaded.");
      }

      setBoard(payload as KdsBoardPayload);
      hasTicketsRef.current = payload.orders.length > 0;
      hasLoadedRef.current = true;
      setHasLoaded(true);
      setError(null);
      setNow(Date.now());
    } catch (loadError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Preparation tickets could not be loaded.",
      );
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped || document.visibilityState === "hidden") {
        return;
      }

      timeoutId = window.setTimeout(
        run,
        hasTicketsRef.current ? 4_000 : 10_000,
      );
    };

    const run = async () => {
      await syncBoard(hasLoadedRef.current);
      schedule();
    };

    const handleVisibilityChange = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (document.visibilityState === "visible") {
        void run();
      }
    };

    void run();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      requestRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [syncBoard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const visibleTickets = useMemo(
    () =>
      board.orders
        .filter((order) => order.status !== "ASSEMBLING")
        .map((order) => ({
          ...order,
          items:
            selectedStation === "all"
              ? order.items
              : order.items.filter(
                  (item) => item.prepStationId === selectedStation,
                ),
        }))
        .filter((order) => order.items.length > 0),
    [board.orders, selectedStation],
  );

  const stationCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const order of board.orders) {
      if (order.status === "ASSEMBLING") {
        continue;
      }

      for (const item of order.items) {
        counts.set(
          item.prepStationId,
          (counts.get(item.prepStationId) ?? 0) + 1,
        );
      }
    }

    return counts;
  }, [board.orders]);

  const assemblyTickets = useMemo(
    () => board.orders.filter((order) => order.status === "ASSEMBLING"),
    [board.orders],
  );

  async function runItemAction(
    orderId: string,
    item: KdsTicketItem,
    action: "ready" | "start",
  ) {
    setPendingItemId(item.id);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(item.id)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "The item status could not be updated.");
      }

      toast.success(
        action === "start"
          ? `${item.drinkName} started.`
          : `${item.drinkName} is ready.`,
      );
      await syncBoard(true);
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The item status could not be updated.";
      setError(message);
      toast.error(message);
      await syncBoard(true);
    } finally {
      setPendingItemId(null);
    }
  }

  async function releaseForHandoff(orderId: string) {
    setPendingOrderId(orderId);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/ready`,
        { method: "POST" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "The order could not be released.");
      }

      toast.success("Order released for handoff.");
      await syncBoard(true);
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The order could not be released.";
      setError(message);
      toast.error(message);
      await syncBoard(true);
    } finally {
      setPendingOrderId(null);
    }
  }

  if (isLoading && !hasLoaded) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-lg bg-white">
        <Spinner />
        <span className="sr-only">Loading preparation tickets</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
            <CookingPotIcon className="size-4" />
            <span>Preparation stations</span>
          </div>
          <p className="mt-2 text-sm text-stone-500">
            Oldest routed tickets appear first. Completed tickets move to final assembly.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void syncBoard(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <>
              <Spinner />
              <span className="sr-only">Refreshing</span>
            </>
          ) : (
            <ButtonLabel icon={RefreshCwIcon}>Refresh</ButtonLabel>
          )}
        </Button>
      </div>

      {assemblyTickets.length > 0 ? (
        <section className="space-y-3 border-y border-stone-200 py-5">
          <div>
            <p className="text-sm font-semibold text-stone-900">Final assembly</p>
            <p className="mt-1 text-sm text-stone-500">
              Orders awaiting final checks and handoff release.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assemblyTickets.map((ticket) => (
              <Card key={ticket.orderId} className="rounded-lg border-violet-200 bg-white">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-stone-500">
                        Order #{ticket.orderNo}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-stone-950">
                        {ticket.customerName}
                      </h2>
                    </div>
                    <OrderStatusBadge status={ticket.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2">
                  <ul className="space-y-1 text-sm text-stone-700">
                    {ticket.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity} x {item.drinkName}
                      </li>
                    ))}
                  </ul>
                  {board.canUpdateStatus ? (
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => void releaseForHandoff(ticket.orderId)}
                      disabled={pendingOrderId !== null}
                    >
                      {pendingOrderId === ticket.orderId ? (
                        <>
                          <Spinner />
                          <span className="sr-only">Releasing order</span>
                        </>
                      ) : (
                        <ButtonLabel icon={CheckCircleIcon}>Ready for handoff</ButtonLabel>
                      )}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Preparation station filter"
      >
        <Button
          type="button"
          variant={selectedStation === "all" ? "default" : "outline"}
          onClick={() => setSelectedStation("all")}
          className="justify-between"
        >
          <span>All stations</span>
          <span>
            {board.orders.reduce(
              (total, order) =>
                order.status === "ASSEMBLING"
                  ? total
                  : total + order.items.length,
              0,
            )}
          </span>
        </Button>
        {board.stations.map((station) => (
          <Button
            key={station.id}
            type="button"
            variant={selectedStation === station.id ? "default" : "outline"}
            onClick={() => setSelectedStation(station.id)}
            className="justify-between"
          >
            <span>{station.name}</span>
            <span>{stationCounts.get(station.id) ?? 0}</span>
          </Button>
        ))}
      </div>

      {error ? (
        <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {visibleTickets.length === 0 ? (
        <EmptyState
          title="No routed tickets waiting"
          description={
            selectedStation === "all"
              ? "New preparation items will appear here automatically."
              : "This station has no pending preparation work."
          }
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTickets.map((ticket) => {
            const fulfilmentAt =
              ticket.promisedFulfilmentAt ?? ticket.requestedFulfilmentAt;

            return (
              <Card
                key={ticket.orderId}
                className={`overflow-hidden rounded-lg bg-white ${getTicketAgeClass(ticket.createdAt, now)}`}
              >
                <CardHeader className="border-b border-stone-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-stone-500">
                        Order #{ticket.orderNo}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-stone-950">
                        {ticket.customerName}
                      </h2>
                      <p className="mt-1 text-sm text-stone-500">
                        {getOrderFulfilmentLabel(ticket.fulfilmentType)}
                        {fulfilmentAt ? ` · Due ${formatTime(fulfilmentAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-stone-700">
                      <ClockIcon className="size-4" />
                      <span>{formatElapsedTime(ticket.createdAt, now)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-stone-200 p-0">
                  {ticket.items.map((item) => {
                    const itemAction = getItemAction(item);

                    return (
                      <div key={item.id} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-950">
                              {item.quantity} × {item.drinkName}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase text-stone-500">
                              {item.prepStationName}
                            </p>
                          </div>
                          <OrderStatusBadge status={item.status} />
                        </div>

                        {item.modifiers.length > 0 ? (
                          <ul className="space-y-1 text-sm text-stone-600">
                            {item.modifiers.map((modifier, index) => (
                              <li key={modifier.id ?? `${modifier.modifierName}-${index}`}>
                                + {modifier.quantity > 1 ? `${modifier.quantity} × ` : ""}
                                {modifier.modifierName}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {item.notes ? (
                          <p className="border-l-2 border-amber-400 pl-3 text-sm font-medium text-stone-800">
                            {item.notes}
                          </p>
                        ) : null}

                        {itemAction && board.canUpdateStatus ? (
                          <Button
                            type="button"
                            className="w-full"
                            onClick={() =>
                              void runItemAction(
                                ticket.orderId,
                                item,
                                itemAction.action,
                              )
                            }
                            disabled={pendingItemId !== null}
                          >
                            {pendingItemId === item.id ? (
                              <>
                                <Spinner />
                                <span className="sr-only">Updating</span>
                              </>
                            ) : (
                              <ButtonLabel icon={itemAction.icon}>
                                {itemAction.label}
                              </ButtonLabel>
                            )}
                          </Button>
                        ) : item.status === "READY" ? (
                          <p className="text-sm font-semibold text-emerald-700">
                            Ready at station
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
