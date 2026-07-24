export type TaxTreatment =
  | "TAXABLE"
  | "ZERO_RATED"
  | "EXEMPT"
  | "OUT_OF_SCOPE";

export type RestaurantTaxDefinitionRecord = {
  id: string;
  code: string;
  name: string;
  treatment: TaxTreatment;
  isCompound: boolean;
  calculationOrder: number;
  isActive: boolean;
  isDefault: boolean;
  rateBps: number | null;
  rateEffectiveFrom: string | null;
  assignedItemCount: number;
  isProfileDefault: boolean;
};
