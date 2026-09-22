let overlay = null;
let missionTimer = null;

function removeOverlay() {
  if (missionTimer) { clearTimeout(missionTimer); missionTimer = null; }
  if (overlay) { overlay.remove(); overlay = null; }
}

function createAccessibleInput() {
  if (overlay) { removeOverlay(); return; }

  overlay = document.createElement('div');
  overlay.id = "a11y-nav-overlay";
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Navigazione rapida assistita da AI');

  overlay.innerHTML = `
    <div class="a11y-container">
      <label id="nav-label" for="a11y-nav-input" class="sr-only">Scrivi la destinazione (es. carrello, contatti):</label>
      <input type="text" id="a11y-nav-input" aria-labelledby="nav-label" placeholder="Dove vuoi andare?" autocomplete="off" />
      <div class="a11y-actions">
        <button id="a11y-go-btn" type="button">Vai nella pagina</button>
        <button id="a11y-browse-btn" type="button">Naviga nel sito</button>
      </div>
      <div id="a11y-status" role="status" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('a11y-nav-input');
  const status = document.getElementById('a11y-status');
  input.focus();

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { stopMission(true); removeOverlay(); }
    if (e.key === 'Enter' && input.value.trim() !== '') {
      runOneShot(input.value, status);
    }
  });
  document.getElementById('a11y-go-btn').addEventListener('click', () => {
    if (input.value.trim() !== '') runOneShot(input.value, status);
  });
  document.getElementById('a11y-browse-btn').addEventListener('click', () => {
    if (input.value.trim() !== '') startMission(input.value, status);
  });
}

const CONTACT_QUERY_RE = /(contatt|scriv|email|e-mail|\bmail\b|telefon|chiam|assistenz|support|preventiv|parlar|operatore|consulenz)/i;

function queryLooksLikeContact(query) {
  return CONTACT_QUERY_RE.test(query || "");
}

function runOneShot(query, status, doneLabel) {
  status.textContent = "Analisi della pagina...";
  console.info("[a11y-nav] invio query:", query);

  const optimizedElements = getOptimizedAccessibilityNodes(query);
  console.info("[a11y-nav] elementi raccolti:", optimizedElements.length);

  if (optimizedElements.length === 0) {
    status.textContent = "Nessun elemento interattivo trovato.";
    return;
  }

  let answered = false;
  const watchdog = setTimeout(() => {
    if (!answered) {
      status.textContent = "Ancora in attesa... apri chrome://extensions > Service worker per i log.";
      console.warn("[a11y-nav] nessuna risposta dopo 15s, attendo ancora.");
    }
  }, 15000);

  chrome.runtime.sendMessage({ action: "navigate_to_point", query, elements: optimizedElements }, (response) => {
    answered = true;
    clearTimeout(watchdog);
    console.info("[a11y-nav] risposta ricevuta:", response, "errore:", chrome.runtime.lastError?.message);
    if (chrome.runtime.lastError) {
      status.textContent = "Errore estensione: ricarica la pagina e riprova.";
      return;
    }
    if (!response) {
      status.textContent = "Nessuna risposta dal servizio. Ricarica l'estensione.";
      return;
    }
    if (response && response.success && response.targetId) {
      const targetElement = document.querySelector(`[data-a11y-id="${response.targetId}"]`);
      if (targetElement) {
        const href = targetElement.getAttribute && targetElement.getAttribute('href');
        if (href && /^mailto:/i.test(href)) {
          if (!queryLooksLikeContact(query)) {
            status.textContent = "Link email ignorato: la richiesta non chiede di contattare.";
            return;
          }
          status.textContent = `Apro il programma email.`;
          if (targetElement.click) targetElement.click();
          setTimeout(() => removeOverlay(), 1200);
        } else {
          status.textContent = doneLabel || `Navigato su elemento.`;
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetElement.focus();
          setTimeout(() => removeOverlay(), 1200);
        }
      } else {
        status.textContent = "Elemento non raggiungibile.";
      }
    } else if (response && !response.success) {
      if (response.reason === "ambiguous") {
        status.textContent = response.bestLabel
          ? `Corrispondenza ambigua (migliore: ${response.bestLabel}). Prova una descrizione più precisa.`
          : "Corrispondenza ambigua: prova una descrizione più precisa.";
      } else {
        status.textContent = "Destinazione non trovata.";
      }
    }
  });
}

function shareName(el) {
  const share = (el.getAttribute && el.getAttribute('data-share')) || "";
  if (!share) return "";
  const kind = share.trim().toLowerCase();
  if (!kind) return "";
  if (kind === "email") return "Condividi via email";
  return "Condividi via " + share.trim();
}

function extraName(el) {
  try {
    if (el.tagName === 'INPUT' && /^(submit|button|image|reset)$/i.test(el.type || '') && el.value) {
      return String(el.value).trim().replace(/\s+/g, ' ');
    }
    if (el.querySelector) {
      const img = el.querySelector('img[alt]');
      if (img) {
        const alt = (img.getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
        if (alt) return alt;
      }
      const titleEl = el.querySelector('title');
      if (titleEl) {
        const text = (titleEl.textContent || '').trim().replace(/\s+/g, ' ');
        if (text) return text;
      }
    }
  } catch (error) {
  }
  return "";
}

function dedupeLinks(nodes) {
  const seen = new Set();
  return nodes.filter(n => {
    const key = (n.href || "") + "||" + (n.t || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TRACKING_PARAM_PREFIXES = [
  "utm_", "_ga", "_gl", "fbclid", "gclid", "gbraid", "wbraid", "msclkid", "yclid", "dclid",
  "twclid", "igshid", "s_kwcid", "mc_", "_hs", "mkt_", "vero_", "oly_", "rb_clickid",
  "wickedid", "__s", "campaignid", "adgroupid", "adid"
];

function stripTracking(url) {
  if (typeof url !== "string" || !url || /^mailto:/i.test(url)) return url;
  try {
    const u = new URL(url, location.href);
    for (const key of [...u.searchParams.keys()]) {
      const low = key.toLowerCase();
      if (TRACKING_PARAM_PREFIXES.some(p => low === p || low.startsWith(p))) u.searchParams.delete(key);
    }
    return u.href;
  } catch (error) {
    return url;
  }
}

const STATIC_FILE_RE = /\.(pdf|zip|rar|7z|gz|tgz|tar|docx?|xlsx?|pptx?|odt|ods|odp|csv|txt|rtf|png|jpe?g|gif|webp|svg|bmp|ico|mp4|m4v|mp3|wav|avi|mov|mkv|webm|exe|dmg|pkg|apk|iso)$/i;

function isStaticFileUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const path = new URL(url, location.href).pathname;
    return STATIC_FILE_RE.test(path);
  } catch (error) {
    return STATIC_FILE_RE.test((url.split(/[?#]/)[0] || ""));
  }
}

function normalizePageUrl(url) {
  try {
    const u = new URL(stripTracking(url), location.href);
    return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch (error) {
    return "";
  }
}

function isSamePage(a, b) {
  const na = normalizePageUrl(a);
  return !!na && na === normalizePageUrl(b);
}

const ZONE_RE = 'nav, [role="navigation"], header, [role="banner"], footer, [role="contentinfo"], aside, [role="complementary"], main, [role="main"], form[role="search"]';

function zoneOf(el) {
  const zone = el.closest(ZONE_RE);
  if (!zone) return "contenuto";
  const tag = zone.tagName.toLowerCase();
  const role = zone.getAttribute('role') || "";
  if (tag === "nav" || role === "navigation") return "menu";
  if (tag === "header" || role === "banner") return "testata";
  if (tag === "footer" || role === "contentinfo") return "piè di pagina";
  if (tag === "aside" || role === "complementary") return "laterale";
  return "contenuto";
}

function sectionHeading(el) {
  const scope = el.closest('section, article, [role="region"], nav, header, footer, aside, main, form') || document.body;
  if (!scope) return "";
  const headings = scope.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let best = "";
  for (const h of headings) {
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
  }
  if (!best) return "";
  return (best.innerText || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function zoneWeight(zone) {
  if (zone === "menu") return 2;
  if (zone === "testata") return 1.5;
  if (zone === "contenuto") return 1;
  if (zone === "laterale") return 0.5;
  if (zone === "piè di pagina") return 0.4;
  return 1;
}

function collectLinks(query) {
  const rawLinks = document.querySelectorAll('a[href]');
  const nodes = [];

  rawLinks.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      (rect.width === 0 && rect.height === 0) ||
      el.hasAttribute('aria-hidden')
    ) {
      return;
    }
    let href = "";
    try {
      href = stripTracking(new URL(el.getAttribute('href'), location.href).href);
    } catch (error) {
      return;
    }
    if (!/^https?:\/\//.test(href) && !/^mailto:/i.test(href)) return;
    const isEmail = /^mailto:/i.test(href);
    if (!isEmail && isStaticFileUrl(href)) return;
    if (!isEmail && isSamePage(href, location.href)) return;

    let accessibleName = (
      el.getAttribute('aria-label') ||
      el.innerText ||
      el.getAttribute('title') ||
      extraName(el) ||
      shareName(el) ||
      ''
    ).trim().replace(/\s+/g, ' ');
    if (!accessibleName) return;

    nodes.push({
      el: el,
      t: accessibleName,
      href: href,
      email: isEmail,
      near: rowContext(el, accessibleName),
      zone: zoneOf(el),
      heading: sectionHeading(el)
    });
  });

  const ranked = dedupeLinks(rankLinksByQuery(nodes, query));
  let linkCounter = 0;
  const items = ranked.map((n) => {
    if (!n.el.getAttribute('data-a11y-id') || !n.el.getAttribute('data-a11y-id').startsWith('l-')) {
      n.el.setAttribute('data-a11y-id', `l-${linkCounter++}`);
    }
    return { id: n.el.getAttribute('data-a11y-id'), t: n.t, href: n.href, email: !!n.email, near: n.near, zone: n.zone, heading: n.heading };
  });
  const toggles = collectMenuToggles().map((n) => {
    if (!n.el.getAttribute('data-a11y-id') || !n.el.getAttribute('data-a11y-id').startsWith('l-')) {
      n.el.setAttribute('data-a11y-id', `l-${linkCounter++}`);
    }
    return { id: n.el.getAttribute('data-a11y-id'), t: n.t, href: "", email: false, near: "", zone: "menu", heading: n.heading || "", toggle: true };
  });
  return items.concat(toggles);
}

function collectMenuToggles() {
  const out = [];
  const seen = new Set();
  const candidates = document.querySelectorAll('[aria-haspopup], summary, button[aria-expanded], [role="button"][aria-expanded], nav [aria-expanded], header [aria-expanded], [aria-expanded][aria-controls]');
  candidates.forEach((el) => {
    if (seen.has(el)) return;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0) || el.hasAttribute('aria-hidden')) return;
    const expanded = el.getAttribute('aria-expanded');
    const haspopup = el.getAttribute('aria-haspopup');
    const controls = el.getAttribute('aria-controls');
    const className = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
    const inNav = !!el.closest('nav, header, [role="navigation"], [role="banner"]');
    const looksMenu = /menu|voci|sezioni|navigazione|hamburger/i.test(name) || /hamburger|burger|menu-?toggle|nav-?toggle/i.test(className);
    const isToggle = haspopup || el.tagName === 'SUMMARY'
      || (inNav && (looksMenu || expanded === 'false' || !!controls))
      || (looksMenu && expanded !== null);
    if (!isToggle) return;
    if (!name && el.tagName !== 'SUMMARY') return;
    if (/^\s*(cerca|search)\s*$/i.test(name)) return;
    seen.add(el);
    out.push({ el: el, t: name || 'Apri il menu di navigazione', heading: sectionHeading(el), nav: inNav });
  });
  return out
    .sort((a, b) => (b.nav ? 1 : 0) - (a.nav ? 1 : 0))
    .slice(0, 25)
    .map((n) => ({ el: n.el, t: n.t, heading: n.heading }));
}

function rowContext(el, ownName) {
  const own = (ownName || "").trim();
  if (own.length >= 16) return "";
  let node = el.parentElement;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    const text = (node.innerText || "").trim().replace(/\s+/g, " ");
    if (text && text !== own) {
      if (text.length <= 100) return text;
      break;
    }
  }
  const row = el.closest("li, tr, [role='row'], [role='listitem']");
  if (row && row !== el) {
    const text = (row.innerText || "").trim().replace(/\s+/g, " ").slice(0, 100);
    if (text && text !== own) return text;
  }
  return "";
}

function mainContentRoot() {
  const candidates = ['main', '[role="main"]', '#main', '#content', '#contenuto', '.site-main', '.entry-content', 'article'];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.innerText || "").trim();
      if (text.length >= 200) return el;
    }
  }
  return document.body || document.documentElement;
}

function focusPageDestination(step) {
  const root = mainContentRoot();
  const heading = (root && root.querySelector('h1, h2')) || document.querySelector('h1, h2');
  const target = heading || root;
  if (target) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    } catch (error) {
      console.warn("[a11y-nav] messa a fuoco della destinazione non riuscita.", error);
    }
  }
  const status = document.getElementById('a11y-status');
  if (status) {
    const title = (document.title || '').trim();
    status.textContent = title ? `Destinazione raggiunta al passo ${step}: ${title}.` : `Destinazione raggiunta al passo ${step}.`;
  }
  setTimeout(() => removeOverlay(), 3000);
}

const CHROME_SEL = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]';

function collectPageText() {
  const root = mainContentRoot();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const inView = [];
  const below = [];
  let node = walker.nextNode();
  let total = 0;
  const vh = window.innerHeight || 0;
  while (node && total < 8000) {
    const text = (node.nodeValue || "").trim().replace(/\s+/g, " ");
    const parent = node.parentElement;
    if (text && parent && !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(parent.tagName) && !parent.closest(CHROME_SEL)) {
      const rect = parent.getBoundingClientRect();
      const style = window.getComputedStyle(parent);
      if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !parent.hasAttribute('aria-hidden')) {
        if (rect.bottom >= 0 && rect.top <= vh) inView.push(text);
        else below.push(text);
        total += text.length + 1;
      }
    }
    node = walker.nextNode();
  }
  return inView.concat(below).join("\n").slice(0, 8000);
}

function collectDialogs() {
  const out = [];
  const push = (t) => {
    const clean = (t || "").trim().replace(/\s+/g, " ").slice(0, 400);
    if (clean && !out.includes(clean)) out.push(clean);
  };
  document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]').forEach((d) => {
    const rect = d.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) push(d.innerText);
  });
  const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (let n = center; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const st = window.getComputedStyle(n);
    const r = n.getBoundingClientRect();
    if ((st.position === "fixed" || st.position === "sticky") && r.width * r.height >= 0.6 * window.innerWidth * window.innerHeight) {
      push(n.innerText);
      break;
    }
  }
  return out.slice(0, 3);
}

function repeatedLinkTexts(links) {
  const counts = {};
  for (const l of links) {
    const key = (l.t || "").slice(0, 50);
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  const rep = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return rep.length ? Object.fromEntries(rep) : undefined;
}

let lastObservation = null;

function insertedText(before, after, max) {
  const A = String(before || "").split(" ").slice(0, 600);
  const B = String(after || "").split(" ").slice(0, 600);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const runs = [];
  let cur = [], i = 0, j = 0;
  while (j < m) {
    if (i < n && A[i] === B[j]) {
      if (cur.length) { runs.push(cur.join(" ")); cur = []; }
      i++; j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      cur.push(B[j]); j++;
    }
  }
  if (cur.length) runs.push(cur.join(" "));
  return runs.join(" | ").slice(0, max || 300);
}

function computeChange(links, payload) {
  if (!lastObservation) return undefined;
  const change = {};
  const prevUrls = new Set(lastObservation.urls);
  const curUrls = new Set(links.map(l => l.href));
  const added = links.filter(l => !prevUrls.has(l.href)).slice(0, 10).map(l => (l.t || l.href).slice(0, 60));
  const removed = lastObservation.urls.filter(u => !curUrls.has(u)).length;
  if (added.length) change.added_links = added;
  if (removed) change.removed_links = removed;
  if (lastObservation.url !== payload.url) change.url = lastObservation.url + " -> " + payload.url;
  if (lastObservation.textLength !== payload.pageText.length) {
    change.text_length = lastObservation.textLength + " -> " + payload.pageText.length;
  }
  const ins = insertedText(lastObservation.text, payload.pageText);
  if (ins) change.new_text = ins;
  return Object.keys(change).length ? change : undefined;
}

function rememberObservation(links, payload) {
  lastObservation = {
    url: payload.url,
    urls: links.map(l => l.href),
    text: payload.pageText,
    textLength: payload.pageText.length
  };
}

function scrollState() {
  const el = document.documentElement;
  const max = el.scrollHeight - window.innerHeight;
  return {
    canScrollDown: max > 2 && window.scrollY < max - 2,
    canScrollUp: window.scrollY > 2
  };
}

function findSiteSearch() {
  const inputs = document.querySelectorAll('input[type="search"], form[role="search"] input, input[name*="search" i], input[name*="cerca" i], input[placeholder*="cerca" i], input[placeholder*="search" i]');
  for (const input of inputs) {
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'search', ''] .includes(type)) continue;
    const rect = input.getBoundingClientRect();
    const style = window.getComputedStyle(input);
    if (rect.width < 40 || rect.height < 8) continue;
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (input.disabled || input.readOnly) continue;
    const form = input.form || input.closest('form');
    const submit = (form && form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')) || null;
    return { input: input, submit: submit };
  }
  return null;
}

function siteSearchPayload() {
  const found = findSiteSearch();
  if (!found) return null;
  if (!found.input.getAttribute('data-a11y-id')) found.input.setAttribute('data-a11y-id', 's-input');
  let submitId = "";
  if (found.submit) {
    if (!found.submit.getAttribute('data-a11y-id')) found.submit.setAttribute('data-a11y-id', 's-submit');
    submitId = found.submit.getAttribute('data-a11y-id');
  }
  return { inputId: found.input.getAttribute('data-a11y-id'), submitId: submitId };
}

function pagePayload() {
  const sc = scrollState();
  return {
    url: stripTracking(location.href),
    title: document.title,
    pageText: collectPageText(),
    dialogs: collectDialogs(),
    search: siteSearchPayload(),
    canScrollDown: sc.canScrollDown,
    canScrollUp: sc.canScrollUp
  };
}

function sendBrowseStep() {
  const payload = pagePayload();
  const links = collectLinks();
  console.info("[a11y-nav] osservazione link:", links.length);
  if (links.length === 0) {
    console.info("[a11y-nav] nessun link utile qui: chiedo al servizio un ripiego.");
  }
  const change = computeChange(links, payload);
  rememberObservation(links, payload);
  chrome.runtime.sendMessage({
    action: "browse_step",
    links: links,
    url: payload.url,
    title: payload.title,
    pageText: payload.pageText,
    dialogs: payload.dialogs,
    search: payload.search,
    repeated: repeatedLinkTexts(links),
    change: change,
    canScrollDown: payload.canScrollDown,
    canScrollUp: payload.canScrollUp
  }, handleBrowseResponse);
}

function startMission(query, status) {
  const payload = pagePayload();
  const links = collectLinks(query);
  console.info("[a11y-nav] avvio esplorazione:", query, "link:", links.length);
  if (links.length === 0) {
    status.textContent = "Nessun link da seguire in questa pagina.";
    return;
  }
  lastObservation = null;
  status.textContent = "Avvio esplorazione...";
  chrome.runtime.sendMessage({
    action: "browse_start",
    query: query,
    links: links,
    url: payload.url,
    title: payload.title,
    pageText: payload.pageText,
    dialogs: payload.dialogs,
    search: payload.search,
    canScrollDown: payload.canScrollDown,
    canScrollUp: payload.canScrollUp
  }, handleBrowseResponse);
}

function continueMission(mission) {
  showMissionBar(`Passo ${mission.step} · ${mission.original} <button id="a11y-stop-btn" type="button">Interrompi</button><div id="a11y-status" role="status" aria-live="polite">Continuo l'esplorazione...</div>`);
  if (missionTimer) clearTimeout(missionTimer);
  missionTimer = setTimeout(() => {
    sendBrowseStep();
  }, 900);
}

