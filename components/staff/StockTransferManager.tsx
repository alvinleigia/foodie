"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeftIcon,
  PackageCheckIcon,
  PencilLineIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { TableSectionSkeleton } from "@/components/shared/SectionSkeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, requestJson } from "@/lib/api-client";
import { formatAppDateTime } from "@/lib/date-format";
import type {
  InventoryStockTransferConfiguration,
  StockTransferRecord,
  StockTransferStatus,
} from "@/types/inventory-stock-transfer";

type TransferLineDraft = {
  enabled: boolean;
  destinationIngredientId: string;
  quantity: string;
};

const statusLabels: Record<StockTransferStatus, string> = {
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
};

const statusClasses: Record<StockTransferStatus, string> = {
  CANCELLED:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  DRAFT: "border-border bg-muted text-muted-foreground",
  IN_TRANSIT:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  RECEIVED:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function formatQuantity(value: string | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function StockTransferManager() {
  const [configuration, setConfiguration] =
    useState<InventoryStockTransferConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [destinationOrganizationId, setDestinationOrganizationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, TransferLineDraft>
  >({});
  const [receivingTransfer, setReceivingTransfer] =
    useState<StockTransferRecord | null>(null);
  const [receivedQuantities, setReceivedQuantities] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    async function load() {
      try {
        setConfiguration(
          await fetchJson<InventoryStockTransferConfiguration>(
            "/api/inventory/stock-transfers",
            { fallbackError: "Failed to load stock transfers." },
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load stock transfers.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const activeSourceIngredients = useMemo(
    () =>
      configuration?.currentIngredients.filter((ingredient) => ingredient.isActive) ??
      [],
    [configuration],
  );
  const selectedDestination = configuration?.destinations.find(
    (destination) => destination.id === destinationOrganizationId,
  );

  function getMatchingDestinationIngredient(sourceId: string) {
    const source = configuration?.currentIngredients.find(
      (ingredient) => ingredient.id === sourceId,
    );
    if (!source) return "";
    return (
      selectedDestination?.ingredients.find(
        (ingredient) =>
          ingredient.isActive &&
          normalize(ingredient.name) === normalize(source.name) &&
          normalize(ingredient.unit) === normalize(source.unit),
      )?.id ?? ""
    );
  }

  function createEmptyLines(destinationId: string) {
    const destination = configuration?.destinations.find(
      (item) => item.id === destinationId,
    );
    return Object.fromEntries(
      activeSourceIngredients.map((source) => {
        const match = destination?.ingredients.find(
          (ingredient) =>
            ingredient.isActive &&
            normalize(ingredient.name) === normalize(source.name) &&
            normalize(ingredient.unit) === normalize(source.unit),
        );
        return [
          source.id,
          {
            enabled: false,
            destinationIngredientId: match?.id ?? "",
            quantity: "",
          },
        ];
      }),
    );
  }

  function openTransfer(transfer?: StockTransferRecord) {
    const destinationId =
      transfer?.destinationOrganizationId ?? configuration?.destinations[0]?.id ?? "";
    setEditingTransferId(transfer?.id ?? null);
    setDestinationOrganizationId(destinationId);
    setNotes(transfer?.notes ?? "");
    if (transfer) {
      const existingLines = new Map(
        transfer.lines.map((line) => [line.sourceIngredientId, line]),
      );
      setLineDrafts(
        Object.fromEntries(
          activeSourceIngredients.map((source) => {
            const line = existingLines.get(source.id);
            return [
              source.id,
              {
                enabled: Boolean(line),
                destinationIngredientId:
                  line?.destinationIngredientId ?? "",
                quantity: line ? String(Number(line.quantity)) : "",
              },
            ];
          }),
        ),
      );
    } else {
      setLineDrafts(createEmptyLines(destinationId));
    }
    setIsTransferDialogOpen(true);
  }

  function changeDestination(destinationId: string) {
    setDestinationOrganizationId(destinationId);
    const destination = configuration?.destinations.find(
      (item) => item.id === destinationId,
    );
    setLineDrafts((current) =>
      Object.fromEntries(
        activeSourceIngredients.map((source) => {
          const existing = current[source.id];
          const match = destination?.ingredients.find(
            (ingredient) =>
              ingredient.isActive &&
              normalize(ingredient.name) === normalize(source.name) &&
              normalize(ingredient.unit) === normalize(source.unit),
          );
          return [
            source.id,
            {
              enabled: existing?.enabled ?? false,
              destinationIngredientId: match?.id ?? "",
              quantity: existing?.quantity ?? "",
            },
          ];
        }),
      ),
    );
  }

  function updateLine(sourceIngredientId: string, patch: Partial<TransferLineDraft>) {
    setLineDrafts((current) => ({
      ...current,
      [sourceIngredientId]: {
        ...(current[sourceIngredientId] ?? {
          enabled: false,
          destinationIngredientId:
            getMatchingDestinationIngredient(sourceIngredientId),
          quantity: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveTransfer() {
    const lines = Object.entries(lineDrafts)
      .filter(([, line]) => line.enabled)
      .map(([sourceIngredientId, line]) => ({
        sourceIngredientId,
        destinationIngredientId: line.destinationIngredientId,
        quantity: line.quantity,
      }));
    setPendingAction("save");
    try {
      const result = await requestJson<InventoryStockTransferConfiguration>(
        editingTransferId
          ? `/api/inventory/stock-transfers/${editingTransferId}`
          : "/api/inventory/stock-transfers",
        {
          method: editingTransferId ? "PUT" : "POST",
          body: { destinationOrganizationId, notes, lines },
          fallbackError: "Failed to save stock transfer.",
        },
      );
      setConfiguration(result);
      setIsTransferDialogOpen(false);
      toast.success(editingTransferId ? "Transfer updated." : "Transfer created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save stock transfer.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function changeStatus(transfer: StockTransferRecord, action: "SEND" | "CANCEL") {
    setPendingAction(`${action}:${transfer.id}`);
    try {
      setConfiguration(
        await requestJson<InventoryStockTransferConfiguration>(
          `/api/inventory/stock-transfers/${transfer.id}/status`,
          {
            body: { action },
            fallbackError:
              action === "SEND"
                ? "Failed to dispatch stock transfer."
                : "Failed to cancel stock transfer.",
          },
        ),
      );
      toast.success(action === "SEND" ? "Transfer dispatched." : "Transfer cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setPendingAction(null);
    }
  }

  function openReceipt(transfer: StockTransferRecord) {
    setReceivingTransfer(transfer);
    setReceivedQuantities(
      Object.fromEntries(
        transfer.lines.map((line) => [line.id, String(Number(line.quantity))]),
      ),
    );
  }

  async function receiveTransfer() {
    if (!receivingTransfer) return;
    setPendingAction(`receive:${receivingTransfer.id}`);
    try {
      setConfiguration(
        await requestJson<InventoryStockTransferConfiguration>(
          `/api/inventory/stock-transfers/${receivingTransfer.id}/receive`,
          {
            body: {
              lines: receivingTransfer.lines.map((line) => ({
                transferItemId: line.id,
                receivedQuantity: receivedQuantities[line.id] ?? "",
              })),
            },
            fallbackError: "Failed to receive stock transfer.",
          },
        ),
      );
      setReceivingTransfer(null);
      toast.success("Transfer received into stock.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to receive stock transfer.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function renderTransfers(direction: "INBOUND" | "OUTBOUND") {
    const transfers =
      configuration?.transfers.filter((transfer) => transfer.direction === direction) ??
      [];
    if (!transfers.length) {
      return (
        <EmptyState
          title={`No ${direction === "INBOUND" ? "inbound" : "outbound"} transfers`}
          description={
            direction === "INBOUND"
              ? "Transfers dispatched to this restaurant will appear here."
              : "Create a draft to move ingredient stock to another restaurant."
          }
        />
      );
    }
    return (
      <div className="divide-y divide-border border-y border-border">
        {transfers.map((transfer) => (
          <div key={transfer.id} className="grid gap-4 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{transfer.reference}</p>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-medium ${statusClasses[transfer.status]}`}
                  >
                    {statusLabels[transfer.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {transfer.sourceOrganizationName} to {transfer.destinationOrganizationName}
                  {` · Created ${formatAppDateTime(transfer.createdAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {direction === "OUTBOUND" && transfer.status === "DRAFT" ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => openTransfer(transfer)}>
                      <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void changeStatus(transfer, "SEND")}
                      disabled={pendingAction !== null}
                    >
                      <ButtonLabel icon={SendIcon}>Dispatch</ButtonLabel>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void changeStatus(transfer, "CANCEL")}
                      disabled={pendingAction !== null}
                    >
                      <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
                    </Button>
                  </>
                ) : null}
                {direction === "INBOUND" && transfer.status === "IN_TRANSIT" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openReceipt(transfer)}
                  >
                    <ButtonLabel icon={PackageCheckIcon}>Receive</ButtonLabel>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ingredient</th>
                    <th className="px-4 py-3 text-right font-medium">Sent</th>
                    <th className="px-4 py-3 text-right font-medium">Received</th>
                    <th className="px-4 py-3 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transfer.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{line.sourceIngredientName}</span>
                        {line.sourceIngredientName !== line.destinationIngredientName ? (
                          <span className="text-muted-foreground">
                            {` → ${line.destinationIngredientName}`}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatQuantity(line.quantity)} {line.unit}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatQuantity(line.receivedQuantity)} {line.receivedQuantity === null ? "" : line.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatQuantity(line.varianceQuantity)} {line.varianceQuantity === null ? "" : line.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transfer.notes ? (
              <p className="text-sm text-muted-foreground">{transfer.notes}</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Stock transfers</h2>
            <p className="mt-1 text-muted-foreground">
              Dispatch and receive ingredient stock between company restaurants.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => openTransfer()}
            disabled={!configuration?.destinations.length}
          >
            <ButtonLabel icon={PlusIcon}>New transfer</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSectionSkeleton rows={3} />
          ) : configuration ? (
            <Tabs defaultValue="outbound">
              <TabsList>
                <TabsTrigger value="outbound">
                  Outbound ({configuration.transfers.filter((item) => item.direction === "OUTBOUND").length})
                </TabsTrigger>
                <TabsTrigger value="inbound">
                  Inbound ({configuration.transfers.filter((item) => item.direction === "INBOUND").length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="outbound" className="mt-5">
                {renderTransfers("OUTBOUND")}
              </TabsContent>
              <TabsContent value="inbound" className="mt-5">
                {renderTransfers("INBOUND")}
              </TabsContent>
            </Tabs>
          ) : (
            <EmptyState title="Stock transfers unavailable" description="Reload the page to try again." />
          )}
        </CardContent>
      </Card>

      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent className="p-0 sm:max-w-4xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {editingTransferId ? "Edit stock transfer" : "New stock transfer"}
            </DialogTitle>
            <DialogDescription>
              Match source ingredients to the destination restaurant and enter quantities.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-5 overflow-y-auto px-6 py-5">
            <FormField label="Destination restaurant" tone="themed">
              <NativeSelect
                value={destinationOrganizationId}
                onChange={(event) => changeDestination(event.target.value)}
              >
                {configuration?.destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Transfer note" tone="themed">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3"><span className="sr-only">Include</span></th>
                    <th className="px-4 py-3 font-medium">Source ingredient</th>
                    <th className="px-4 py-3 font-medium">Destination ingredient</th>
                    <th className="w-40 px-4 py-3 font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeSourceIngredients.map((ingredient) => {
                    const line = lineDrafts[ingredient.id];
                    const matchingDestinations =
                      selectedDestination?.ingredients.filter(
                        (destinationIngredient) =>
                          destinationIngredient.isActive &&
                          normalize(destinationIngredient.unit) === normalize(ingredient.unit),
                      ) ?? [];
                    return (
                      <tr key={ingredient.id}>
                        <td className="px-4 py-3">
                          <Checkbox
                            aria-label={`Include ${ingredient.name}`}
                            checked={line?.enabled ?? false}
                            onCheckedChange={(checked) =>
                              updateLine(ingredient.id, { enabled: checked === true })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {ingredient.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {formatQuantity(ingredient.currentQuantity)} {ingredient.unit} available
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <NativeSelect
                            className="h-10 w-full text-sm"
                            aria-label={`${ingredient.name} destination ingredient`}
                            disabled={!line?.enabled}
                            value={line?.destinationIngredientId ?? ""}
                            onChange={(event) =>
                              updateLine(ingredient.id, {
                                destinationIngredientId: event.target.value,
                              })
                            }
                          >
                            <option value="">Choose matching ingredient</option>
                            {matchingDestinations.map((destinationIngredient) => (
                              <option key={destinationIngredient.id} value={destinationIngredient.id}>
                                {destinationIngredient.name} ({destinationIngredient.unit})
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            aria-label={`${ingredient.name} transfer quantity`}
                            type="number"
                            min="0.001"
                            max={ingredient.currentQuantity}
                            step="0.001"
                            disabled={!line?.enabled}
                            value={line?.quantity ?? ""}
                            onChange={(event) =>
                              updateLine(ingredient.id, { quantity: event.target.value })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveTransfer()} disabled={pendingAction !== null}>
              <ButtonLabel icon={ArrowRightLeftIcon}>Save draft</ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receivingTransfer !== null}
        onOpenChange={(open) => {
          if (!open) setReceivingTransfer(null);
        }}
      >
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Receive {receivingTransfer?.reference}</DialogTitle>
            <DialogDescription>
              Enter the quantity physically received. Any shortfall is recorded as transfer variance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto px-6 py-5">
            {receivingTransfer?.lines.map((line) => (
              <div
                key={line.id}
                className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
              >
                <div>
                  <p className="font-medium">{line.destinationIngredientName}</p>
                  <p className="text-sm text-muted-foreground">
                    Sent {formatQuantity(line.quantity)} {line.unit}
                  </p>
                </div>
                <FormField label={`Received ${line.unit}`} tone="themed">
                  <Input
                    aria-label={`${line.destinationIngredientName} received quantity`}
                    type="number"
                    min="0"
                    max={line.quantity}
                    step="0.001"
                    value={receivedQuantities[line.id] ?? ""}
                    onChange={(event) =>
                      setReceivedQuantities((current) => ({
                        ...current,
                        [line.id]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceivingTransfer(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void receiveTransfer()} disabled={pendingAction !== null}>
              <ButtonLabel icon={PackageCheckIcon}>Confirm receipt</ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
