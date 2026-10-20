import { Converter } from "./vendor/opencc/opencc.js";

let traditional;
let simplified;

// Convert only display text. Keep original poems and favorite snapshots intact.
export function toTraditional(text) {
  traditional ||= Converter({ from: "cn", to: "tw" });
  return traditional(text);
}

export function toSimplified(text) {
  simplified ||= Converter({ from: "tw", to: "cn" });
  return simplified(text).replace(/[\u{10000}-\u{10FFFF}]/gu, (character) => {
    if (text.includes(character)) return character;
    // Keep the source form when conversion introduces an extension character
    // (e.g. 巘 → 𪩘) missing from installed Kai/Song fonts.
    const original = toTraditional(character);
    return original.length === 1 && text.includes(original) ? original : character;
  });
}
