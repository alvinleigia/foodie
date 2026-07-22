import { expect, test } from "@playwright/test";

import {
  activateAccessContext,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

type MenuPayload = {
  categories: Array<{
    id: string;
    isActive: boolean;
    items: Array<{
      id: string;
      isActive: boolean;
      isSoldOut: boolean;
      isUnavailableDueToStock?: boolean;
    }>;
  }>;
};

function liveConcurrencyConfig() {
  return {
    baseUrl: optionalEnv("E2E_CONCURRENCY_BASE_URL"),
    context:
      optionalEnv("E2E_CONCURRENCY_CONTEXT") ?? "RESTAURANT MANAGER",
    password: optionalEnv("E2E_CONCURRENCY_PASSWORD"),
    username: optionalEnv("E2E_CONCURRENCY_USERNAME"),
  };
}

test.describe("live order status concurrency", () => {
  test("allows only one simultaneous pending-to-preparing transition", async ({
    page,
  }) => {
    const config = liveConcurrencyConfig();

    test.skip(
      !config.baseUrl || !config.username || !config.password,
      "Set E2E_CONCURRENCY_BASE_URL, E2E_CONCURRENCY_USERNAME and E2E_CONCURRENCY_PASSWORD to run the live race test.",
    );

    if (!config.baseUrl || !config.username || !config.password) {
      return;
    }

    process.env.E2E_CONCURRENCY_USERNAME = config.username;
    process.env.E2E_CONCURRENCY_PASSWORD = config.password;

    await loginWithStaffCredentials(
      page,
      "E2E_CONCURRENCY_USERNAME",
      "E2E_CONCURRENCY_PASSWORD",
      config.baseUrl,
    );
    await activateAccessContext(page, config.baseUrl, config.context);

    const menuResponse = await page.request.get(
      pathForBaseUrl(config.baseUrl, "/api/menu"),
    );
    expect(menuResponse.ok()).toBeTruthy();

    const menu = (await menuResponse.json()) as MenuPayload;
    const category = menu.categories.find((candidate) =>
      candidate.isActive &&
      candidate.items.some(
        (item) =>
          item.isActive &&
          !item.isSoldOut &&
          !item.isUnavailableDueToStock,
      ),
    );
    const item = category?.items.find(
      (candidate) =>
        candidate.isActive &&
        !candidate.isSoldOut &&
        !candidate.isUnavailableDueToStock,
    );

    test.skip(!category || !item, "The UAT restaurant needs one available menu item.");

    if (!category || !item) {
      return;
    }

    let orderId: string | undefined;

    try {
      const createResponse = await page.request.post(
        pathForBaseUrl(config.baseUrl, "/api/orders"),
        {
          data: {
            customerName: `[E2E] concurrency ${Date.now()}`,
            fulfilmentType: "DINE_IN",
            items: [
              {
                categoryId: category.id,
                drinkId: item.id,
                modifiers: [],
                notes: "Automated compare-and-set test",
                quantity: 1,
              },
            ],
            scheduledFulfilmentAt: null,
          },
        },
      );
      if (!createResponse.ok()) {
        throw new Error(
          `Could not create the concurrency test order: ${createResponse.status()} ${await createResponse.text()}`,
        );
      }

      const created = (await createResponse.json()) as { orderId: string };
      orderId = created.orderId;
      const transitionUrl = pathForBaseUrl(
        config.baseUrl,
        `/api/orders/${orderId}/start`,
      );
      const responses = await Promise.all([
        page.request.post(transitionUrl),
        page.request.post(transitionUrl),
      ]);

      expect(responses.map((response) => response.status()).sort()).toEqual([
        200,
        409,
      ]);
    } finally {
      if (orderId) {
        await page.request.post(
          pathForBaseUrl(config.baseUrl, `/api/orders/${orderId}/cancel`),
          {
            data: {
              applyCustomerCancellationFee: false,
              cancelReason: "Automated UAT cleanup",
              retryRefund: false,
            },
          },
        );
      }
    }
  });
});
