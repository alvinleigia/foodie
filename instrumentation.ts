import type { Instrumentation } from "next";

function normalizeRequestError(error: unknown): Error & { digest?: string } {
  if (error instanceof Error) {
    return error;
  }

  const normalized = new Error(
    typeof error === "string" ? error : "Unknown server error",
  ) as Error & { digest?: string };

  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    normalized.digest = error.digest;
  }

  return normalized;
}

export function register() {}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const requestError = normalizeRequestError(error);

  if (process.env.NEXT_RUNTIME === "edge") {
    console.error(
      JSON.stringify({
        level: "error",
        event: "application.unhandled_edge_error",
        timestamp: new Date().toISOString(),
        method: request.method,
        requestPath: request.path.split(/[?#]/, 1)[0],
        routePath: context.routePath,
        routeType: context.routeType,
        digest: requestError.digest,
      }),
    );
    return;
  }

  try {
    const { reportUnhandledServerError } = await import(
      "@/lib/operational-alerts"
    );

    await reportUnhandledServerError({
      error: requestError,
      request: {
        method: request.method,
        path: request.path,
      },
      context: {
        routePath: context.routePath,
        routeType: context.routeType,
        routerKind: context.routerKind,
      },
    });
  } catch (monitoringError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "application.error_monitor_failed",
        timestamp: new Date().toISOString(),
        message:
          monitoringError instanceof Error
            ? monitoringError.message
            : "Unknown monitoring error",
        routePath: context.routePath,
        digest: requestError.digest,
      }),
    );
  }
};
