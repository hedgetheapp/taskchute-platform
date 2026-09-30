import { APIError, createAuthEndpoint, formCsrfMiddleware, sensitiveSessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const GRANT_LIFETIME_MS = 120_000;
const IDENTIFIER_PREFIX = "wear-pairing:";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  request_id: z.string().regex(UUID_V4),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const exchangeSchema = requestSchema.extend({
  grant: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

type PairingGrantValue = {
  subject_id: string;
  request_id: string;
  nonce_digest: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(result, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseGrantValue(raw: string): PairingGrantValue | null {
  try {
    const value = JSON.parse(raw) as Partial<PairingGrantValue>;
    if (typeof value.subject_id !== "string" || value.subject_id.length < 1
      || typeof value.request_id !== "string" || !UUID_V4.test(value.request_id)
      || typeof value.nonce_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.nonce_digest)) return null;
    return value as PairingGrantValue;
  } catch {
    return null;
  }
}

function invalidGrant(): never {
  throw new APIError("UNAUTHORIZED", { message: "Pairing grant is invalid or expired" });
}

export const wearPairingPlugin = {
  id: "taskchute-wear-pairing",
  endpoints: {
    createWearPairingGrant: createAuthEndpoint("/wear/pairing-grant", {
      method: "POST",
      requireHeaders: true,
      body: requestSchema,
      use: [formCsrfMiddleware, sensitiveSessionMiddleware],
      metadata: { noStore: true },
    }, async (ctx) => {
      const nonceBytes = decodeBase64Url(ctx.body.nonce);
      if (!nonceBytes || nonceBytes.length !== 32 || base64Url(nonceBytes) !== ctx.body.nonce) {
        throw new APIError("BAD_REQUEST", { message: "Invalid pairing request" });
      }

      const grant = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const grantDigest = await digest(grant);
      const nonceDigest = await digest(ctx.body.nonce);
      const expiresAt = new Date(Date.now() + GRANT_LIFETIME_MS);
      const identifier = `${IDENTIFIER_PREFIX}${grantDigest}`;

      const reserved = await ctx.context.internalAdapter.reserveVerificationValue({
        identifier,
        value: JSON.stringify({
          subject_id: ctx.context.session.user.id,
          request_id: ctx.body.request_id,
          nonce_digest: nonceDigest,
        } satisfies PairingGrantValue),
        expiresAt,
      });
      if (!reserved) throw new APIError("TOO_MANY_REQUESTS", { message: "Pairing request could not be issued" });

      return ctx.json({ grant, expires_at: expiresAt.toISOString() });
    }),

    exchangeWearPairingGrant: createAuthEndpoint("/wear/pairing-exchange", {
      method: "POST",
      requireHeaders: true,
      body: exchangeSchema,
      metadata: { noStore: true },
    }, async (ctx) => {
      const nonceBytes = decodeBase64Url(ctx.body.nonce);
      const grantBytes = decodeBase64Url(ctx.body.grant);
      if (!nonceBytes || nonceBytes.length !== 32 || base64Url(nonceBytes) !== ctx.body.nonce
        || !grantBytes || grantBytes.length !== 32 || base64Url(grantBytes) !== ctx.body.grant) invalidGrant();

      const identifier = `${IDENTIFIER_PREFIX}${await digest(ctx.body.grant)}`;
      const candidate = await ctx.context.internalAdapter.findVerificationValue(identifier);
      if (!candidate || new Date(candidate.expiresAt).getTime() <= Date.now()) invalidGrant();

      const candidateValue = parseGrantValue(candidate.value);
      const nonceDigest = await digest(ctx.body.nonce);
      if (!candidateValue || candidateValue.request_id !== ctx.body.request_id
        || candidateValue.nonce_digest !== nonceDigest) invalidGrant();

      // Better Auth 1.7.1 implements this through a single D1 DELETE..RETURNING.
      // Only the winner may create a session; a losing concurrent exchange is inert.
      const consumed = await ctx.context.internalAdapter.consumeVerificationValue(identifier);
      if (!consumed) invalidGrant();
      const consumedValue = parseGrantValue(consumed.value);
      if (!consumedValue || consumedValue.subject_id !== candidateValue.subject_id
        || consumedValue.request_id !== ctx.body.request_id
        || consumedValue.nonce_digest !== nonceDigest) invalidGrant();

      const user = await ctx.context.internalAdapter.findUserById(consumedValue.subject_id);
      if (!user) invalidGrant();
      const session = await ctx.context.internalAdapter.createSession(user.id);
      if (!session) invalidGrant();
      await setSessionCookie(ctx, { session, user });
      return ctx.json({ ok: true });
    }),
  },
  rateLimit: [{
    pathMatcher: (path: string) => path.startsWith("/wear/pairing-"),
    window: 60,
    max: 10,
  }],
};
