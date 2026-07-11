// Custom inline-SVG icon set replacing emoji throughout the DOM UI. Emoji
// render inconsistently across machines (some Windows setups without full
// color-emoji font coverage show blank "tofu" boxes) — an external icon CDN
// would trade that failure mode for a worse one (network/firewall
// dependent, on a project that has otherwise never depended on external
// assets). Hand-drawn, inline, zero network calls, same look everywhere.

export type IconName =
  | "hider"
  | "seeker"
  | "search"
  | "lightbulb"
  | "bell"
  | "run"
  | "check"
  | "blocked"
  | "x"
  | "speaker-on"
  | "speaker-off"
  | "crown"
  | "ghost"
  | "keyboard"
  | "target"
  | "medal"
  | "party"
  | "door"
  | "key"
  | "star"
  | "clock"
  | "hourglass"
  | "chevron-left"
  | "chevron-right"
  | "play"
  | "laugh"
  | "scared"
  | "eyes"
  | "heart";

const PATHS: Record<IconName, string> = {
  hider: `<circle cx="9" cy="9.5" r="5.2" fill="currentColor"/><rect x="9.5" y="12" width="11" height="8.5" rx="1.5" fill="currentColor" opacity="0.28"/><circle cx="7.3" cy="8.6" r="1" fill="var(--icon-ink,#0a0f1c)"/>`,
  seeker: `<path d="M2 12s4-7.5 10-7.5S22 12 22 12s-4 7.5-10 7.5S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>`,
  search: `<circle cx="10.3" cy="10.3" r="6.3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  lightbulb: `<path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.3h5.4v-.3c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.3 18h5.4M10.2 21h3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  bell: `<path d="M6 10a6 6 0 0 1 12 0c0 4.8 1.8 6 1.8 6H4.2S6 14.8 6 10Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  run: `<path d="M4 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  check: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M7.7 12.3l2.7 2.7L16.4 9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  blocked: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  x: `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M8.3 8.3l7.4 7.4M15.7 8.3l-7.4 7.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  "speaker-on": `<path d="M4 10v4h3.2l4.8 3.8V6.2L7.2 10H4Z" fill="currentColor"/><path d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a8 8 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  "speaker-off": `<path d="M4 10v4h3.2l4.8 3.8V6.2L7.2 10H4Z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  crown: `<path d="M3 8.5l4 2.8L12 4l5 7.3 4-2.8L19.5 18h-15L3 8.5Z" fill="currentColor"/>`,
  ghost: `<path d="M12 3a7 7 0 0 0-7 7v9.5l2.3-2 2 2 2.2-2.3 2.5 2.3 2-2 2.3 2V10a7 7 0 0 0-7-7Z" fill="currentColor"/><circle cx="9.4" cy="10.6" r="1.15" fill="var(--icon-ink,#0a0f1c)"/><circle cx="14.6" cy="10.6" r="1.15" fill="var(--icon-ink,#0a0f1c)"/>`,
  keyboard: `<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6.5 14h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  target: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>`,
  medal: `<path d="M8 2l4 5.2 4-5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12" cy="14" r="7.2" fill="currentColor"/><circle cx="12" cy="14" r="7.2" fill="none" stroke="var(--icon-ink,#0a0f1c)" stroke-width="1" opacity="0.25"/>`,
  party: `<path d="M4 20l3-9 12-6-3.5 12.5L4 20Z" fill="currentColor"/><circle cx="18" cy="5" r="1.3" fill="currentColor"/><circle cx="20.5" cy="9" r="1" fill="currentColor"/><circle cx="15.5" cy="3" r="1" fill="currentColor"/>`,
  door: `<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h6L18 6.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 21h12M9.6 13.2v1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  key: `<circle cx="7.5" cy="14.5" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.8 11.6L20 2.4M17 5.4l2.2 2.2M13.8 8.6l2.2 2.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  star: `<path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6l-6.1 3.4 1.5-6.8L2.2 9.5l6.9-.7L12 2.5Z" fill="currentColor"/>`,
  clock: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.5l4 2.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  hourglass: `<path d="M6 3h12M6 21h12M7 3c0 5 4 6 5 9-1 3-5 4-5 9M17 3c0 5-4 6-5 9 1 3 5 4 5 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  "chevron-left": `<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  "chevron-right": `<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  play: `<path d="M6 4l14 8-14 8V4Z" fill="currentColor"/>`,
  laugh: `<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 9.5c1-1.2 3-1.2 4 0M13.5 9.5c1-1.2 3-1.2 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.5 14.3c1.5 2.6 7.5 2.6 9 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  scared: `<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/><circle cx="8.3" cy="10" r="1.6" fill="currentColor"/><circle cx="15.7" cy="10" r="1.6" fill="currentColor"/><ellipse cx="12" cy="16" rx="2.2" ry="3" fill="currentColor"/>`,
  eyes: `<circle cx="7.6" cy="12" r="5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/><circle cx="16.4" cy="12" r="5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/><circle cx="8.6" cy="12" r="1.8" fill="currentColor"/><circle cx="17.4" cy="12" r="1.8" fill="currentColor"/>`,
  heart: `<path d="M12 20.5s-7.5-4.6-9.7-9.3C.6 7.7 2.6 4 6.3 4c2.1 0 3.7 1.1 4.7 2.7C12 5.1 13.6 4 15.7 4c3.7 0 5.7 3.7 4 7.2C19.5 15.9 12 20.5 12 20.5Z" fill="currentColor"/>`,
};

// The 4 quick-emote reactions, in button order — shared between the DOM
// button icons here and the matching Canvas2D world-space sprite textures
// in proceduralTextures.ts (same names, two renderers).
export type EmoteIconName = "laugh" | "scared" | "eyes" | "heart";
export const EMOTE_ICON_NAMES: EmoteIconName[] = ["laugh", "scared", "eyes", "heart"];

// Returns inline SVG markup — embed directly in a template string, no
// network request, renders identically regardless of the OS's emoji font
// support. `color` defaults to `currentColor` (inherits CSS `color`).
export function icon(name: IconName, opts: { size?: number; color?: string } = {}): string {
  const size = opts.size ?? 20;
  const style = opts.color ? `color:${opts.color};` : "";
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:inline-block;vertical-align:middle;${style}" aria-hidden="true">${PATHS[name]}</svg>`;
}

// HUD strings now assemble via innerHTML (to embed icon() markup), and some
// of those strings interpolate player-chosen nicknames — escape them so a
// nickname like "<img onerror=...>" can't inject markup into another
// player's browser.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
