// Reading the text in a picture with no model at all: OCR.space's public demo key. It is the last resort
// for a model that can't see images (Inception) or when every image reader is down: the words in the
// picture still reach the chat, as text. It only reads text (no shapes, scenes or faces), is rate
// limited, and takes pictures up to about 1 MB, so it is tried once per image and never relied on.
const KEY = "helloworld"; // OCR.space's own published demo key

const notes = new WeakMap<object, string>(); // an image part -> the text read from it

/** the text read from this image part, if OCR has run on it */
export const ocrNoteFor = (part: object): string | undefined => notes.get(part);

export async function ocrImage(f: typeof fetch, dataUrl: string, timeoutMs = 12_000): Promise<string | null> {
  if (!/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(dataUrl) || dataUrl.length > 1_300_000) return null;
  try {
    const form = new URLSearchParams({ apikey: KEY, base64Image: dataUrl, language: "eng", OCREngine: "2", scale: "true" });
    const res = await f("https://api.ocr.space/parse/image", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ParsedResults?: { ParsedText?: string }[]; IsErroredOnProcessing?: boolean };
    if (j.IsErroredOnProcessing) return null;
    const text = (j.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").replace(/\r/g, "").trim();
    return text || null;
  } catch { return null; }
}

/** Run OCR on the images in the latest user message (at most 3) and remember the result per image,
 *  so a text-only model can be given the words instead of just being told an image existed. */
export async function readImagesWithOcr(f: typeof fetch, messages: any[]): Promise<void> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (!Array.isArray(m.content)) return;
    const parts = m.content.filter((p: any) => p?.type === "image_url" && typeof p?.image_url?.url === "string" && !notes.has(p)).slice(0, 3);
    await Promise.all(parts.map(async (p: any) => { const t = await ocrImage(f, p.image_url.url); if (t) notes.set(p, t.slice(0, 6000)); }));
    return;
  }
}
