# AGENTS.md

Chrome MV3 extension ("Accessible AI Browser Navigator"): raw JS + CSS, no package.json, no build, no test/lint tooling. Verify in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → this directory. After editing, click Reload; content-script changes additionally require reloading the target page.

## Compliance workflow

- Code follows the Chrome "Modern Web Guidance" / chrome-extensions skill rules (MV3 only, async/await — no `.then()` chains, minimal permissions, error handling on all async ops). Keep it that way when editing.
- Store metadata, permission justifications, and privacy disclosures live in `CHROMEWEBSTORE.md`. Update it whenever `manifest.json` permissions/host_permissions or data flow change.

## Architecture (message flow)

- `content.js` (injected on all pages): toggle overlay input via Ctrl+Shift+Y; collects visible interactive elements, stamps each with `data-a11y-id` (`p-0`, `p-1`, ...), sends `{action:"navigate_to_point", query, elements:[{id, r, t}]}` to background.
- `background.js` (service worker): relays the keyboard command as `{action:"open_input"}` to the active tab; on navigation it optionally refines the query with the on-device Prompt API (`LanguageModel`, legacy `aiLanguageModel` fallback; session destroyed after use), then sends ONE `/v1/systemone` request batching two questions: a `choice` (which element) and a `score` (match quality, 4-level rubric). A score below level 2 returns `{success:false, reason:"ambiguous"}` instead of navigating; missing score, hallucinated id, or any API error degrade to substring match on `t`. On success replies `{success, targetId}`; content.js then scrollIntoView + focus `[data-a11y-id="<targetId>"]`.

## Gotchas

- **Element-id contract spans both scripts.** `data-a11y-id` is assigned in `content.js` and re-consumed there after the background round trip. Renaming the attribute or the message shape breaks navigation silently (status shows "Elemento non raggiungibile.").
- **Placeholder API key hardcoded:** `IL_TUO_TYPESAFE_API_KEY` in `background.js`. There is no env/config mechanism; substitute locally for testing and never commit a real key (the repo ships the placeholder on purpose). The skip-guard compares against that exact string — keep them in sync if you rename it.
- **Permissions are intentionally minimal.** Only `aiLanguageModel` (+ `host_permissions` for api.typesafe.ai). Messaging to our own content script needs no permission; do not re-add `activeTab`/`scripting` without a concrete code path that uses them.
- **On-device model is optional.** `LanguageModel` (stable) / `aiLanguageModel` (older experimental builds) may be absent (Edge, older Chrome); the guards are deliberate graceful degradation — keep them. Empty model answers are ignored so they can't turn substring matching into a match-all.
- **Intentional payload caps:** max 60 candidate elements and 60-char name truncation in `getOptimizedAccessibilityNodes()` bound the prompt size sent to the models. Raising them increases cost/latency.
- **Italian user-facing text.** All UI strings, ARIA labels, status messages, and LLM prompt text are Italian; new strings must match. Store-facing copy in `CHROMEWEBSTORE.md` names no vendors/APIs by design.
- **High-contrast styling is deliberate.** Black background / yellow border / bold white text in `styles.css` is an accessibility design choice, not a styling bug — do not "clean it up" without confirmation.
