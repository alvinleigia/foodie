import {
  getDeploymentResponseHeaders,
  resolveDeploymentIdentity,
} from "@/lib/deployment-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const deployment = resolveDeploymentIdentity();

  return Response.json(
    {
      deployment,
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        ...getDeploymentResponseHeaders(deployment),
      },
    },
  );
}
