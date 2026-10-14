import { storage } from "./storage.js";
import { createStateController } from "./state.js";

const controller = createStateController(storage);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  controller.handle(message).then(
    (data) => respond({ data }),
    () => respond({ error: "本地数据暂时无法读取或保存" }),
  );
  return true;
});
