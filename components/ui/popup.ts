// One look for everything that floats: menus, selects, dialogs, the palette,
// tooltips. Change it here and every popup follows the active skin.
export const POPUP =
  "z-50 rounded-3xl border-1.5 border-line bg-cream-card/95 p-2 text-plum shadow-shell backdrop-blur-xl outline-none " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95";

export const POPUP_ITEM =
  "flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 text-[13.5px] font-semibold outline-none " +
  "data-[highlighted]:bg-cream-blush data-[highlighted]:text-frost-deep data-[disabled]:opacity-50";

export const POPUP_LABEL = "eyebrow px-3 pb-2 pt-2";
export const POPUP_SEPARATOR = "mx-2 my-1.5 h-[1.5px] bg-line-soft";
export const OVERLAY = "fixed inset-0 z-50 bg-night/45 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";
