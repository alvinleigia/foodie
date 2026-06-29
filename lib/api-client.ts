function getValidationMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const fieldErrors = (payload as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;
  const formErrors = (payload as { formErrors?: string[] }).formErrors;

  const firstFieldMessage = fieldErrors
    ? Object.values(fieldErrors).flat().find((message) => typeof message === "string")
    : undefined;

  return firstFieldMessage ?? formErrors?.[0] ?? null;
}

export function getApiErrorMessage(payload: unknown, fallback = "Something went wrong.") {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybeError = (payload as { error?: unknown }).error;

  if (typeof maybeError === "string") {
    return maybeError;
  }

  return getValidationMessage(maybeError) ?? getValidationMessage(payload) ?? fallback;
}

export function getApiError(payload: unknown, fallback = "Action failed.") {
  return getApiErrorMessage(payload, fallback);
}

type JsonRequestOptions = {
  body?: unknown;
  fallbackError?: string;
  method?: "DELETE" | "PATCH" | "POST" | "PUT";
};

export function getCaughtErrorMessage(error: unknown, fallback = "Action failed.") {
  return error instanceof Error ? error.message : fallback;
}

export async function requestJson<T = unknown>(
  path: string,
  { body, fallbackError = "Action failed.", method = "POST" }: JsonRequestOptions = {},
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiError(payload, fallbackError));
  }

  return payload as T;
}
