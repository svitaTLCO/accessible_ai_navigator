const STORAGE_KEY = "llmProviderConfig";

const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", !!isError);
}

function localStore() {
  try {
    const store = typeof chrome !== "undefined" ? chrome.storage?.local : undefined;
    return store || null;
  } catch (error) {
    return null;
  }
}

function failOutsideExtension() {
  setStatus("Memoria dell'estensione non raggiungibile: apri questa pagina dalla voce \"Opzioni\" in chrome://extensions, non aprendo direttamente il file.", true);
}

function fillForm(cfg) {
  document.getElementById("jev-key").value = cfg.jevApiKey || "";
  document.getElementById("custom-url").value = cfg.baseUrl || "";
  document.getElementById("custom-key").value = cfg.apiKey || "";
  document.getElementById("custom-model").value = cfg.model || "";
}

function readForm() {
  return {
    jevApiKey: document.getElementById("jev-key").value.trim(),
    baseUrl: document.getElementById("custom-url").value.trim(),
    apiKey: document.getElementById("custom-key").value.trim(),
    model: document.getElementById("custom-model").value.trim()
  };
}

async function testJev() {
  const key = document.getElementById("jev-key").value.trim();
  if (!key) {
    setStatus("Inserisci prima la chiave TypeSafe.", true);
    return;
  }
  setStatus("Prova TypeSafe Jev in corso…");
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Prova di connessione del servizio di selezione.",
        model: "jev-latest",
        questions: {
          probe: {
            type: "choice",
            instructions: "Scegli una voce di prova.",
            criteria: { "prova-0": "Voce di prova A", "prova-1": "Voce di prova B" }
          }
        }
      })
    });
    if (!response.ok) throw new Error("il servizio ha risposto HTTP " + response.status);
    await response.json();
    setStatus("Connessione TypeSafe Jev riuscita.");
  } catch (error) {
    console.error("Prova TypeSafe Jev fallita:", error);
    setStatus("Prova TypeSafe Jev fallita: " + error.message + ".", true);
  }
}

async function testRefiner() {
  const cfg = readForm();
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    setStatus("Completa URL, chiave e modello del raffinamento.", true);
    return;
  }
  setStatus("Prova del raffinamento in corso…");
  try {
    const base = cfg.baseUrl.replace(/\/+$/, "");
    const response = await fetch(base + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [{ role: "user", content: "Rispondi soltanto con: ok" }]
      })
    });
    if (!response.ok) throw new Error("l'endpoint ha risposto HTTP " + response.status);
    await response.json();
    setStatus("Connessione del raffinamento riuscita.");
  } catch (error) {
    console.error("Prova del raffinamento fallita:", error);
    setStatus("Prova del raffinamento fallita: " + error.message + ".", true);
  }
}

async function ensureHostPermission(baseUrl) {
  const host = new URL(baseUrl).host;
  const pattern = `https://${host}/*`;
  try {
    const current = await chrome.permissions.contains({ origins: [pattern] });
    if (current[pattern]) return "";
    await chrome.permissions.request({ origins: [pattern] });
    return ` Accesso a ${host} consentito.`;
  } catch (error) {
    console.warn("Accesso all'host non concesso: " + host, error);
    return ` Accesso a ${host} non concesso: senza autorizzazione le richieste non andranno a buon fine; concedilo dalle impostazioni estensione quando richiesto.`;
  }
}

async function saveOptions() {
  const cfg = readForm();
  const filled = [cfg.baseUrl, cfg.apiKey, cfg.model].filter(Boolean).length;
  if (filled > 0 && filled < 3) {
    setStatus("Per il raffinamento completa URL, chiave e modello insieme, oppure lascia il blocco vuoto.", true);
    return;
  }
  if (cfg.baseUrl) {
    let url = null;
    try {
      url = new URL(cfg.baseUrl);
    } catch (error) {
      url = null;
    }
    if (!url || url.protocol !== "https:") {
      setStatus("L'URL di base deve iniziare con https://", true);
      return;
    }
  }
  const store = localStore();
  if (!store) {
    failOutsideExtension();
    return;
  }
  try {
    await store.set({ [STORAGE_KEY]: cfg });
    let note = "";
    if (filled === 3) {
      note = await ensureHostPermission(cfg.baseUrl);
    }
    setStatus("Opzioni salvate." + note);
  } catch (error) {
    console.error("Errore durante il salvataggio delle opzioni:", error);
    setStatus("Errore durante il salvataggio: " + error.message, true);
  }
}

async function resetOptions() {
  const store = localStore();
  if (!store) {
    failOutsideExtension();
    return;
  }
  try {
    await store.remove(STORAGE_KEY);
    fillForm({});
    setStatus("Valori predefiniti ripristinati.");
  } catch (error) {
    console.error("Errore durante il ripristino dei valori predefiniti:", error);
    setStatus("Errore durante il ripristino: " + error.message, true);
  }
}

document.getElementById("test-jev-btn").addEventListener("click", testJev);
document.getElementById("test-llm-btn").addEventListener("click", testRefiner);
document.getElementById("save-btn").addEventListener("click", saveOptions);
document.getElementById("reset-btn").addEventListener("click", resetOptions);

(async () => {
  const store = localStore();
  if (!store) {
    failOutsideExtension();
    return;
  }
  try {
    const stored = await store.get(STORAGE_KEY);
    fillForm(stored[STORAGE_KEY] || {});
  } catch (error) {
    console.error("Errore durante il caricamento delle opzioni:", error);
    setStatus("Errore durante il caricamento delle opzioni.", true);
  }
})();
