/**
 * CORS for mobile clients (Expo / mobile web-preview) calling the web API
 * from a different origin. Web browser login uses same-origin NextAuth cookies;
 * mobile uses /api/mobile/auth/* JSON endpoints instead.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export function isMobileClientOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (origin.includes(".e2b.app")) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (origin.startsWith("exp://")) return true;
  return false;
}

export function applyMobileApiCors(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : null;
  if (isMobileClientOrigin(origin) && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Cookie, X-Requested-With, Accept, Origin",
  );
  res.setHeader("Access-Control-Expose-Headers", "Set-Cookie");
}

/** Returns true when the preflight was handled (caller should return). */
export function handleMobileApiCorsPreflight(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  applyMobileApiCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
