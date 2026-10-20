// API lines may already end with punctuation, including a closing quotation mark.
const punctuated = /[，。！？；：、,.!?;:…—][”’」』）】》〉"')\]]*$/u;

export function joinVerse(lines) {
  return lines.reduce((text, line) => {
    const next = line.trim();
    if (!next) return text;
    return text + (text && !punctuated.test(text) ? "，" : "") + next;
  }, "");
}

export function formatVerse(quote, complete = false) {
  const text = quote.content?.trim() || joinVerse(quote.lines);
  return text + (complete && text && !punctuated.test(text) ? "。" : "");
}
