import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let client: SecretManagerServiceClient | null = null;
let cachedGeminiApiKey: Promise<string> | null = null;
let cachedOpenAiApiKey: Promise<string> | null = null;

/**
 * Resolves the Gemini API key: a direct GOOGLE_API_KEY env var if set
 * (handy for local overrides), otherwise GCP Secret Manager via
 * Application Default Credentials — i.e. whatever `gcloud auth
 * application-default login` last set up. Plain `gcloud auth login` is a
 * *different* credential store and is NOT sufficient for this; see the
 * "GCP account separation" project memory if this starts failing with a
 * PERMISSION_DENIED on secretmanager.versions.access.
 *
 * @returns {Promise<string>} The Gemini API key.
 */
export function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey == null) {
    cachedGeminiApiKey = resolveSecret(
      process.env.GOOGLE_API_KEY,
      process.env.GOOGLE_SECRET_NAME ||
        "projects/yahoo-fantasy-football/secrets/gemini-ai-key/versions/latest",
    );
  }
  return cachedGeminiApiKey;
}

/**
 * Resolves the OpenAI API key: a direct OPENAI_API_KEY env var if set,
 * otherwise GCP Secret Manager (same auth requirements as
 * getGeminiApiKey above).
 *
 * @returns {Promise<string>} The OpenAI API key.
 */
export function getOpenAiApiKey(): Promise<string> {
  if (cachedOpenAiApiKey == null) {
    cachedOpenAiApiKey = resolveSecret(
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_SECRET_NAME ||
        "projects/yahoo-fantasy-football/secrets/openai-api-key/versions/latest",
    );
  }
  return cachedOpenAiApiKey;
}

/**
 * Resolved once per key and memoized, matching the lazy-cache pattern the
 * repos use elsewhere in this codebase.
 */
async function resolveSecret(
  envOverride: string | undefined,
  secretName: string,
): Promise<string> {
  if (envOverride) {
    return envOverride;
  }

  if (client == null) {
    client = new SecretManagerServiceClient();
  }

  const [version] = await client.accessSecretVersion({ name: secretName });
  const payload = version.payload?.data?.toString();

  if (payload == null || payload === "") {
    throw new Error(
      `Secret Manager returned an empty payload for ${secretName}`,
    );
  }

  return payload;
}
