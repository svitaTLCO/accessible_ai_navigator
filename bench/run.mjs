// Real-website benchmark for the Jev navigator. Drives the real background.js
// against live pages (bench/tasks.mjs) with ground-truth URL checks.
//
//   node bench/run.mjs
//   node bench/run.mjs --tier 4
//   node bench/run.mjs --only R5,R8
//
// The TypeSafe key is read from TYPESAFE_API_KEY or, on macOS, from the Keychain
// (service typesafe-api-key). Live pages change: a failure may be the
// site, not the agent — every run prints the URL actually reached.

import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TASKS } from "./tasks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY.trim();
  try { return execSync("security find-generic-password -s typesafe-api-key -w", { encoding: "utf8" }).trim(); } catch (e) { return ""; }
}
const KEY = resolveKey();
if (!KEY) { console.error("No TYPESAFE_API_KEY (env or Keychain service typesafe-api-key)."); process.exit(2); }

const args = process.argv.slice(2);
const tierArg = args.includes("--tier") ? Number(args[args.indexOf("--tier") + 1]) : null;
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

let jevCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { if (String(a[0]).includes("api.typesafe.ai")) jevCalls++; return realFetch(...a); };

const sessionStore = new Map();
globalThis.chrome = {
  commands: { onCommand: { addListener() {} } },
  runtime: { onMessage: { addListener() {} }, lastError: null },
  storage: {
    local: { async get(k) { return k === "llmProviderConfig" ? { llmProviderConfig: { jevApiKey: KEY, baseUrl: "", apiKey: "", model: "" } } : {}; }, async set() {} },
    session: {
      async get(k) { return sessionStore.has(k) ? { [k]: sessionStore.get(k) } : {}; },
      async set(o) { for (const [k, v] of Object.entries(o)) sessionStore.set(k, v); },
      async remove(k) { sessionStore.delete(k); }
    }
  }
};

const src = fs.readFileSync(resolve(ROOT, "background.js"), "utf8");
vm.runInThisContext(src + "\nglobalThis.__bg = { handleBrowse, clearMission, buildExpansion };", { filename: "background.js" });
const bg = globalThis.__bg;
const defaultBuildExpansion = bg.buildExpansion;

// ---------- page model (mirrors content.js, no browser) ----------
const TRACKING = ["utm_", "_ga", "_gl", "fbclid", "gclid", "mc_", "yclid", "msclkid"];
const STATIC = /\.(pdf|zip|rar|7z|gz|tgz|tar|docx?|xlsx?|pptx?|odt|ods|odp|csv|txt|rtf|png|jpe?g|gif|webp|svg|bmp|ico|mp4|m4v|mp3|wav|avi|mov|mkv|webm|exe|dmg|pkg|apk|iso)$/i;
const ZONES = { nav: "menu", header: "testata", footer: "piè di pagina", main: "contenuto", aside: "laterale" };

function cleanHref(href) {
  if (typeof href !== "string" || !href || /^mailto:/i.test(href)) return href;
  try {
    const u = new URL(href);
    for (const k of [...u.searchParams.keys()]) { const low = k.toLowerCase(); if (TRACKING.some(p => low === p || low.startsWith(p))) u.searchParams.delete(k); }
    return u.href.split("#")[0];
  } catch (e) { return href; }
}
const strip = (s) => (s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/\s+/g, " ").trim();

function parseLinks(html, base) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const events = [];
  for (const m of html.matchAll(/<(\/)?(nav|header|footer|main|aside)\b[^>]*>/gi)) events.push({ i: m.index, kind: "lm", close: !!m[1], tag: m[2].toLowerCase() });
  for (const m of html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) events.push({ i: m.index, kind: "h", text: strip(m[2]).slice(0, 80) });
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) events.push({ i: m.index, kind: "a", attrs: m[1], inner: m[2] });
  events.sort((a, b) => a.i - b.i);
  const stack = [];
  let heading = "";
  const links = [], seen = new Set();
  const baseClean = cleanHref(base);
  for (const ev of events) {
    if (ev.kind === "lm") {
      if (ev.close) { const k = stack.lastIndexOf(ev.tag); if (k >= 0) stack.splice(k, 1); }
      else stack.push(ev.tag);
      continue;
    }
    if (ev.kind === "h") { heading = ev.text; continue; }
    const hrefRaw = (ev.attrs.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (!hrefRaw) continue;
    let href;
    try { href = cleanHref(new URL(hrefRaw, base).href); } catch (e) { continue; }
    const isEmail = /^mailto:/i.test(href);
    if (!isEmail && (!/^https?:/i.test(href) || STATIC.test(new URL(href).pathname))) continue;
    if (!isEmail && cleanHref(href) === baseClean) continue;
    const t = strip(ev.inner) || (ev.attrs.match(/aria-label\s*=\s*["']([^"']*)["']/i) || [])[1] || (ev.attrs.match(/title\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    if (!t) continue;
    const key = href + "||" + t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = stack[stack.length - 1];
    links.push({ t: t.slice(0, 120), href, email: isEmail, zone: ZONES[tag] || "contenuto", heading, near: "", toggle: false });
  }
  return links;
}

function mainText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const m = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return strip(m ? m[1] : cleaned).slice(0, 8000);
}
const detectSearch = (html) => /<input\b[^>]*type\s*=\s*["']?search/i.test(html) || /role\s*=\s*["']search["']/i.test(html) ? { inputId: "s-input", submitId: "" } : null;

async function fetchPage(url) {
  const res = await realFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; a11y-nav-bench/1.0)" }, redirect: "follow" });
  const html = await res.text();
  return { url: cleanHref(res.url), title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ? strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 200) : "", text: mainText(html), links: parseLinks(html, res.url), search: detectSearch(html) };
}

