import { memberOr401 } from "@/lib/auth";
import { run } from "@/lib/db";
import { isSkin } from "@/lib/skins";

const HEX = /^#[0-9a-f]{6}$/i;
const httpsUrl = (s: unknown) => {
  if (typeof s !== "string" || !s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
};

// Profile customisation. Only the fields sent are changed.
export async function POST(req: Request) {
  const me = await memberOr401();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };

  if (typeof b.display_name === "string" && b.display_name.trim()) put("display_name", b.display_name.trim().slice(0, 40));
  if (typeof b.bio === "string") put("bio", b.bio.slice(0, 500));
  if (typeof b.pronouns === "string") put("pronouns", b.pronouns.slice(0, 24));
  if (typeof b.status_text === "string") put("status_text", b.status_text.slice(0, 80));
  if (typeof b.accent === "string" && HEX.test(b.accent)) put("accent", b.accent.toLowerCase());
  if ("banner_url" in b) put("banner_url", httpsUrl(b.banner_url));
  if ("avatar_url" in b && b.avatar_url) { const u = httpsUrl(b.avatar_url); if (u) put("avatar_url", u); }
  if (isSkin(b.theme)) put("theme", b.theme);
  if (typeof b.private_lists === "boolean") put("private_lists", b.private_lists ? 1 : 0);
  if (typeof b.hide_reading === "boolean") put("hide_reading", b.hide_reading ? 1 : 0);
  if (typeof b.hide_slogan === "boolean") put("hide_slogan", b.hide_slogan ? 1 : 0);
  if ("shh_label" in b) put("shh_label", typeof b.shh_label === "string" && b.shh_label.trim() ? b.shh_label.trim().slice(0, 24) : null);
  if (Array.isArray(b.showcase)) {
    const ids = [...new Set(b.showcase.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
    put("showcase", JSON.stringify(ids));
  }
  if (!sets.length) return Response.json({ error: "nothing to change" }, { status: 400 });
  await run(`update users set ${sets.join(", ")} where id = ?`, ...vals, me.id);
  return Response.json({ ok: true });
}
