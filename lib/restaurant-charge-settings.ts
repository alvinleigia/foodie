import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { restaurantChargeSettings } from "@/db/schema";
import type { OrderFulfilmentType } from "@/lib/order-fulfilment";
import { restaurantChargeSettingsSchema } from "@/lib/validations/restaurant-charge-settings";

export type RestaurantChargeSettings = {
  serviceChargeEnabled: boolean;
  serviceChargeRateBps: number;
  serviceChargeDineIn: boolean;
  serviceChargePickup: boolean;
  serviceChargeDelivery: boolean;
  tipsEnabled: boolean;
  tipPresetsBps: number[];
};

export const defaultRestaurantChargeSettings: RestaurantChargeSettings = {
  serviceChargeEnabled: false,
  serviceChargeRateBps: 0,
  serviceChargeDineIn: true,
  serviceChargePickup: false,
  serviceChargeDelivery: false,
  tipsEnabled: false,
  tipPresetsBps: [1000, 1250, 1500],
};

function serialize(
  row: typeof restaurantChargeSettings.$inferSelect,
): RestaurantChargeSettings {
  return {
    serviceChargeEnabled: row.serviceChargeEnabled,
    serviceChargeRateBps: row.serviceChargeRateBps,
    serviceChargeDineIn: row.serviceChargeDineIn,
    serviceChargePickup: row.serviceChargePickup,
    serviceChargeDelivery: row.serviceChargeDelivery,
    tipsEnabled: row.tipsEnabled,
    tipPresetsBps: [row.tipPreset1Bps, row.tipPreset2Bps, row.tipPreset3Bps],
  };
}

export async function getRestaurantChargeSettings(
  organizationId: string,
): Promise<RestaurantChargeSettings> {
  const [row] = await getDb()
    .select()
    .from(restaurantChargeSettings)
    .where(eq(restaurantChargeSettings.organizationId, organizationId))
    .limit(1);

  return row ? serialize(row) : defaultRestaurantChargeSettings;
}

export async function updateRestaurantChargeSettings(
  organizationId: string,
  input: unknown,
) {
  const parsed = restaurantChargeSettingsSchema.parse(input);
  const { tipPresetsBps, ...values } = parsed;
  const [row] = await getDb()
    .insert(restaurantChargeSettings)
    .values({
      organizationId,
      ...values,
      tipPreset1Bps: tipPresetsBps[0],
      tipPreset2Bps: tipPresetsBps[1],
      tipPreset3Bps: tipPresetsBps[2],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: restaurantChargeSettings.organizationId,
      set: {
        ...values,
        tipPreset1Bps: tipPresetsBps[0],
        tipPreset2Bps: tipPresetsBps[1],
        tipPreset3Bps: tipPresetsBps[2],
        updatedAt: new Date(),
      },
    })
    .returning();

  return serialize(row);
}

export function isServiceChargeEnabledForFulfilment(
  settings: RestaurantChargeSettings,
  fulfilmentType: OrderFulfilmentType,
) {
  return (
    settings.serviceChargeEnabled &&
    settings.serviceChargeRateBps > 0 &&
    (fulfilmentType === "DINE_IN"
      ? settings.serviceChargeDineIn
      : fulfilmentType === "PICKUP"
        ? settings.serviceChargePickup
        : settings.serviceChargeDelivery)
  );
}
