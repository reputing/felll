// Language names for the three-letter codes OpenSubtitles uses (Stremio's subtitle addon passes them through).
export const LANG: Record<string, string> = {
  eng: "English", spa: "Spanish", fre: "French", fra: "French", por: "Portuguese", pob: "Portuguese (Brazil)", rus: "Russian", chi: "Chinese", zho: "Chinese", zht: "Chinese (Traditional)", zhc: "Chinese",
  ara: "Arabic", ger: "German", deu: "German", ita: "Italian", jpn: "Japanese", kor: "Korean", tur: "Turkish", pol: "Polish", dut: "Dutch", nld: "Dutch", swe: "Swedish", nor: "Norwegian",
  dan: "Danish", fin: "Finnish", ell: "Greek", gre: "Greek", heb: "Hebrew", hun: "Hungarian", cze: "Czech", ces: "Czech", ron: "Romanian", rum: "Romanian", bul: "Bulgarian", hrv: "Croatian",
  srp: "Serbian", slv: "Slovenian", slo: "Slovak", slk: "Slovak", ukr: "Ukrainian", vie: "Vietnamese", ind: "Indonesian", tha: "Thai", hin: "Hindi", per: "Persian", fas: "Persian",
  est: "Estonian", lav: "Latvian", lit: "Lithuanian", may: "Malay", msa: "Malay", cat: "Catalan", ice: "Icelandic", isl: "Icelandic", ben: "Bengali", tgl: "Filipino", mkd: "Macedonian",
  alb: "Albanian", sqi: "Albanian", bos: "Bosnian", geo: "Georgian", kat: "Georgian", urd: "Urdu", tam: "Tamil", tel: "Telugu", mal: "Malayalam", sin: "Sinhala", nep: "Nepali",
};
export const langName = (code: string) => LANG[code] ?? code.toUpperCase();
