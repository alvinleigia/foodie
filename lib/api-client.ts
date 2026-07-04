export type FieldErrors<TField extends string = string> = Partial<Record<TField, string>>;
export type ApiFieldErrors = FieldErrors;

type ApiValidationErrors<TField extends string = string> = {
  fieldErrors: FieldErrors<TField>;
  formError: string | null;
};

type ValidationErrorPayload = {
  fieldErrors?: Record<string, string[] | string | undefined>;
  formErrors?: string[];
};

export function getFieldError<TField extends string>(fieldErrors: FieldErrors<TField>, field: TField) {
  return fieldErrors[field] ?? null;
}

export function getFirstFieldError(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors).find((message) => typeof message === "string") ?? null;
}

export function hasFieldErrors(fieldErrors: FieldErrors) {
  return getFirstFieldError(fieldErrors) !== null;
}

function getValidationDetails<TField extends string = string>(payload: unknown): ApiValidationErrors<TField> {
  const details: ApiValidationErrors<TField> = {
    fieldErrors: {},
    formError: null,
  };

  if (!payload || typeof payload !== "object") {
    return details;
  }

  const { fieldErrors, formErrors } = payload as ValidationErrorPayload;

  if (fieldErrors) {
    details.fieldErrors = Object.fromEntries(
      Object.entries(fieldErrors).flatMap(([field, messages]) => {
        const message = Array.isArray(messages) ? messages.find((item) => typeof item === "string") : messages;

        return typeof message === "string" ? [[field, message]] : [];
      }),
    ) as FieldErrors<TField>;
  }

  details.formError = formErrors?.find((message) => typeof message === "string") ?? null;

  return details;
}

function getValidationMessage(payload: unknown) {
  const details = getValidationDetails(payload);

  return getFirstFieldError(details.fieldErrors) ?? details.formError;
}

export function getApiValidationErrors<TField extends string = string>(
  payload: unknown,
  fallback = "Something went wrong.",
): ApiValidationErrors<TField> {
  if (typeof payload === "string") {
    return { fieldErrors: {}, formError: payload };
  }

  if (!payload || typeof payload !== "object") {
    return { fieldErrors: {}, formError: fallback };
  }

  const maybeError = (payload as { error?: unknown }).error;

  if (typeof maybeError === "string") {
    return { fieldErrors: {}, formError: maybeError };
  }

  const nestedDetails = getValidationDetails<TField>(maybeError);
  const directDetails = getValidationDetails<TField>(payload);
  const fieldErrors = hasFieldErrors(nestedDetails.fieldErrors)
    ? nestedDetails.fieldErrors
    : directDetails.fieldErrors;
  const formError = nestedDetails.formError ?? directDetails.formError;

  return {
    fieldErrors,
    formError: hasFieldErrors(fieldErrors) ? formError : (formError ?? fallback),
  };
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

type JsonFetchOptions = {
  fallbackError?: string;
};

export class ApiRequestError extends Error {
  payload: unknown;
  status: number;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function getCaughtErrorMessage(error: unknown, fallback = "Action failed.") {
  return error instanceof Error ? error.message : fallback;
}

export function getCaughtValidationErrors<TField extends string = string>(
  error: unknown,
  fallback = "Action failed.",
): ApiValidationErrors<TField> {
  if (isApiRequestError(error)) {
    return getApiValidationErrors<TField>(error.payload, fallback);
  }

  return {
    fieldErrors: {},
    formError: getCaughtErrorMessage(error, fallback),
  };
}

export async function fetchJson<T = unknown>(
  path: string,
  { fallbackError = "Action failed." }: JsonFetchOptions = {},
) {
  const response = await fetch(path);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(getApiError(payload, fallbackError), response.status, payload);
  }

  return payload as T;
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
    throw new ApiRequestError(getApiError(payload, fallbackError), response.status, payload);
  }

  return payload as T;
}
