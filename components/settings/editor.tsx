"use client";
import { Check, Crown, ImageIcon, Loader2, Lock, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { SKINS } from "@/lib/skins";
import { toast } from "@/lib/store";
import { cn } from "@/lib/utils";

const ACCENTS = ["#ff4f9a", "#e8679a", "#f28cb3", "#ef8a5c", "#e0a93a", "#4fbf9c", "#4aa6dd", "#6c8ae4", "#9479e8", "#c98aa4", "#ffffff", "#2a1420"];

interface Init {
  handle: string; display_name: string; avatar_url: string | null; banner_url: string | null; bio: string; pronouns: string;
  accent: string; theme: string; status_text: string; showcase: number[]; private_lists: boolean; is_plus: boolean;
}
interface Pick { mal_id: number; title: string; image: string | null }

export function ProfileEditor({ init, library }: { init: Init; library: Pick[] }) {
  const router = useRouter();
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const put = <K extends keyof Init>(k: K, v: Init[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: f.display_name, bio: f.bio, pronouns: f.pronouns, accent: f.accent, status_text: f.status_text, banner_url: f.banner_url || null, showcase: f.showcase, private_lists: f.private_lists, theme: f.theme }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn’t save, check the banner link");
    document.documentElement.dataset.skin = f.theme;
    document.cookie = `skin=${f.theme}; path=/; max-age=31536000; samesite=lax`;
    toast("Saved ✿");
    router.refresh();
  };

  const field = "w-full rounded-2xl border-1.5 border-line bg-paper px-4 text-[14px] font-semibold text-plum outline-none transition focus:border-frost-hot focus:shadow-halo";
  const label = "text-[12px] font-extrabold uppercase tracking-[.1em] text-plum-muted";
  const toggleShow = (id: number) => put("showcase", f.showcase.includes(id) ? f.showcase.filter((x) => x !== id) : f.showcase.length >= 4 ? f.showcase : [...f.showcase, id]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
      <div className="flex flex-col gap-5 rounded-box border-1.5 border-line bg-cream-card p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className={label}>Display name</span><input className={cn(field, "h-12")} maxLength={40} value={f.display_name} onChange={(e) => put("display_name", e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className={label}>Pronouns</span><input className={cn(field, "h-12")} maxLength={24} placeholder="she/her, they/them…" value={f.pronouns} onChange={(e) => put("pronouns", e.target.value)} /></label>
        </div>
        <label className="flex flex-col gap-1.5"><span className={label}>Status</span><input className={cn(field, "h-12")} maxLength={80} placeholder="rewatching bebop for the 4th time" value={f.status_text} onChange={(e) => put("status_text", e.target.value)} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>Bio <span className="normal-case tracking-normal text-plum-faint">· {f.bio.length}/500</span></span><textarea className={cn(field, "min-h-[110px] py-3")} maxLength={500} value={f.bio} onChange={(e) => put("bio", e.target.value)} placeholder="what you’re into, what you’re watching, who you are" /></label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Banner image link</span>
          <div className="relative"><ImageIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-plum-muted" /><input className={cn(field, "h-12 pl-11 pr-11")} placeholder="https://… (a wide image)" value={f.banner_url ?? ""} onChange={(e) => put("banner_url", e.target.value)} />
            {f.banner_url && <button type="button" aria-label="Remove banner" onClick={() => put("banner_url", null)} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full hover:bg-cream-tint"><X className="size-3.5" /></button>}
          </div>
        </label>

        <div className="flex flex-col gap-2">
          <span className={label}>Accent colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={f.accent === c} onClick={() => put("accent", c)}
                className="grid size-9 place-items-center rounded-full border-2 border-line transition hover:scale-110" style={{ background: c }}>
                {f.accent === c && <Check className="size-4 drop-shadow" color={c === "#ffffff" ? "#000" : "#fff"} strokeWidth={3} />}
              </button>
            ))}
            <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-line-hot" title="Pick any colour">
              <span className="text-[16px]">+</span>
              <input type="color" value={f.accent} onChange={(e) => put("accent", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Site skin</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SKINS.map((s) => (
              <button key={s.id} type="button" aria-pressed={f.theme === s.id} onClick={() => put("theme", s.id)}
                className={cn("flex items-center gap-2.5 rounded-2xl border-1.5 border-line bg-paper p-2 text-left text-[13px] font-extrabold hover:border-frost-hot", f.theme === s.id && "border-frost-hot shadow-halo")}>
                <span className="size-9 rounded-xl border border-line" style={{ background: `linear-gradient(135deg, ${s.swatch[0]} 50%, ${s.swatch[1]} 50%)` }} />{s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Showcase · pick up to 4 <span className="normal-case tracking-normal text-plum-faint">({f.showcase.length}/4)</span></span>
          {library.length === 0 ? <p className="text-[13px] text-plum-muted">Add shows to your box first, then pin your favourites here.</p> : (
            <div className="grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2 overflow-y-auto rounded-2xl bg-cream-tint p-2">
              {library.map((p) => {
                const at = f.showcase.indexOf(p.mal_id);
                return (
                  <button key={p.mal_id} type="button" onClick={() => toggleShow(p.mal_id)} title={p.title} aria-pressed={at >= 0} className={cn("relative rounded-xl transition", at >= 0 ? "ring-2 ring-frost-hot ring-offset-2 ring-offset-cream-tint" : "opacity-75 hover:opacity-100")}>
                    <Poster src={p.image} className="aspect-[2/3] rounded-xl" />
                    {at >= 0 && <span className="absolute left-1 top-1 grid size-6 place-items-center rounded-lg bg-frost-hot font-mono text-[12px] text-white">{at + 1}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border-1.5 border-line bg-paper px-4 py-3">
          <span><span className="flex items-center gap-1.5 text-[14px] font-extrabold"><Lock className="size-4" />Private lists</span><span className="text-[12.5px] font-semibold text-plum-muted">Others see your page, but not your box.</span></span>
          <input type="checkbox" checked={f.private_lists} onChange={(e) => put("private_lists", e.target.checked)} className="peer sr-only" />
          <span className="relative h-6 w-11 flex-none rounded-full bg-line transition peer-checked:bg-frost-hot after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-paper after:shadow after:transition-all peer-checked:after:left-[22px]" />
        </label>

        <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-full border-1.5 border-line bg-cream-card/90 py-2 pl-5 pr-2 shadow-shell backdrop-blur">
          <span className="text-[13px] font-bold text-plum-muted">{dirty ? "Unsaved changes" : "All saved"}</span>
          <div className="flex gap-2">
            {dirty && <button type="button" onClick={() => setF(init)} className="h-10 rounded-full px-4 text-[13px] font-bold text-plum-muted hover:text-plum">Reset</button>}
            <button type="button" onClick={save} disabled={!dirty || busy} className="flex h-10 items-center gap-2 rounded-full bg-frost px-5 text-[13.5px] font-extrabold text-frost-ink shadow-press disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />}Save</button>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-plum-faint">Your avatar and handle come from kuro, and update each time you sign in.</p>
      </div>

      {/* live preview */}
      <div className="lg:sticky lg:top-[100px]">
        <div className="eyebrow mb-2 px-1">Preview</div>
        <div className="overflow-hidden rounded-shell border-1.5 border-night-line bg-night text-night-text">
          <div className="relative h-[130px]" style={{ background: `linear-gradient(135deg, ${f.accent}, var(--night))` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.banner_url && /^https:\/\//.test(f.banner_url) && <img src={f.banner_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-night to-transparent" />
          </div>
          <div className="relative -mt-12 px-5 pb-5">
            <Avatar src={f.avatar_url} name={f.handle} size={84} ring={f.accent} className="border-4 border-night" />
            <div className="mt-2 flex items-center gap-1.5 text-[22px] font-extrabold tracking-tight">{f.display_name || f.handle}{f.is_plus && <Crown className="size-5 text-sprinkle-star" />}</div>
            <div className="text-[13px] font-semibold" style={{ color: f.accent }}>@{f.handle}{f.pronouns && <span className="text-night-muted"> · {f.pronouns}</span>}</div>
            {f.status_text && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${f.accent} 22%, transparent)`, color: f.accent }}><Sparkles className="size-3" />{f.status_text}</div>}
            {f.bio && <p className="mt-3 line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-night-muted">{f.bio}</p>}
            {f.showcase.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {f.showcase.map((id, i) => {
                  const p = library.find((x) => x.mal_id === id);
                  return <div key={id} className="relative"><Poster src={p?.image} className="aspect-[2/3] rounded-xl" /><span className="absolute left-1 top-1 grid size-5 place-items-center rounded-md font-mono text-[11px] text-white" style={{ background: f.accent }}>{i + 1}</span></div>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
