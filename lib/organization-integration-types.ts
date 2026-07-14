export type IntegrationMode = "INHERIT" | "CUSTOM" | "DISABLED";

export type OrganizationEmailSettingsSnapshot = {
  organization: {
    id: string;
    name: string;
    type: "PLATFORM" | "COMPANY" | "RESTAURANT";
  };
  parent: {
    id: string;
    name: string;
    type: "PLATFORM" | "COMPANY" | "RESTAURANT";
  } | null;
  settings: {
    mode: IntegrationMode;
    provider: "SMTP2GO";
    fromName: string;
    fromEmail: string;
    replyToEmail: string;
    hasApiKey: boolean;
    apiKeyHint: string | null;
    verificationStatus: "NOT_CONFIGURED" | "PENDING" | "VERIFIED" | "FAILED";
    lastTestedAt: string | null;
  };
  effective: {
    status: "CONFIGURED" | "DISABLED" | "UNAVAILABLE";
    source: "ORGANIZATION" | "PLATFORM_DEFAULT" | "NONE";
    sourceOrganizationId: string | null;
    sourceOrganizationName: string;
    sender: string | null;
    reason: "DISABLED" | "INCOMPLETE" | "NOT_VERIFIED" | "NO_CONFIGURATION" | null;
  };
};
