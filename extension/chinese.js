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
  return simplified(text);
}
