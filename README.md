# 一笺 · 诗意新标签页

**打开一页，遇见诗意。**

一笺是一个 Chrome 新标签页扩展，用古典诗词、古文和意境插画，为日常浏览留一点安静。支持在线诗词推荐、离线诗画、万年历、收藏，以及中英文界面。

[English](README.en.md) · [安装](#安装) · [开发](#开发) · [反馈与建议](https://github.com/stevendong/poetry-tab/issues)

![一笺中文新标签页](docs/images/newtab-zh.jpg)

## 功能

- **遇见诗文**：默认使用 poetry-service 诗画库推荐，也可切换今日诗词或自定义接口；关闭在线推荐或服务不可用时，从内置的 17 组诗画中按季节与时段选择。
- **自定义接口**：支持 poetry-service 推荐接口及通用 JSON GET 接口，可展示服务提供的句意、解读、图片和视频背景。
- **专属配图**：有对应插画的诗文显示插画，其余使用默认渐变背景。
- **展开阅读**：查看原文、句意或作品译文、意境解读及出处；在线内容未提供译文时会明确提示。
- **本地收藏**：喜欢的诗文保存在当前浏览器中，离线可读；收藏和设置在同一浏览器配置的标签页之间同步。
- **万年历**：点击右上角日期，查看 1900—2100 年的公历、农历、生肖与节气，支持年月切换和返回今天。
- **繁简中文与英文界面**：在「设置 → 界面语言」选择简体中文、繁體中文或 English，也可跟随浏览器。中文选项同时切换诗文、解读、收藏和万年历的繁简体，设置自动保存并同步到已打开的标签页；文字转换完全离线完成。
- **阅读偏好**：可调整所在半球、时钟、句意显示、字号及背景遮罩。

<details>
<summary>查看万年历截图</summary>

![万年历与农历说明](docs/images/calendar.jpg)

</details>

## 安装

安装扩展无需 Node.js，也无需构建。

1. [下载仓库 ZIP](https://github.com/stevendong/poetry-tab/archive/refs/heads/main.zip) 并解压，或使用 Git：

   ```sh
   git clone https://github.com/stevendong/poetry-tab.git
   ```

2. 在 Chrome 地址栏输入 `chrome://extensions`。
3. 打开右上角的「开发者模式」，点击「加载已解压的扩展程序」。
4. 选择仓库中的 **`extension/` 文件夹**。
5. 打开一个新标签页。

更新代码后，在扩展管理页点击「重新加载」，再打开新标签页。若页面仍显示其他新标签页扩展，请检查已启用的扩展。

若保存接口时提示扩展权限尚未更新，也需执行上述重新加载步骤。只刷新新标签页不会更新浏览器已加载的权限清单。

## 使用

| 操作                           | 功能                             |
| ------------------------------ | -------------------------------- |
| 「换一句」或主界面上的 `Space` | 切换诗文                         |
| 心形按钮                       | 收藏或取消收藏当前诗文           |
| 「读懂这一句」                 | 查看原文、解读和出处             |
| 收藏册按钮                     | 打开已保存的诗文                 |
| 右上角日期                     | 打开万年历                       |
| 设置按钮                       | 调整界面语言与阅读偏好           |
| `Esc`                          | 先关闭打开的下拉菜单，再关闭面板 |

在万年历中，可用方向键选择日期，`PageUp` / `PageDown` 切换月份，`Home` / `End` 移到当前周的首日或末日。

右上角仅在节气当天显示节气名称。日期与时钟使用本机时区，节气交接日期采用近似计算；离线四季以立春、立夏、立秋、立冬划分，南半球的季节相反。

默认连接 poetry-service 诗画库（`https://poetry-api.nabulalogic.com`），无需手动配置。也可在设置中切换今日诗词或填写自定义 JSON 地址，点击「保存接口并连接」；其他自定义站点需允许访问。已保存的来源选择会保留。poetry-service 可填写服务根地址或完整推荐接口；自定义 JSON 支持 `content`（或 `lines`）、`title`、`author`，可附带 `fullText`、`meaning`、`appreciation`、`imageUrl` 或 `videoUrl` + `posterUrl`。详细协议与验收记录以 [Notion 项目页面](https://www.notion.so/3f92dbec685c81fa87bbf6bf606e2844) 为准。

## 数据与隐私

- 扩展使用 `storage`，默认联网权限覆盖诗画库官方接口和今日诗词。其他自定义 HTTP/HTTPS 站点通过可选权限声明，在点击保存时按站点申请；不会在安装时要求所有网站访问权限。
- 在线推荐默认使用诗画库，会收到 IP、季节、时段、节气（北半球）、背景偏好及近期句子 ID。诗画库和自定义请求不发送 Cookie 或今日诗词标识；切换今日诗词后，其匿名客户端标识与缓存保存在本机。接口和媒体提供方按其政策处理请求。
- 关闭「在线诗词推荐」后，使用内置诗文，不再发起新的诗词 API 请求。
- 收藏和设置使用 `chrome.storage.local`，普通网页预览使用 `localStorage`，均不通过账号同步到其他浏览器。
- 内置插画和字体随扩展打包，万年历及收藏文字可离线使用；自定义图片和视频需要联网。扩展无需账号或定位权限。

## 开发

页面使用原生 HTML、CSS 和 JavaScript ES modules，扩展采用 Manifest V3。运行时没有 npm 依赖；开发与自动化测试需要 **Node.js 20+ 和 npm**，建议使用 [Node.js 当前 LTS 版本](https://nodejs.org/en/download)。

```sh
git clone https://github.com/stevendong/poetry-tab.git
cd poetry-tab
npm ci
npm run preview
```

预览默认监听 `http://127.0.0.1:4173/`，也可通过 `PORT` 指定端口，以终端输出为准。预览只使用离线诗文；完整的在线推荐和扩展后台行为需在 Chrome 中加载扩展体验。

| 命令                    | 用途                                           |
| ----------------------- | ---------------------------------------------- |
| `npm run preview`       | 启动本地网页预览，无需安装开发依赖             |
| `npm test`              | 运行时令、日历、语言、在线缓存与收藏的单元测试 |
| `npm run check`         | 检查扩展清单、本地资源、脚本与插画映射         |
| `npm run test:browser`  | 验证新标签页、离线模式、收藏和设置             |
| `npm run test:online`   | 验证在线推荐、缓存、失败回退和在线收藏         |
| `npm run test:custom` | 验证自定义接口授权、图片、视频、收藏和故障回退 |
| `npm run test:api-settings` | 验证旧权限清单提示、授权失败与接口设置保存 |
| `npm run test:calendar` | 验证日历、键盘操作与窄窗口布局                 |
| `npm run test:language` | 验证繁简体与英文切换、持久化、标签页同步和布局 |
| `npm run pack`          | 生成扩展 ZIP、解压目录及 SHA-256 校验文件      |

### 浏览器测试

测试使用 Playwright 和完整 Chromium。部分测试脚本保留了固定的浏览器路径，运行时请显式设置 `CHROME_PATH`。以下示例适用于 macOS / Linux：

```sh
npx playwright install chromium
export CHROME_PATH="$(node --input-type=module -e 'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath());')"
npm run test:browser
npm run test:online
npm run test:calendar
npm run test:language
```

Linux 如缺少系统依赖，可使用 `npx playwright install --with-deps chromium`。浏览器安装与扩展测试机制见 [Playwright 官方文档](https://playwright.dev/docs/chrome-extensions)。

`test:online` 默认使用模拟 API 响应。设置 `LIVE_API=1` 会额外验证真实服务，并产生网络请求：

```sh
LIVE_API=1 npm run test:online
```

`test:custom` 使用真实 Chrome 站点授权弹窗，需要 Linux 上的 Xvfb、xdotool、ImageMagick 和 FFmpeg；`LIVE_API=1 npm run test:custom` 额外检查线上 poetry-service 公开推荐与 CDN 图片。

截图和测试记录写入 `artifacts/`，该目录不纳入版本控制。

### 打包

```sh
npm run pack
```

输出位于 `dist/`：`poetry-tab/` 为可加载的扩展目录，`poetry-tab-v<version>.zip` 为压缩包，旁边的 `.sha256` 文件用于校验。`dist/` 不纳入版本控制，下载源码后需自行生成。

压缩包包含项目的 MIT 许可证、字体的 OFL 许可证，以及 OpenCC 转换代码与词典的 MIT / Apache-2.0 许可证。

### 项目结构

```text
extension/             扩展页面、后台和本地资源
  quotes.js            离线诗文、解读及出处
  online.js            在线推荐、缓存与收藏快照
  context.js           时令判断与离线选句
  calendar*.js         日历数据与交互
  i18n.js              繁简中文与英文界面、日期本地化
  chinese.js           诗文显示文字的本地繁简转换
  vendor/opencc/       OpenCC 转换代码、词典及许可证
  _locales/            Chrome 扩展名称与描述的本地化
  assets/              插画、字体及图标
scripts/               预览、检查与打包脚本
tests/                 单元测试与浏览器测试
docs/images/           README 界面截图
```

## 参与贡献

欢迎通过 [Issues](https://github.com/stevendong/poetry-tab/issues) 报告问题或提出建议，也欢迎提交 Pull Request。报告问题时请附上浏览器版本、操作系统、复现步骤和截图，并隐去个人信息。

提交改动前，请运行 `npm test` 和 `npm run check`；界面或交互改动还需运行对应的浏览器测试。新增诗文、译文或插画时，请保留出处与素材来源，并同步更新相关数据和测试。

## 内容来源与许可证

项目采用 [MIT License](LICENSE)，第三方字体、文本及在线服务内容保留各自的授权与使用条款。

| 内容               | 来源与说明                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 离线诗文原文       | 每条记录均附 [维基文库](https://zh.wikisource.org/) 出处，见 [`quotes.js`](extension/quotes.js)                                                                       |
| 离线句意与意境解读 | 项目编写                                                                                                                                                              |
| 在线诗文与作品译文 | [今日诗词](https://www.jinrishici.com/)，由其 API 提供                                                                                                                |
| 默认在线诗画与解读 | poetry-service 诗画库，使用 `https://poetry-api.nabulalogic.com` 推荐接口 |
| 繁简体转换         | [OpenCC JavaScript](https://github.com/nk2028/opencc-js) 1.4.2，代码与词典随扩展打包；[来源与许可证](extension/vendor/opencc/README.md) |
| 意境插画           | AI 辅助生成；提示词与生成记录见 [`prompts.json`](extension/assets/art/prompts.json)                                                                                   |
| 诗文字体           | Noto Serif SC，本地子集字体；遵循 [SIL Open Font License 1.1](extension/assets/fonts/OFL.txt)，来源记录见 [`provenance.json`](extension/assets/fonts/provenance.json) |
| 英文节气名称       | 参考[香港天文台](https://www.hko.gov.hk/en/gts/time/24solarterms.htm)                                                                                                 |
