# 一笺 · 诗意新标签页

打开 Chrome 新标签页，遇见适合当下时令的诗词或古文，以及对应的 AI 意境插画。优先展示今日诗词在线推荐，内置 17 组诗画作为离线兜底。

右上角仅在节气当天显示节气名称。点击日期可打开万年历，查看 1900—2100 年的公历、农历、生肖与节气，支持切换年月、返回今天及方向键选择日期。日历离线可用，日期使用本机时区，节气日期采用太阳黄经近似计算。

支持中文和英文界面，默认跟随浏览器语言（中文浏览器显示中文，其他语言显示英文）。可在设置的「界面语言」中选择中文或 English，偏好保存在本机并在标签页之间同步。诗文原文与解读保留中文；英文界面提供英文日期、农历说明、节气名称、设置及操作提示。

设计、安装说明、内容来源与验收记录以 [Notion 项目页面](https://www.notion.so/3f92dbec685c81fa87bbf6bf606e2844) 为准。

本地安装：打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择本项目的 `extension` 文件夹。也可以解压 `dist/poetry-tab-v0.2.0.zip` 后加载。

开发命令：`npm ci`、`npm test`、`npm run check`、`npm run test:browser`、`npm run test:calendar`、`npm run test:language`、`npm run test:online`、`npm run pack`。`npm run preview` 提供本机预览（无需开发依赖），扩展安装本身无需 Node.js。

运行时由扩展后台访问今日诗词官方 API，并使用本地文件和 `chrome.storage.local`。可在设置中关闭在线推荐。诗句为古典原文，解释由项目编写，离线逐句插画由内置 imagegen 工具生成，在线诗句仅在与内置诗句对应时使用专属配图，其余显示默认渐变背景；提示词记录在 `extension/assets/art/prompts.json`。

源码仓库：[stevendong/poetry-tab](https://github.com/stevendong/poetry-tab)。
