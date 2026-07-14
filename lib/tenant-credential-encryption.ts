import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const envelopeVersion = "v1";

function getEncryptionKey() {
  const encodedKey = process.env.TENANT_CREDENTIALS_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("TENANT_CREDENTIALS_ENCRYPTION_KEY is required for tenant credentials.");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error("TENANT_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }

  return key;
}

function getAdditionalData(organizationId: string, purpose: string) {
  return Buffer.from(`tenant-credential:${envelopeVersion}:${organizationId}:${purpose}`);
}

export function encryptTenantCredential(
  value: string,
  organizationId: string,
  purpose: string,
) {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), initializationVector);
  cipher.setAAD(getAdditionalData(organizationId, purpose));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    envelopeVersion,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTenantCredential(
  envelope: string,
  organizationId: string,
  purpose: string,
) {
  const [version, initializationVector, authenticationTag, encrypted] = envelope.split(".");

  if (
    version !== envelopeVersion ||
    !initializationVector ||
    !authenticationTag ||
    !encrypted
  ) {
    throw new Error("Tenant credential has an unsupported format.");
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(initializationVector, "base64url"),
  );
  decipher.setAAD(getAdditionalData(organizationId, purpose));
  decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getTenantCredentialHint(value: string) {
  const suffix = value.trim().slice(-4);
  return suffix ? `...${suffix}` : null;
}
