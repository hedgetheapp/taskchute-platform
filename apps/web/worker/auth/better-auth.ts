import { betterAuth } from "better-auth";

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters");
  return secret;
}

export function createRequestAuth(request: Request, env: Env, allowOperatorSignUp = false) {
  const origin = new URL(request.url).origin;
  return betterAuth({
    database: env.AUTH_DB,
    baseURL: origin,
    basePath: "/api/auth",
    secret: requireAuthSecret(),
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowOperatorSignUp,
      autoSignIn: false,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    telemetry: { enabled: false },
    logger: { level: "error" },
  });
}

export const sessionPolicy = {
  expiresIn: SESSION_EXPIRES_IN_SECONDS,
  updateAge: SESSION_UPDATE_AGE_SECONDS,
} as const;

