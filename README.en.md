# Accessible AI Browser Navigator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](manifest.json)
[![No build step](https://img.shields.io/badge/build-none-success.svg)](#development)

A Chrome (Manifest V3) extension that lets you navigate a website in plain language and land on the right page. Built for people who use screen readers and keyboard navigation on sites whose structure is hard to traverse.

Describe a destination — *"the contact form"*, *"the VoIP switchboard page"*, *"opening times"* — and the extension walks the site link by link until it reaches the target page and announces it.

The product UI is in Italian; this document is available in **English** and in [Italian](README.md). The code is in English.

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [How it works](#how-it-works)
- [Permissions & privacy](#permissions--privacy)
- [Requirements](#requirements)
- [Install](#install)
- [Configure](#configure)
- [Usage](#usage)
- [Benchmark](#benchmark)
- [Project structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The extension drives a decision model — [TypeSafe System One ("Jev")](https://docs.typesafe.ai) — that answers **typed questions** over a structured description of the page. There is no free-form generation to parse: every answer is a choice, a score, or a calibrated probability, and **all control flow stays in code**.

Starting from the current page, the **Naviga nel sito** mission is multi-step: it decides at every step whether to click a link, scroll, wait, use the site's own search, or stop.

## Features

- **Natural-language browsing** — describe the destination and the mission walks the site to it, starting from the page you are on.
- **Same-site browsing** — the mission pins the starting domain and never drifts to external vendors.
- **Site search aware** — when a site has its own search box, the agent can type the request and submit it.
- **Resilient navigation** — synthetic click with a direct-navigation fallback; static-file links are skipped; dead ends backtrack to the best alternative instead of failing.
- **Semantic grounding** — links carry their region (`menu`, `testata`, `contenuto`, …), the nearest section heading, and row context, so generic and icon-only links stay distinguishable.
- **Ranking you can reason about** — candidates are re-ranked in code by the query's *essential* terms over text + heading + context, weighted by region.
- **Relevance gate** — an off-topic page (or an unsure target) is not clicked; after a few sterile steps the mission ends with *"Nessuna pagina pertinente trovata"* instead of wandering.
- **Accessibility-first UI** — high-contrast overlay, persistent ARIA live status announced on every step, focus moved to the stop control and restored on close, Esc to stop from anywhere, `lang="it"` on the UI, visible labels plus focus indicators, and smooth scrolling that respects `prefers-reduced-motion`.
- **No tracking parameters** in the URLs it follows.

## How it works

```
keyboard shortcut ──▶ content.js: collect page model ──▶ background.js
                                                            │  expand query (intent, essentials, variants)
                                                            │  1 request to Jev:  operation · click_target · section
                                                            │                      done · done_page · error
                                                            │                      relevance · on_topic
                                                            ▼
                                            code decides (gates, ranking, frontier, backtrack)
                                                            ▼
                                     content.js: click / scroll / search / focus page heading
```

- `content.js` builds a compact model of the page (visible links with region, section heading and row context; main text; open dialogs; site search field) and stamps elements with `data-a11y-id`.
- `background.js` runs one System One request per step, batches many atomic questions into it, and composes the typed answers with deterministic rules. Selection is delegated to Jev; everything else — timing, limits, safety gates, loop guards — is code.
- The browse mission lives in `chrome.storage.session` (never synced) and is cleared on stop / done / stuck.

## Permissions & privacy

The manifest requests **no `permissions` entry**.

| Scope | Value | Why |
|---|---|---|
| `host_permissions` | `https://api.typesafe.ai/*` | The selection engine. |
| `host_permissions` | `https://api.openai.com/*` | Only if you configure it as the optional phrase refiner. |
| `optional_host_permissions` | `https://*/*` | Requested at save-time, narrowed to the exact host you type, only for a custom refiner endpoint. |

Data flow:

- The typed phrase and the **visible page texts/links** (ranked by relevance) are sent to the selection engine to choose the link.
- If the page offers a **site search**, the extension may type your request into that field and submit it — in that case the request goes to the visited website, exactly as if you had typed it.
- If you configure an **optional refiner** (OpenAI-compatible), the typed phrase may also be sent there first.
- The mission (goal, step, visited pages) stays in the browser session only and is deleted when the mission ends.
- API keys are entered in the options page and stored only in `chrome.storage.local` of your browser profile — never synced, never logged, never sent to content scripts.
- Where the browser supports it, part of the query expansion runs **on-device** (`LanguageModel` / `aiLanguageModel`).

## Requirements

- Chrome (or a Chromium-based browser) with Manifest V3 and, for multi-step browsing, `chrome.storage.session` access to content scripts.
- A TypeSafe Jev API key (for the selection engine). The on-device model and the optional refiner are fallbacks, not requirements.
- No build step, no dependencies.

## Install

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder.
5. After editing files, press **Reload** on the extension card; content-script changes also require reloading the target page.

## Configure

Open the extension's **Options** page:

- **TypeSafe Jev API key** — required for navigation.
- **Optional refiner** — an OpenAI-compatible endpoint (base URL + key, model optional with auto-detection via `GET /models`) used only to rewrite the phrase before selection.

## Usage

- Press **Ctrl+Shift+Y** (**Cmd+Shift+Y** on macOS) to open the navigation bar.
- Type the destination and press **Enter**, or click **Naviga nel sito**, to start the multi-step browsing mission.
- **Esc** or **Interrompi** stops a mission.

## Benchmark

A standalone, dependency-free benchmark drives the real `background.js` against **live, complex public sites** with ground-truth URL checks, in difficulty tiers 1 → 5.

```bash
node bench/run.mjs               # all tiers
node bench/run.mjs --tier 4      # one difficulty tier
node bench/run.mjs --only R5,R8  # specific tasks
```

The Jev key is read from `TYPESAFE_API_KEY` or, on macOS, from the Keychain (`typesafe-api-key`). Live sites change, so a failure may be the site rather than the agent — every line prints the URL actually reached.

Current score: **12/12** across MDN, python.org, mozilla.org, gnu.org, Wikipedia and books.toscrape, including off-site, mailto and tracking-parameter guards.

## Project structure

```
manifest.json      MV3 manifest
background.js      service worker: query expansion, Jev calls, browse loop
content.js         page model, overlay UI, actions (click / scroll / search / focus)
options.html/.js/.css  options page (Jev key, optional refiner)
styles.css         high-contrast overlay styling
bench/             live-site benchmark (run.mjs) and tasks (tasks.mjs)
AGENTS.md          architecture notes for contributors/agents
```

## Development

- No package manager, no bundler, no lint config: plain JS + CSS loaded directly by Chrome.
- Keep MV3, `async/await` (no `.then()` chains), minimal permissions, and error handling on every async operation.
- See **[AGENTS.md](AGENTS.md)** for the full message flow, the relevance gate, caps and invariants.
- Run the benchmark after changing any browse gate.

## Contributing

Issues and pull requests are welcome. Please keep changes small and verify them with the benchmark (`node bench/run.mjs`) when they touch navigation behavior.

## License

[MIT](LICENSE).
