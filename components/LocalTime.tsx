"use client";

import { useEffect, useState } from "react";

/** Renders a timestamp in the viewer's time zone (UTC until hydrated). */
export function LocalTime({ iso, options }: { iso: string; options: Intl.DateTimeFormatOptions }) {
  const [text, setText] = useState(() =>
    new Date(iso).toLocaleString("en-US", { ...options, timeZone: "UTC" }),
  );
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, options)), [iso, options]);
  return <time dateTime={iso}>{text}</time>;
}
