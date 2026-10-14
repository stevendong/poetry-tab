# 一笺 · 诗意新标签页

打开 Chrome 新标签页，遇见适合当下时令的诗词或古文，以及对应的 AI 意境插画。内置 17 组内容，离线可用。

设计、安装说明、内容来源与验收记录以 [Notion 项目页面](https://www.notion.so/3f92dbec685c81fa87bbf6bf606e2844) 为准。

本地安装：打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择本项目的 `extension` 文件夹。也可以解压 `dist/poetry-tab-v0.1.0.zip` 后加载。

开发命令：`npm ci`、`npm test`、`npm run check`、`npm run test:browser`、`npm run pack`。`npm run preview` 提供本机预览（无需开发依赖），扩展安装本身无需 Node.js。

运行时仅使用本地文件和 `chrome.storage.local`。诗句为古典原文，解释由项目编写，逐句插画由内置 imagegen 工具生成；提示词记录在 `extension/assets/art/prompts.json`。

源码仓库：[stevendong/poetry-tab](https://github.com/stevendong/poetry-tab)。
