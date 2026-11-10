// The music catalog, through kuro. kuro's player (its dashboard and desktop) searches the Evi partner
// catalog; that partnership is keyed, and the key is kuro's secret. cupcake does not hold it and does not
// need to: kuro's own /api/evi route answers search, lyrics and a fresh signed stream link, so this just
// asks kuro. The service binding is tried first (it forwards the listener's address, so kuro's
// per-address limit counts each listener, not all of cupcake as one), then the public address.
import { env } from "./db";
import { kuroConfig } from "./kuro";

export async function eviCall(req: Request, qs: URLSearchParams, manual = false): Promise<Response | null> {
  const e = await env();
  const c = await kuroConfig();
  const url = `${c.url}/api/evi?${qs}`;
  const ip = req.headers.get("cf-connecting-ip") || "";
  const init = (extra: Record<string, string> = {}): RequestInit => ({ headers: { accept: "application/json", ...extra }, redirect: manual ? "manual" : "follow", signal: AbortSignal.timeout(12_000) });
  const usable = (r: Response) => r.status < 500 && r.status !== 401 && r.status !== 403;
  if (e.KURO) {
    try {
      const r = await e.KURO.fetch(new Request(url, init(ip ? { "cf-connecting-ip": ip } : {})));
      if (usable(r)) return r;
    } catch { /* fall through to the public address */ }
  }
  try {
    const r = await fetch(url, init());
    return r;
  } catch { return null; }
}
