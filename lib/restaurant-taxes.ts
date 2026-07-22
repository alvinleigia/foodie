import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  menuItemTaxAssignments,
  organizationDefaultTaxes,
  organizationTaxDefinitions,
  organizationTaxRates,
} from "@/db/schema";
import { getRestaurantTaxProfile } from "@/lib/restaurant-tax-profile";
import type {
  TaxComponentInput,
  TaxPricingMode,
} from "@/lib/tax-pricing";

export type ResolvedRestaurantTaxes = {
  pricingMode: TaxPricingMode;
  taxesByMenuItemId: Map<string, TaxComponentInput[]>;
};

function getLegacyTaxComponent(
  taxRateBps: number,
  taxName: string,
): TaxComponentInput {
  return {
    calculationOrder: 0,
    code: "DEFAULT",
    definitionId: null,
    isCompound: false,
    name: taxName,
    rateBps: taxRateBps,
    treatment: taxRateBps === 0 ? "ZERO_RATED" : "TAXABLE",
  };
}

export async function getResolvedRestaurantTaxes(
  restaurantOrganizationId: string,
  menuItemIds: string[],
  effectiveDate: string,
): Promise<ResolvedRestaurantTaxes> {
  const db = getDb();
  const profile = await getRestaurantTaxProfile(restaurantOrganizationId);
  const pricingMode = profile?.pricingMode ?? "INCLUSIVE";
  const normalizedMenuItemIds = [...new Set(menuItemIds)];

  if (!profile || profile.taxSystem === "NONE") {
    return {
      pricingMode,
      taxesByMenuItemId: new Map(
        normalizedMenuItemIds.map((menuItemId) => [menuItemId, []]),
      ),
    };
  }

  const rateRows = await db
    .select({
      calculationOrder: organizationTaxDefinitions.calculationOrder,
      code: organizationTaxDefinitions.code,
      definitionId: organizationTaxDefinitions.id,
      effectiveFrom: organizationTaxRates.effectiveFrom,
      isCompound: organizationTaxDefinitions.isCompound,
      name: organizationTaxDefinitions.name,
      rateBps: organizationTaxRates.rateBps,
      treatment: organizationTaxDefinitions.treatment,
    })
    .from(organizationTaxDefinitions)
    .innerJoin(
      organizationTaxRates,
      and(
        eq(
          organizationTaxRates.taxDefinitionId,
          organizationTaxDefinitions.id,
        ),
        eq(
          organizationTaxRates.organizationId,
          organizationTaxDefinitions.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(
          organizationTaxDefinitions.organizationId,
          restaurantOrganizationId,
        ),
        eq(organizationTaxDefinitions.isActive, true),
        lte(organizationTaxRates.effectiveFrom, effectiveDate),
        or(
          isNull(organizationTaxRates.effectiveTo),
          gte(organizationTaxRates.effectiveTo, effectiveDate),
        ),
      ),
    )
    .orderBy(
      asc(organizationTaxDefinitions.calculationOrder),
      asc(organizationTaxDefinitions.code),
      desc(organizationTaxRates.effectiveFrom),
    );
  const componentByDefinitionId = new Map<string, TaxComponentInput>();

  for (const row of rateRows) {
    if (!componentByDefinitionId.has(row.definitionId)) {
      componentByDefinitionId.set(row.definitionId, {
        calculationOrder: row.calculationOrder,
        code: row.code,
        definitionId: row.definitionId,
        isCompound: row.isCompound,
        name: row.name,
        rateBps: row.rateBps,
        treatment: row.treatment,
      });
    }
  }

  const [defaultRows, assignmentRows] = await Promise.all([
    db
      .select({
        sortOrder: organizationDefaultTaxes.sortOrder,
        taxDefinitionId: organizationDefaultTaxes.taxDefinitionId,
      })
      .from(organizationDefaultTaxes)
      .where(
        eq(organizationDefaultTaxes.organizationId, restaurantOrganizationId),
      )
      .orderBy(asc(organizationDefaultTaxes.sortOrder)),
    normalizedMenuItemIds.length > 0
      ? db
          .select({
            menuItemId: menuItemTaxAssignments.menuItemId,
            sortOrder: menuItemTaxAssignments.sortOrder,
            taxDefinitionId: menuItemTaxAssignments.taxDefinitionId,
          })
          .from(menuItemTaxAssignments)
          .where(
            and(
              eq(
                menuItemTaxAssignments.organizationId,
                restaurantOrganizationId,
              ),
              inArray(
                menuItemTaxAssignments.menuItemId,
                normalizedMenuItemIds,
              ),
            ),
          )
          .orderBy(asc(menuItemTaxAssignments.sortOrder))
      : Promise.resolve([]),
  ]);
  const defaultComponents = defaultRows.map((row) => {
    const component = componentByDefinitionId.get(row.taxDefinitionId);

    if (!component) {
      throw new Error(
        "A restaurant default tax has no active rate for this order date.",
      );
    }

    return component;
  });
  const assignmentsByMenuItemId = new Map<string, typeof assignmentRows>();

  for (const row of assignmentRows) {
    const assignments = assignmentsByMenuItemId.get(row.menuItemId) ?? [];
    assignments.push(row);
    assignmentsByMenuItemId.set(row.menuItemId, assignments);
  }

  const legacyComponents =
    componentByDefinitionId.size === 0
      ? [
          getLegacyTaxComponent(
            profile.defaultTaxRateBps,
            profile.taxSystem === "OTHER" ? "Tax" : profile.taxSystem,
          ),
        ]
      : [];
  const taxesByMenuItemId = new Map<string, TaxComponentInput[]>();

  for (const menuItemId of normalizedMenuItemIds) {
    const assignments = assignmentsByMenuItemId.get(menuItemId);

    if (!assignments || assignments.length === 0) {
      taxesByMenuItemId.set(
        menuItemId,
        defaultComponents.length > 0 ? defaultComponents : legacyComponents,
      );
      continue;
    }

    const components = assignments.map((assignment) => {
      const component = componentByDefinitionId.get(
        assignment.taxDefinitionId,
      );

      if (!component) {
        throw new Error(
          "A menu item tax has no active rate for this order date.",
        );
      }

      return component;
    });
    taxesByMenuItemId.set(menuItemId, components);
  }

  return { pricingMode, taxesByMenuItemId };
}
