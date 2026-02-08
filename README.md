# Token Ocean

A Chrome extension that visualizes your AI chat usage as a **water footprint**. It runs on ChatGPT and Gemini, estimates token consumption from your conversations (including context and file uploads), and displays the equivalent water usage in mL, L, or kL.

## Features

- **Water footprint** — Converts estimated token usage into a water-equivalent volume (based on energy and water-use efficiency).
- **Total vs session** — View all-time usage or just the current session.
- **Context awareness** — Counts the “re-read” cost: the model reading all previous messages to generate each new response.
- **File uploads** — Rough token estimates for images and text files you attach.
- **Session reset** — Session stats reset when you switch conversations or click “Reset this session” in the popup.

## Supported sites

- [chatgpt.com](https://chatgpt.com)
- [gemini.google.com](https://gemini.google.com)

## Installation

1. Clone or download this repo and open the `token-ocean-extension` folder.
2. In Chrome, go to **chrome://extensions**.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `token-ocean-extension` folder.
5. The Token Ocean icon should appear in your toolbar. Use it on ChatGPT or Gemini to start tracking.

## Usage

1. Visit ChatGPT or Gemini and have a conversation (or open an existing one).
2. Click the Token Ocean icon in the toolbar to open the popup.
3. See your water usage (total or this session), context size, and message count.
4. Use **Total** / **This session** to switch views; use **Reset this session** to zero out the current session.

## How it works

- **Token estimation** — Text is approximated at ~4 characters per token; file uploads use size- and type-based heuristics (e.g. images by size, text/JSON/CSV by byte count).
- **Energy** — Uses simple per-token energy constants for “prefill” (reading context) and “decode” (generating output).
- **Water** — Converts energy (Wh) to water volume (mL) via a water-use efficiency factor. The result is shown in mL, L, or kL depending on magnitude.

Data is stored locally in Chrome (`chrome.storage.local`); nothing is sent to external servers.

## Permissions

- **storage** — Used to persist water usage, context size, message count, and view preference (total vs session) locally.

## Files

| File            | Purpose                                                |
|-----------------|--------------------------------------------------------|
| `manifest.json` | Extension config, permissions, content scripts        |
| `popup.html`    | Popup UI structure                                     |
| `popup.js`      | Popup logic: view toggle, reset, formatting, display   |
| `style.css`     | Popup and (if any) injected styles                     |
| `content.js`    | Injected on ChatGPT/Gemini: DOM scanning, footprint    |
| `utils.js`      | Shared: selectors, token/energy/water constants        |
| `file-listener.js` | Main-world script for file upload detection        |
| `icon.png`      | Toolbar icon                                           |

## Development

- Set `DEBUG_MESSAGES = true` in `utils.js` and open DevTools (Inspect) on a ChatGPT or Gemini tab to see console logs from the content script.
- After changing the extension, go to **chrome://extensions** and click the refresh icon on Token Ocean.

## License

Use and modify as you like. Built for QHacks 2026.
