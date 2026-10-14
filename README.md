# 一笺 · 诗意新标签页

打开 Chrome 新标签页，遇见适合当下时令的诗词或古文，以及对应的 AI 意境插画。优先展示今日诗词在线推荐，内置 17 组诗画作为离线兜底。

右上角仅在节气当天显示节气名称。点击日期可打开万年历，查看 1900—2100 年的公历、农历、生肖与节气，支持切换年月、返回今天及方向键选择日期。日历离线可用，日期使用本机时区，节气日期采用太阳黄经近似计算。

设计、安装说明、内容来源与验收记录以 [Notion 项目页面](https://www.notion.so/3f92dbec685c81fa87bbf6bf606e2844) 为准。

商品文案、隐私政策、审核说明、商店图片与安装包见 [Notion 上架材料子页面](https://www.notion.so/3f92dbec685c81e28dd1f8d2f4fb4e4e)。运行 `npm run pack` 后，可用 `node scripts/store-materials.mjs` 从真实扩展生成商店图片；需要 Chrome for Testing 和可访问的今日诗词 API，可通过 `CHROME_PATH` 指定浏览器。

本地安装：打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择本项目的 `extension` 文件夹。也可以解压 `dist/poetry-tab-v0.2.1.zip` 后加载。

开发命令：`npm ci`、`npm test`、`npm run check`、`npm run test:browser`、`npm run test:calendar`、`npm run test:online`、`npm run pack`。`npm run preview` 提供本机预览（无需开发依赖），扩展安装本身无需 Node.js。

运行时由扩展后台访问今日诗词官方 API，并使用本地文件和 `chrome.storage.local`。可在设置中关闭在线推荐。诗句为古典原文，解释由项目编写，离线逐句插画由内置 imagegen 工具生成，新增在线诗句使用意象或时令匹配的已有配图；提示词记录在 `extension/assets/art/prompts.json`。

源码仓库：[stevendong/poetry-tab](https://github.com/stevendong/poetry-tab)。
