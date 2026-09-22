const STORAGE_KEY = "llmProviderConfig";
const SETTINGS_KEY = "a11ySettings";

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

function fillSettings(settings) {
  document.getElementById("max-steps").value = settings.maxSteps ? String(settings.maxSteps) : "";
  document.getElementById("excluded-sites").value = Array.isArray(settings.excludedSites) ? settings.excludedSites.join("\n") : "";
}

function readSettings() {
  const rawSteps = Number(document.getElementById("max-steps").value);
  const maxSteps = Number.isFinite(rawSteps) && rawSteps > 0 ? Math.floor(rawSteps) : 0;
  const excludedSites = document.getElementById("excluded-sites").value
    .split("\n")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return { maxSteps: maxSteps, excludedSites: excludedSites };
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

async function fetchAvailableModels(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/+$/, "");
  const response = await fetch(base + "/models", {
    method: "GET",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  if (!response.ok) throw new Error("l'endpoint ha risposto HTTP " + response.status);
  const data = await response.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map((m) => (typeof m?.id === "string" ? m.id.trim() : "")).filter(Boolean);
}

function renderModelOptions(models) {
  const datalist = document.getElementById("custom-model-list");
  datalist.textContent = "";
  for (const id of models) {
    const option = document.createElement("option");
    option.value = id;
    datalist.appendChild(option);
  }
}

async function detectModels() {
  const cfg = readForm();
  if (!cfg.baseUrl || !cfg.apiKey) {
    setStatus("Completa URL e chiave prima di rilevare i modelli.", true);
    return;
  }
  setStatus("Rilevamento modelli in corso…");
  try {
    const allowed = await requireHostPermission(cfg.baseUrl);
    if (!allowed) {
      setStatus("Accesso all'host negato: premi Salva e accetta il dialogo di Chrome.", true);
      return;
    }
    const models = await fetchAvailableModels(cfg.baseUrl, cfg.apiKey);
    if (models.length === 0) {
      setStatus("Nessun modello restituito dall'endpoint.", true);
      return;
    }
    renderModelOptions(models);
    if (!cfg.model) {
      document.getElementById("custom-model").value = models[0];
    }
    setStatus("Trovati " + models.length + " modelli. Primo: " + models[0] + ".");
  } catch (error) {
    console.error("Rilevamento modelli fallito:", error);
    setStatus("Rilevamento modelli fallito: " + error.message + "." + fetchHint(error), true);
  }
}

async function resolveTestModel(cfg) {
  if (cfg.model) return cfg.model;
  const models = await fetchAvailableModels(cfg.baseUrl, cfg.apiKey);
  if (models.length > 0) return models[0];
  return "auto";
}

async function testRefiner() {
  const cfg = readForm();
  if (!cfg.baseUrl || !cfg.apiKey) {
    setStatus("Completa URL e chiave del raffinamento. Il modello è facoltativo.", true);
    return;
  }
  setStatus("Prova del raffinamento in corso…");
  try {
    const allowed = await requireHostPermission(cfg.baseUrl);
    if (!allowed) {
      setStatus("Accesso all'host negato: premi Salva e accetta il dialogo di Chrome.", true);
      return;
    }
    const base = cfg.baseUrl.replace(/\/+$/, "");
    const model = await resolveTestModel(cfg);
    const response = await fetch(base + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        temperature: 0,
        messages: [{ role: "user", content: "Rispondi soltanto con: ok" }]
      })
    });
    if (!response.ok) throw new Error("l'endpoint ha risposto HTTP " + response.status);
    await response.json();
    setStatus("Connessione del raffinamento riuscita (modello: " + model + ").");
  } catch (error) {
    console.error("Prova del raffinamento fallita:", error);
    setStatus("Prova del raffinamento fallita: " + error.message + "." + fetchHint(error), true);
  }
}

async function ensureHostPermission(baseUrl) {
  const host = new URL(baseUrl).host;
  const pattern = `https://${host}/*`;
  try {
    const hasAccess = await chrome.permissions.contains({ origins: [pattern] });
    if (hasAccess) return "";
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (granted) return ` Accesso a ${host} consentito.`;
    return ` Accesso a ${host} negato: senza autorizzazione le richieste non andranno a buon fine; premi Salva e accetta il dialogo di Chrome, oppure concedilo da Dettagli estensione > Autorizzazioni sito.`;
  } catch (error) {
    console.warn("Accesso all'host non concesso: " + host, error);
    return ` Accesso a ${host} non concesso: senza autorizzazione le richieste non andranno a buon fine; concedilo dalle impostazioni estensione quando richiesto.`;
  }
}

async function requireHostPermission(baseUrl) {
  const host = new URL(baseUrl).host;
  const pattern = `https://${host}/*`;
  const hasAccess = await chrome.permissions.contains({ origins: [pattern] });
  if (hasAccess) return true;
  return await chrome.permissions.request({ origins: [pattern] });
}

function fetchHint(error) {
  if (error instanceof TypeError) {
    return " Controlla di aver premuto Salva e concesso l'accesso all'host, che l'URL inizi con https:// e sia raggiungibile con certificato valido.";
  }
  return "";
}

async function saveOptions() {
  const cfg = readForm();
  const refinerConfigured = Boolean(cfg.baseUrl || cfg.apiKey);
  if (refinerConfigured && (!cfg.baseUrl || !cfg.apiKey)) {
    setStatus("Per il raffinamento completa URL e chiave insieme, oppure lascia il blocco vuoto. Il modello è facoltativo.", true);
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
    await store.set({ [STORAGE_KEY]: cfg, [SETTINGS_KEY]: readSettings() });
    let note = "";
    if (refinerConfigured) {
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
    await store.remove([STORAGE_KEY, SETTINGS_KEY]);
    fillForm({});
    fillSettings({});
    setStatus("Valori predefiniti ripristinati.");
  } catch (error) {
    console.error("Errore durante il ripristino dei valori predefiniti:", error);
    setStatus("Errore durante il ripristino: " + error.message, true);
  }
}

async function clearShortcuts() {
  const store = localStore();
  if (!store) {
    failOutsideExtension();
    return;
  }
  try {
    await store.remove("a11yShortcuts");
    setStatus("Scorciatoie apprese cancellate.");
  } catch (error) {
    console.error("Errore durante la cancellazione delle scorciatoie:", error);
    setStatus("Errore durante la cancellazione: " + error.message, true);
  }
}

document.getElementById("test-jev-btn").addEventListener("click", testJev);
document.getElementById("test-llm-btn").addEventListener("click", testRefiner);
document.getElementById("detect-llm-btn").addEventListener("click", detectModels);
document.getElementById("save-btn").addEventListener("click", saveOptions);
document.getElementById("reset-btn").addEventListener("click", resetOptions);
document.getElementById("clear-shortcuts-btn").addEventListener("click", clearShortcuts);

(async () => {
  const store = localStore();
  if (!store) {
    failOutsideExtension();
    return;
  }
  try {
    const stored = await store.get([STORAGE_KEY, SETTINGS_KEY]);
    fillForm(stored[STORAGE_KEY] || {});
    fillSettings(stored[SETTINGS_KEY] || {});
  } catch (error) {
    console.error("Errore durante il caricamento delle opzioni:", error);
    setStatus("Errore durante il caricamento delle opzioni.", true);
  }
})();
