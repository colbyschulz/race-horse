import "server-only";

// Every environment variable the server reads, and what stops working without
// it. Checked once at startup so a missing one shows up in the deploy's logs
// straight away instead of as a failure the first time a feature is used.
const REQUIRED: Record<string, string> = {
  DATABASE_URL: "nothing loads",
  AUTH_SECRET: "sign-in and sessions",
  AUTH_STRAVA_ID: "Strava sign-in and activity sync",
  AUTH_STRAVA_SECRET: "Strava sign-in and activity sync",
  ANTHROPIC_API_KEY: "the coach and plan-file extraction",
  BLOB_READ_WRITE_TOKEN: "plan file uploads",
};

const OPTIONAL: Record<string, string> = {
  STRAVA_VERIFY_TOKEN: "Strava cannot verify the webhook subscription",
  ADMIN_API_TOKEN: "the Strava subscription admin routes stay locked",
};

/** Names of the required variables that are unset, with what each one breaks. */
export function missingEnv(env: Record<string, string | undefined> = process.env) {
  return Object.entries(REQUIRED)
    .filter(([name]) => !env[name])
    .map(([name, breaks]) => ({ name, breaks }));
}

/**
 * Logs what is missing. It reports rather than throws: a deploy that lacks,
 * say, the blob token should still serve everything that doesn't need it.
 */
export function reportMissingEnv(env: Record<string, string | undefined> = process.env): void {
  for (const { name, breaks } of missingEnv(env)) {
    console.error(`[env] ${name} is not set: ${breaks} will not work.`);
  }
  for (const [name, effect] of Object.entries(OPTIONAL)) {
    if (!env[name]) console.warn(`[env] ${name} is not set: ${effect}.`);
  }
}
