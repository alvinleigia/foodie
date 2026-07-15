export type IntegrationMode = "INHERIT" | "CUSTOM" | "DISABLED";

export type SocialAuthProvider = "GOOGLE" | "APPLE" | "FACEBOOK";

export type OrganizationOAuthSettingsSnapshot = {
  organization: {
    id: string;
    name: string;
    type: "COMPANY" | "RESTAURANT";
  };
  parent: {
    id: string;
    name: string;
    type: "COMPANY";
  } | null;
  settings: {
    provider: SocialAuthProvider;
    mode: IntegrationMode;
    clientId: string;
    hasClientSecret: boolean;
    clientSecretHint: string | null;
  };
  effective: {
    status: "CONFIGURED" | "DISABLED" | "UNAVAILABLE";
    source: "ORGANIZATION" | "PLATFORM_DEFAULT" | "NONE";
    sourceOrganizationId: string | null;
    sourceOrganizationName: string;
    reason: "DISABLED" | "INCOMPLETE" | "NO_CONFIGURATION" | null;
  };
};

export type OrganizationEmailSettingsSnapshot = {
  organization: {
    id: string;
    name: string;
    type: "COMPANY" | "RESTAURANT";
  };
  parent: {
    id: string;
    name: string;
    type: "COMPANY";
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

export type OrganizationPaymentSettingsSnapshot = {
  organization: {
    id: string;
    name: string;
    type: "COMPANY" | "RESTAURANT";
  };
  parent: {
    id: string;
    name: string;
    type: "COMPANY";
  } | null;
  settings: {
    mode: IntegrationMode;
    provider: "STRIPE";
    stripeAccountId: string | null;
    onboardingStatus: "NOT_STARTED" | "PENDING" | "COMPLETE" | "RESTRICTED";
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    lastSyncedAt: string | null;
  };
  effective: {
    status: "CONFIGURED" | "DISABLED" | "UNAVAILABLE";
    sourceOrganizationId: string | null;
    sourceOrganizationName: string;
    stripeAccountId: string | null;
    reason: "DISABLED" | "INCOMPLETE" | "ONBOARDING_INCOMPLETE" | "NO_CONFIGURATION" | null;
  };
};