function payload(page) {
  return {
    links: page.links.map((l, i) => ({ id: `l-${i}`, t: l.t, href: l.href, email: !!l.email, near: l.near || "", zone: l.zone, heading: l.heading, toggle: !!l.toggle })),
    url: page.url, title: page.title, pageText: page.text, dialogs: undefined, search: page.search,
    canScrollDown: false, canScrollUp: false
  };
}

function withExpansion(task) {
  if (task.expansion) {
    const e = task.expansion;
    globalThis.buildExpansion = async () => ({ expansion: { original: e.original, context: e.context || "", intent: e.intent || "", essential: e.essential || [], variants: e.variants || [e.original] }, config: { jevApiKey: KEY } });
  } else {
    globalThis.buildExpansion = defaultBuildExpansion;
  }
}

async function runBrowse(task) {
  withExpansion(task);
  await bg.clearMission();
  let page = await fetchPage(task.start);
  if (!task.searchUrl) page.search = null;
  const visited = [];
  let result = await bg.handleBrowse({ action: "browse_start", query: task.goal, ...payload(page) });
  let status = result.status, finalUrl = page.url, steps = 1;
  for (let i = 0; i < (task.maxSteps || 5); i++) {
    if (result.status === "goto") {
      if (result.href) { visited.push(cleanHref(result.href)); page = await fetchPage(result.href); if (!task.searchUrl) page.search = null; finalUrl = page.url; }
      else { visited.push("toggle"); }
      result = await bg.handleBrowse({ action: "browse_step", ...payload(page) });
      status = result.status; steps++; continue;
    }
    if (result.status === "search_site") {
      if (typeof task.searchUrl === "function") {
        const u = task.searchUrl(result.text || task.goal);
        visited.push(cleanHref(u)); page = await fetchPage(u); finalUrl = page.url;
        result = await bg.handleBrowse({ action: "browse_step", ...payload(page) });
        status = result.status; steps++; continue;
      }
      status = "search_unsupported"; break;
    }
    if (["scroll_down", "scroll_up", "wait"].includes(result.status)) {
      result = await bg.handleBrowse({ action: "browse_step", ...payload(page) });
      status = result.status; steps++; continue;
    }
    if (result.href) visited.push(cleanHref(result.href));
    finalUrl = page.url; status = result.status; break;
  }
  return { status, finalUrl: cleanHref(finalUrl), visited, steps };
}

function check(task, r) {
  const e = task.expect;
  const hits = (needle) => r.visited.some(u => String(u).includes(needle)) || String(r.finalUrl).includes(needle);
  if (e.kind === "landed") return { pass: hits(e.includes), detail: `${r.status} @ ${r.finalUrl}` };
  if (e.kind === "avoided") return { pass: !hits(e.bad), detail: !hits(e.bad) ? `${r.status} @ ${r.finalUrl}` : `VIOLATO: ${e.bad} in ${JSON.stringify(r.visited.concat(r.finalUrl))}` };
  if (e.kind === "noFalseFound") {
    const ok = !["pinpoint", "goto"].includes(r.status) && r.visited.length === 0;
    return { pass: ok, detail: `${r.status} @ ${r.finalUrl} visits=${JSON.stringify(r.visited)}` };
  }
  return { pass: false, detail: "unknown expectation" };
}

const tasks = TASKS.filter(t => (!tierArg || t.tier === tierArg) && (!onlyArg || onlyArg.includes(t.id)));
const results = [];
for (const task of tasks) {
  jevCalls = 0;
  const t0 = Date.now();
  let r;
  try { r = await runBrowse(task); }
  catch (error) { r = { status: "exception", finalUrl: task.start, visited: [], steps: 0, error: String((error && error.message) || error) }; }
  const c = check(task, r);
  results.push({ task, r, c, ms: Date.now() - t0, calls: jevCalls });
  console.log(`[${c.pass ? "PASS" : "FAIL"}] T${task.tier} ${task.id}  (${r.steps} passi, ${jevCalls} chiamate Jev, ${Date.now() - t0}ms)`);
  console.log(`        atteso: ${task.expect.kind}${task.expect.includes || task.expect.bad ? " " + (task.expect.includes || "≠" + task.expect.bad) : ""} — ${task.note}`);
  console.log(`        ottenuto: ${c.detail}`);
}

console.log("\n================ RIEPILOGO ================");
const byTier = {};
for (const { task, c, calls } of results) {
  byTier[task.tier] = byTier[task.tier] || { pass: 0, total: 0, calls: 0 };
  byTier[task.tier].total++; if (c.pass) byTier[task.tier].pass++; byTier[task.tier].calls += calls;
}
for (const tier of Object.keys(byTier).sort((a, b) => a - b)) {
  const t = byTier[tier];
  console.log(`Difficoltà ${tier}: ${t.pass}/${t.total}  (${t.calls} chiamate Jev)`);
}
console.log(`Totale: ${results.filter(x => x.c.pass).length}/${results.length}`);
const fails = results.filter(x => !x.c.pass).map(x => x.task.id);
if (fails.length) console.log("Falliti: " + fails.join(", "));