function showMissionBar(html) {
  removeOverlay();
  overlay = document.createElement('div');
  overlay.id = "a11y-nav-overlay";
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Esplorazione assistita da AI in corso');
  overlay.innerHTML = `<div class="a11y-container"><div id="a11y-mission">${html}</div></div>`;
  document.body.appendChild(overlay);
  const stopBtn = document.getElementById('a11y-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', () => { stopMission(true); removeOverlay(); });
  document.addEventListener('keydown', missionEscHandler);
}

function missionEscHandler(e) {
  if (e.key === 'Escape') {
    stopMission(true);
    removeOverlay();
    document.removeEventListener('keydown', missionEscHandler);
  }
}

function stopMission(notify) {
  if (missionTimer) { clearTimeout(missionTimer); missionTimer = null; }
  try {
    chrome.runtime.sendMessage({ action: "browse_stop" }, () => {});
  } catch (error) {
    console.warn("[a11y-nav] stop missione non inviato.", error);
  }
  if (notify) console.info("[a11y-nav] missione interrotta dall'utente.");
}

function handleBrowseResponse(response) {
  console.info("[a11y-nav] risposta esplorazione:", response, "errore:", chrome.runtime.lastError?.message);
  if (chrome.runtime.lastError || !response) {
    showMissionBar(`Errore estensione: ricarica la pagina e riprova.`);
    stopMission(false);
    return;
  }
  if (response.status === "search") {
    showMissionBar(`Passo ${response.step} · pagina sterile, cerco sul web... <button id="a11y-stop-btn" type="button">Interrompi</button>`);
    setTimeout(() => { location.href = response.href; }, 800);
    return;
  }
  if (response.status === "goto") {
    const alt = typeof response.alternatives === "number" && response.alternatives > 0 ? ` (${response.alternatives} alternative)` : "";
    const vars = Array.isArray(response.variants) && response.variants.length > 0 ? ` Cerco anche: ${response.variants.join(", ")}.` : "";
    showMissionBar(`Passo ${response.step} · vado a "${response.label}"${alt}.${vars} <button id="a11y-stop-btn" type="button">Interrompi</button>`);
    setTimeout(() => {
      const target = document.querySelector(`[data-a11y-id="${response.linkId}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (response.href && !/^mailto:/i.test(response.href)) {
        console.info("[a11y-nav] navigo direttamente a", response.href);
        location.href = response.href;
        return;
      }
      const fresh = document.querySelector(`[data-a11y-id="${response.linkId}"]`);
      const freshMail = fresh && /^mailto:/i.test(fresh.getAttribute('href') || '');
      if (fresh && fresh.click && !freshMail) {
        try {
          fresh.click();
        } catch (error) {
          console.warn("[a11y-nav] clic sintetico non riuscito.", error);
        }
      } else {
        sendBrowseStep();
      }
    }, 600);
    return;
  }
  if (response.status === "scroll_down" || response.status === "scroll_up") {
    showMissionBar(`Passo ${response.step} · scorro la pagina... <button id="a11y-stop-btn" type="button">Interrompi</button>`);
    window.scrollBy({ top: response.status === "scroll_down" ? 560 : -560, behavior: 'smooth' });
    setTimeout(() => sendBrowseStep(), 900);
    return;
  }
  if (response.status === "wait") {
    showMissionBar(`Passo ${response.step} · attendo il caricamento... <button id="a11y-stop-btn" type="button">Interrompi</button>`);
    setTimeout(() => sendBrowseStep(), 2000);
    return;
  }
  if (response.status === "search_site") {
    showMissionBar(`Passo ${response.step} · uso la ricerca del sito... <button id="a11y-stop-btn" type="button">Interrompi</button>`);
    setTimeout(() => {
      const input = document.querySelector(`[data-a11y-id="${response.inputId}"]`);
      if (!input) {
        console.warn("[a11y-nav] campo di ricerca non trovato, continuo con i link.");
        sendBrowseStep();
        return;
      }
      input.focus();
      input.value = response.text || "";
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const submit = response.submitId ? document.querySelector(`[data-a11y-id="${response.submitId}"]`) : null;
      if (submit && submit.click) {
        submit.click();
      } else if (input.form && input.form.requestSubmit) {
        input.form.requestSubmit();
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
      setTimeout(() => sendBrowseStep(), 1500);
    }, 700);
    return;
  }
  if (response.status === "done_email") {
    stopMission(false);
    showMissionBar(`Apro il programma email per "${response.label}"...`);
    setTimeout(() => {
      const target = document.querySelector(`[data-a11y-id="${response.linkId}"]`);
      if (target && target.click) target.click();
      else if (response.href) location.href = response.href;
      setTimeout(() => removeOverlay(), 2500);
    }, 600);
    return;
  }
  if (response.status === "pinpoint") {
    stopMission(false);
    showMissionBar(`Destinazione trovata al passo ${response.step}.<div id="a11y-status" role="status"></div>`);
    focusPageDestination(response.step);
    return;
  }
  if (response.status === "notfound") {
    showMissionBar(`Nessuna pagina pertinente trovata su questo sito.`);
    stopMission(false);
    return;
  }
  if (response.status === "stopped") {
    removeOverlay();
    return;
  }
  const hints = {
    no_links: "Nessun link da seguire. Missione interrotta.",
    no_key: "Chiave TypeSafe mancante: configurala nelle Opzioni.",
    no_session: "Memoria di sessione non disponibile in questo browser.",
    no_choice: "Nessun passo avanti trovato. Missione interrotta.",
    blocked: "Bloccato: nessuna operazione utile. Missione interrotta.",
    site_error: "La pagina mostra un errore. Missione interrotta.",
    loop: response.hint ? `Giro vizioso su "${response.hint}". Missione interrotta.` : "Giro vizioso. Missione interrotta.",
    error: response.hint ? `Errore del servizio (${response.hint}). Missione interrotta.` : "Errore del servizio. Missione interrotta."
  };
  showMissionBar(hints[response.reason] || "Esplorazione interrotta.");
  stopMission(false);
}

function queryTokens(query) {
  return (query || "").toLowerCase().split(/[^a-zà-ÿ0-9]+/i).filter(w => w.length > 2);
}

function scoreCandidate(text, tokens, fullQuery) {
  const low = (text || "").toLowerCase();
  let score = 0;
  const q = (fullQuery || "").toLowerCase().trim();
  if (q.length > 3 && low.includes(q)) score += 5;
  for (const tok of tokens) {
    if (!tok) continue;
    if (low === tok) score += 3;
    else if (low.includes(tok)) score += 2;
  }
  return score;
}

function rankNodesByQuery(nodes, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return nodes;
  return nodes
    .map((n, i) => ({ n: n, i: i, s: scoreCandidate(n.t, tokens, query) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map(e => e.n);
}

function rankLinksByQuery(nodes, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return nodes;
  return nodes
    .map((n, i) => {
      const base = scoreCandidate(n.t, tokens, query) + scoreCandidate(n.heading, tokens, query) * 0.8;
      return { n: n, i: i, s: base * zoneWeight(n.zone) };
    })
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map(e => e.n);
}

function getOptimizedAccessibilityNodes(query) {
  const rawElements = document.querySelectorAll(
    'a, button, input, select, textarea, h1, h2, h3, [role], [tabindex="0"], main, nav, header, footer, section'
  );

  const nodes = [];

  rawElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      (rect.width === 0 && rect.height === 0) ||
      el.hasAttribute('aria-hidden')
    ) {
      return;
    }

    let accessibleName = (
      el.getAttribute('aria-label') ||
      el.innerText ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      extraName(el) ||
      shareName(el) ||
      ''
    ).trim().replace(/\s+/g, ' ');

    if (!accessibleName && el.tagName !== 'INPUT') return;

    let role = el.getAttribute('role') || el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3'].includes(role)) role = 'heading';

    nodes.push({
      el: el,
      r: role,
      t: accessibleName,
      h: el.tagName === 'A' ? (el.getAttribute('href') || '') : '',
      zone: zoneOf(el),
      heading: sectionHeading(el)
    });
  });

  const ranked = rankNodesByQuery(nodes, query);
  let nodeCounter = 0;
  return ranked.map((n) => {
    if (!n.el.getAttribute('data-a11y-id')) {
      n.el.setAttribute('data-a11y-id', `p-${nodeCounter++}`);
    }
    return { id: n.el.getAttribute('data-a11y-id'), r: n.r, t: n.t, h: n.h, zone: n.zone, heading: n.heading };
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "open_input") createAccessibleInput();
});

(async () => {
  try {
    if (!chrome.storage || !chrome.storage.session) return;
    const stored = await chrome.storage.session.get("a11yMission");
    const mission = stored && stored.a11yMission;
    if (mission && mission.active) {
      console.info("[a11y-nav] missione attiva trovata, continuo al passo", mission.step + 1);
      continueMission(mission);
    }
  } catch (error) {
    console.warn("[a11y-nav] lettura missione fallita.", error);
  }
})();
