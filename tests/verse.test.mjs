import test from "node:test";
import assert from "node:assert/strict";
import { formatVerse } from "../extension/verse.js";
import { normalizeCustom, restoreCustom } from "../extension/custom.js";
import { normalizeOnline } from "../extension/online.js";

const settings = { provider: "service", serviceUrl: "https://poetry.example" };
const poem = {
  id: "zeng-hua-qing",
  lines: ["锦城丝管日纷纷，", "半入江风半入云。"],
  title: "赠花卿",
  author: "杜甫",
  fullText: "锦城丝管日纷纷，\n半入江风半入云。\n此曲祇应天上有，\n人间能得几回闻。",
  status: "published",
  ready: true,
};

test("service punctuation survives normalization and cached favorite restoration without duplication", () => {
  const quote = normalizeCustom({ quote: poem }, settings);
  const expected = "锦城丝管日纷纷，半入江风半入云。";
  assert.equal(quote.content, expected);
  for (const value of [quote, restoreCustom({ ...quote, content: "旧的重复标点，，。。" })]) {
    assert.equal(formatVerse(value), expected);
    assert.equal(formatVerse(value, true), expected);
  }
});

test("unpunctuated and mixed lines receive only missing separators and a reading terminator", () => {
  for (const lines of [
    ["锦城丝管日纷纷", "半入江风半入云"],
    ["锦城丝管日纷纷，", "半入江风半入云"],
    [" 锦城丝管日纷纷， ", "", " 半入江风半入云 "],
  ]) {
    assert.equal(formatVerse({ lines }), "锦城丝管日纷纷，半入江风半入云");
    assert.equal(formatVerse({ lines }, true), "锦城丝管日纷纷，半入江风半入云。");
  }
});

test("existing question marks, exclamations, ellipses and closing quotes are preserved", () => {
  for (const ending of ["？", "！", "……", "。”", "？』", "?", "!"]) {
    const quote = { lines: ["诗句" + ending, "下句" + ending] };
    assert.equal(formatVerse(quote, true), quote.lines.join(""));
  }
});

test("online reading uses the original content punctuation", () => {
  const content = "晚来天欲雪，能饮一杯无？";
  const quote = normalizeOnline({
    status: "success",
    data: {
      id: "question",
      content,
      origin: { title: "问刘十九", author: "白居易", content: [content] },
    },
  });
  assert.equal(formatVerse(quote, true), content);
});
