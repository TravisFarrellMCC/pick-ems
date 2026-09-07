import { config } from "dotenv";

// Load dotenv config
config();

/**
 * NFL seasons are labeled by the calendar year they *start* in (e.g. the
 * season that kicks off in September 2026 and ends with the Super Bowl in
 * February 2027 is called the "2026" season on ESPN).
 *
 * We default to that convention based on today's date so the scrapers don't
 * need a hardcoded year bumped by hand every year. It can still be
 * overridden explicitly via NFL_SEASON (e.g. while the current season's
 * pages don't exist yet in the preseason gap between January and August).
 */
function currentNflSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; 0 = January
  // Jan (0) through Jun (5) still belong to the season that started the
  // previous calendar year (playoffs/offseason). Jul (6) onward belongs to
  // the season starting this calendar year (preseason/regular season).
  return month < 6 ? year - 1 : year;
}

/**
 * Detects whether a model is a native-reasoning model (o-series, gpt-5+
 * "thinking" variants, gemini-2.5+, etc). Reasoning models already perform
 * extended, multi-step reasoning internally, so they don't need (and may
 * reject) the hand-rolled chain-of-thought scaffold or a `temperature`
 * parameter that non-reasoning chat models use.
 *
 * @param envOverrideName An env var (e.g. OPENAI_REASONING_MODEL) that, if
 *   set to "true"/"false", overrides the pattern match entirely — for
 *   models this heuristic doesn't recognize.
 * @param pattern The default heuristic for this provider's model names.
 * @param model The configured model name to check.
 */
function isReasoningModel(
  envOverrideName: string,
  pattern: RegExp,
  model: string,
): boolean {
  const override = process.env[envOverrideName];
  if (override != null) {
    return override === "true";
  }
  return pattern.test(model);
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
// NOTE: our Gemini key is a Vertex AI Express Mode key (see gemini.ts),
// which only had gemini-2.5+ models available in its default region
// (us-central1) at the time this was set up — gemini-2.0-flash 404'd.
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-2.5-flash";

export const CONFIG = {
  // OPENAI_API_KEY is intentionally not read here: it's resolved lazily
  // (env var override, else GCP Secret Manager) by OpenAiProvider via
  // getOpenAiApiKey() in secrets.ts, since fetching it may require a
  // network call. Same for Gemini's key.
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
  OPENAI_MODEL,
  OPENAI_IS_REASONING_MODEL: isReasoningModel(
    "OPENAI_REASONING_MODEL",
    /^(o[0-9]|gpt-5|gpt-6)/i,
    OPENAI_MODEL,
  ),
  // Gemini is the primary LLM provider (see src/utils/llm/llm.ts), with
  // OpenAI as the fallback on any failure. GOOGLE_API_KEY can override the
  // Secret Manager lookup directly (see src/utils/secrets.ts) for local dev.
  GOOGLE_MODEL,
  GOOGLE_IS_REASONING_MODEL: isReasoningModel(
    "GOOGLE_REASONING_MODEL",
    /^gemini-(2\.5|3|.*thinking)/i,
    GOOGLE_MODEL,
  ),
  NFL_SEASON: process.env.NFL_SEASON
    ? parseInt(process.env.NFL_SEASON, 10)
    : currentNflSeason(),
  // How many times to independently sample the winner prediction and take a
  // majority vote. 1 disables ensembling and behaves like a single call.
  PREDICTION_SAMPLES: process.env.PREDICTION_SAMPLES
    ? parseInt(process.env.PREDICTION_SAMPLES, 10)
    : 1,
  // When true, predictWinner queries every configured LLM provider (Gemini
  // AND OpenAI) instead of only falling back to OpenAI when Gemini fails,
  // and merges all of their answers via the same majority-vote logic used
  // for PREDICTION_SAMPLES. Off by default: normal mode is Gemini-primary/
  // OpenAI-fallback, which only costs one call per match in the common case.
  CONSENSUS_MODE: process.env.CONSENSUS_MODE === "true",
  HEADLESS: process.env.HEADLESS === "true",
  VERBOSE: process.env.VERBOSE === "true",
};

// Fail loudly if the OPENAI_ORG_ID is still the default value
if (CONFIG.OPENAI_ORG_ID === "org-xxxxxxxxxxxxxxxxxxxxxxxx") {
  throw new Error(
    "Please set OPENAI_ORG_ID in your .env file to a non-default value (or unset it).",
  );
}
