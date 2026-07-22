import type {
  OrderFulfilmentType,
  OrderItemStatus,
} from "@/lib/constants";

export type KdsStation = {
  id: string;
  name: string;
  type: "BAR" | "KITCHEN" | "OTHER";
};

export type KdsTicketItem = {
  id: string;
  drinkName: string;
  modifiers: Array<{
    id?: string;
    modifierName: string;
    quantity: number;
  }>;
  notes: string | null;
  prepStationId: string;
  prepStationName: string;
  quantity: number;
  status: OrderItemStatus;
};

export type KdsTicket = {
  createdAt: string;
  customerName: string;
  fulfilmentType: OrderFulfilmentType;
  items: KdsTicketItem[];
  orderDate: string | null;
  orderId: string;
  orderNo: number;
  promisedFulfilmentAt: string | null;
  requestedFulfilmentAt: string | null;
};

export type KdsBoardPayload = {
  canUpdateStatus: boolean;
  orders: KdsTicket[];
  stations: KdsStation[];
};
