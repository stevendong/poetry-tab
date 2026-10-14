# Yijian · Poetry New Tab

**A moment of poetry.**

Yijian is a Chrome new tab extension that brings classical Chinese poetry, prose, and illustrations into everyday browsing. It includes online recommendations, an offline collection, a lunar calendar, local favorites, and Chinese and English interfaces.

[简体中文](README.md) · [Installation](#installation) · [Development](#development) · [Issues](https://github.com/stevendong/poetry-tab/issues)

![Yijian English interface](docs/images/newtab-en.jpg)

## Features

- **Poems for the moment:** Jinrishici provides online recommendations. When online recommendations are disabled or unavailable, the extension selects from 17 built-in poems and illustrations using the season and time of day.
- **Dedicated illustrations:** Poems with matching artwork display it. Other poems use a default gradient background.
- **Read further:** Open the original text, explanation or translation, commentary, and source. Missing online translations are clearly indicated.
- **Local favorites:** Saved poems remain readable offline. Favorites and preferences sync between tabs in the same browser profile.
- **Calendar:** Click the date to browse Gregorian and Chinese lunar dates, zodiac years, and solar terms from 1900 to 2100.
- **Chinese and English UI:** Follow the browser language or choose a language in settings. Poems and commentary remain in Chinese.
- **Reading preferences:** Choose your hemisphere, clock visibility, explanation display, text size, and background shade.

<details>
<summary>Calendar preview (Chinese interface)</summary>

![Calendar with Chinese lunar dates](docs/images/calendar.jpg)

</details>

## Installation

Installing the extension requires neither Node.js nor a build step.

1. [Download the repository ZIP](https://github.com/stevendong/poetry-tab/archive/refs/heads/main.zip) and extract it, or clone the repository:

   ```sh
   git clone https://github.com/stevendong/poetry-tab.git
   ```

2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the repository's **`extension/` directory**.
5. Open a new tab.

After updating the code, reload the extension on the extensions page and open a new tab. If another new tab extension appears, check your enabled extensions.

## Usage

| Action                                    | Result                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| Another poem, or `Space` on the main page | Select another poem                                   |
| Heart button                              | Save or remove the current poem                       |
| Read this poem                            | Open the original text, commentary, and source        |
| Favorites button                          | Browse saved poems                                    |
| Date in the upper right                   | Open the calendar                                     |
| Settings button                           | Change the interface language and reading preferences |
| `Esc`                                     | Close an open dropdown first, then the panel          |

In the calendar, use the arrow keys to select dates, `PageUp` / `PageDown` to change months, and `Home` / `End` to move to the first or last day of the week.

The header shows a solar term only on its date. Dates and the clock follow your local time zone. Solar term dates are approximate. Offline seasons begin at the traditional solar terms for spring, summer, autumn, and winter, and reverse in the Southern Hemisphere.

## Data and privacy

- The extension requests only the `storage` permission and host access to `https://v2.jinrishici.com/*`.
- Online recommendations are enabled by default. Requests go to Jinrishici, which can receive your IP address and other network information. The anonymous client identifier and recent recommendation cache are stored locally.
- Turning online recommendations off uses the built-in collection and stops new poem API requests.
- Favorites and settings use `chrome.storage.local`; the web preview uses `localStorage`. They do not sync to other browsers through an account.
- Fonts and artwork are bundled, and the calendar works offline. No account or location permission is required.

## Development

The extension uses plain HTML, CSS, JavaScript ES modules, and Manifest V3. It has no npm runtime dependencies. Development and automated tests require **Node.js 20+ and npm**; use a [current Node.js LTS release](https://nodejs.org/en/download).

```sh
git clone https://github.com/stevendong/poetry-tab.git
cd poetry-tab
npm ci
npm run preview
```

The preview listens on `http://127.0.0.1:4173/` by default. Set `PORT` to choose another port, and use the URL printed in the terminal. The preview uses offline poems; load the extension in Chrome to exercise online recommendations and the extension background worker.

| Command                 | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm run preview`       | Start the local preview; no development dependencies needed                |
| `npm test`              | Unit tests for seasons, calendar, language, online caching, and favorites  |
| `npm run check`         | Validate the manifest, local resources, scripts, and illustration mappings |
| `npm run test:browser`  | Test the new tab page, offline mode, favorites, and settings               |
| `npm run test:online`   | Test online recommendations, caching, fallback, and saved online poems     |
| `npm run test:calendar` | Test calendar interaction, keyboard controls, and narrow layouts           |
| `npm run test:language` | Test language switching, persistence, tab sync, and English layouts        |
| `npm run pack`          | Create the extension ZIP, unpacked directory, and SHA-256 checksum         |

### Browser tests

Tests use Playwright with full Chromium. Some test scripts still have a fixed browser path, so set `CHROME_PATH` explicitly. The following example is for macOS / Linux:

```sh
npx playwright install chromium
export CHROME_PATH="$(node --input-type=module -e 'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath());')"
npm run test:browser
npm run test:online
npm run test:calendar
npm run test:language
```

On Linux, use `npx playwright install --with-deps chromium` if system dependencies are missing. See the [Playwright extension testing documentation](https://playwright.dev/docs/chrome-extensions) for browser setup and extension loading.

`test:online` uses simulated API responses by default. Set `LIVE_API=1` to additionally check the real service, which makes network requests:

```sh
LIVE_API=1 npm run test:online
```

Screenshots and test reports are written to `artifacts/`, which is excluded from version control.

### Packaging

```sh
npm run pack
```

Output goes to `dist/`: `poetry-tab/` is the loadable extension directory, `poetry-tab-v<version>.zip` is the archive, and the adjacent `.sha256` file contains its checksum. The `dist/` directory is excluded from version control; generate it after downloading the source.

The archive includes the project's MIT license and the font's OFL license.

### Project structure

```text
extension/             Extension pages, worker, and local assets
  quotes.js            Offline poems, commentary, and sources
  online.js            Online recommendations, cache, and saved snapshots
  context.js           Seasons and offline poem selection
  calendar*.js         Calendar data and interaction
  i18n.js              Chinese and English UI messages
  _locales/            Localized Chrome extension name and description
  assets/              Illustrations, fonts, and icons
scripts/               Preview, validation, and packaging
tests/                 Unit and browser tests
docs/images/           README screenshots
```

## Contributing

Report bugs and suggest improvements through [Issues](https://github.com/stevendong/poetry-tab/issues), or open a pull request. Include the browser version, operating system, reproduction steps, and screenshots, with personal information removed.

Run `npm test` and `npm run check` before submitting a change. For interface or interaction changes, also run the relevant browser tests. Preserve sources and asset provenance when adding poems, translations, or illustrations, and update the related data and tests.

## Sources and license

The project uses the [MIT License](LICENSE). Third-party fonts, texts, and online service content retain their own licenses and terms.

| Content                               | Source                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline poem originals                | Each entry in [`quotes.js`](extension/quotes.js) links to [Wikisource](https://zh.wikisource.org/)                                                                   |
| Offline explanations and commentary   | Written for this project                                                                                                                                             |
| Online poems and Chinese translations | Provided by the [Jinrishici API](https://www.jinrishici.com/)                                                                                                        |
| Illustrations                         | AI-assisted artwork; prompts and generation records are in [`prompts.json`](extension/assets/art/prompts.json)                                                       |
| Poem font                             | Bundled Noto Serif SC subset, under the [SIL Open Font License 1.1](extension/assets/fonts/OFL.txt); see [`provenance.json`](extension/assets/fonts/provenance.json) |
| English solar term names              | Based on the [Hong Kong Observatory calendar](https://www.hko.gov.hk/en/gts/time/24solarterms.htm)                                                                   |
