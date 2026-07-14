// Persisted UI language, same localStorage-preference pattern as the
// sound on/off toggle — most players are Thai-speaking and the recent
// "Office Chaos" pass left a lot of gameplay text English-only, which is
// exactly what this toggle is for.
export type Lang = "th" | "en";
const KEY = "hns_lang";

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // localStorage unavailable (private mode etc.) — toggle just won't stick
  }
}
