const STORAGE_KEY = "llmProviderConfig";

const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", !!isError);
}

function selectedProvider() {
  return document.querySelector('input[name="provider"]:checked').value;
}

function fillForm(cfg) {
  const provider = cfg.provider === "openaiCompatible" ? "openaiCompatible" : "jev";
  document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
  toggleSections(provider);
  document.getElementById("jev-key").value = cfg.jevApiKey || "";
  document.getElementById("custom-url").value = cfg.baseUrl || "";
  document.getElementById("custom-key").value = cfg.apiKey || "";
  document.getElementById("custom-model").value = cfg.model || "";
}

function toggleSections(provider) {
  document.getElementById("section-jev").hidden = provider !== "jev";
  document.getElementById("section-custom").hidden = provider !== "openaiCompatible";
}

function readForm() {
  return {
    provider: selectedProvider(),
    jevApiKey: document.getElementById("jev-key").value.trim(),
    baseUrl: document.getElementById("custom-url").value.trim(),
    apiKey: document.getElementById("custom-key").value.trim(),
    model: document.getElementById("custom-model").value.trim()
  };
}

document.querySelectorAll('input[name="provider"]').forEach(radio => {
  radio.addEventListener("change", () => toggleSections(radio.value));
});

async function testConnection() {
  const cfg = readForm();
  setStatus("Prova in corso…");
  try {
    if (cfg.provider === "jev") {
      if (!cfg.jevApiKey) throw new Error("inserisci prima la chiave TypeSafe");
      const response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Authorization": `Bearer ${cfg.jevApiKey}`,
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
    } else {
      if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) throw new Error("completa URL, chiave e modello");
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
      setStatus("Connessione all'endpoint personalizzato riuscita.");
    }
  } catch (error) {
    console.error("Prova di connessione fallita:", error);
    setStatus("Prova fallita: " + error.message + ".", true);
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
  if (cfg.provider === "openaiCompatible") {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      setStatus("Completa URL, chiave API e modello per l'endpoint personalizzato.", true);
      return;
    }
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
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: cfg });
    let note = "";
    if (cfg.provider === "openaiCompatible") {
      note = await ensureHostPermission(cfg.baseUrl);
    }
    setStatus("Opzioni salvate." + note);
  } catch (error) {
    console.error("Errore durante il salvataggio delle opzioni:", error);
    setStatus("Errore durante il salvataggio: " + error.message, true);
  }
}

async function resetOptions() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    fillForm({});
    setStatus("Valori predefiniti ripristinati.");
  } catch (error) {
    console.error("Errore durante il ripristino dei valori predefiniti:", error);
    setStatus("Errore durante il ripristino: " + error.message, true);
  }
}

document.getElementById("test-btn").addEventListener("click", testConnection);
document.getElementById("save-btn").addEventListener("click", saveOptions);
document.getElementById("reset-btn").addEventListener("click", resetOptions);

(async () => {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    fillForm(stored[STORAGE_KEY] || {});
  } catch (error) {
    console.error("Errore durante il caricamento delle opzioni:", error);
    setStatus("Errore durante il caricamento delle opzioni.", true);
  }
})();
