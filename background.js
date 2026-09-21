chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-navigation-input") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "open_input" });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "navigate_to_point") {
    (async () => {
      try {
        const result = await handleNavigation(request.query, request.elements);
        if (result.targetId) {
          sendResponse({ success: true, targetId: result.targetId });
        } else if (result.ambiguous) {
          sendResponse({ success: false, reason: "ambiguous" });
        } else {
          sendResponse({ success: false });
        }
      } catch (err) {
        console.error(err);
        sendResponse({ success: false });
      }
    })();
    return true;
  }
});

const MIN_MATCH_QUALITY = 2;
const CONFIG_STORAGE_KEY = "llmProviderConfig";

async function loadLlmConfig() {
  const defaults = { jevApiKey: "", baseUrl: "", apiKey: "", model: "" };
  try {
    const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const saved = stored[CONFIG_STORAGE_KEY] || {};
    const config = { ...defaults };
    for (const field of Object.keys(defaults)) {
      if (typeof saved[field] === "string") config[field] = saved[field].trim();
    }
    if (config.baseUrl && !/^https:\/\//.test(config.baseUrl)) config.baseUrl = "";
    return config;
  } catch (error) {
    console.warn("Configurazione non leggibile. Uso i valori predefiniti.", error);
    return defaults;
  }
}

function extractQuality(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function refineWithCloudLlm(baseUrl, apiKey, model, query) {
  if (!baseUrl || !apiKey || !model) return null;
  try {
    const response = await fetch(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "Estrai l'intenzione semantica principale o la parola chiave da una richiesta di navigazione web. Rispondi solo con la parola chiave, senza altre parole."
          },
          { role: "user", content: query }
        ]
      })
    });
    if (!response.ok) throw new Error("Il servizio di raffinamento ha risposto HTTP " + response.status);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const refined = content
      .replace(/^[\s"'`]+/, "")
      .replace(/[\s"'`]+$/, "")
      .split("\n")[0]
      .trim();
    return refined || null;
  } catch (error) {
    console.warn("Raffinamento cloud non riuscito. Uso la query precedente.", error);
    return null;
  }
}

async function selectWithSystemOne(apiKey, refinedIntent, elements) {
  const criteria = {};
  elements.forEach(el => { criteria[el.id] = `Ruolo: ${el.r}, Testo: "${el.t}"`; });
  if (!apiKey) {
    console.warn("Chiave TypeSafe non configurata. Salto l'API e uso il fallback locale.");
    return { decision: null, quality: null };
  }
  let decision = null;
  let quality = null;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: `L'utente vuole navigare verso un elemento correlato a: "${refinedIntent}". Scegli l'elemento corretto dalla lista.`,
        model: "jev-latest",
        questions: {
          target_element: {
            type: "choice",
            instructions: "Quale ID di elemento corrisponde meglio alla destinazione cercata dall'utente?",
            criteria: criteria
          },
          match_quality: {
            type: "score",
            instructions: "Valuta quanto la destinazione cercata dall'utente corrisponde in modo chiaro e univoco al miglior elemento disponibile nella lista.",
            criteria: [
              "nessuna corrispondenza plausibile",
              "corrispondenza debole o ambigua",
              "corrispondenza ragionevole",
              "corrispondenza chiara e univoca"
            ]
          }
        }
      })
    });
    if (!response.ok) throw new Error("TypeSafe Jev ha risposto HTTP " + response.status);
    const data = await response.json();
    decision = data.answers?.target_element;
    quality = extractQuality(data.answers?.match_quality?.score);
  } catch (error) {
    console.error("Errore TypeSafe Jev:", error);
  }
  return { decision, quality };
}

async function handleNavigation(userQuery, elements) {
  let refinedIntent = userQuery;
  let localRefined = false;
  const localModel = typeof LanguageModel !== 'undefined'
    ? LanguageModel
    : (typeof aiLanguageModel !== 'undefined' ? aiLanguageModel : undefined);
  if (localModel) {
    let session;
    try {
      session = await localModel.create();
      const answer = await session.prompt(
        `Estrai l'intenzione semantica principale o la parola chiave da questa richiesta di navigazione web: "${userQuery}". Rispondi solo con la parola chiave.`
      );
      if (answer && answer.trim()) {
        refinedIntent = answer.trim();
        localRefined = true;
      }
    } catch (e) {
      console.warn("Chrome AI local model non pronto. Uso query originale.", e);
    } finally {
      session?.destroy?.();
    }
  }

  const config = await loadLlmConfig();
  if (!localRefined) {
    const cloudKeyword = await refineWithCloudLlm(config.baseUrl, config.apiKey, config.model, refinedIntent);
    if (cloudKeyword) refinedIntent = cloudKeyword;
  }

  const { decision, quality } = await selectWithSystemOne(config.jevApiKey, refinedIntent, elements);
  if (decision && decision.choice && elements.some(el => el.id === decision.choice)) {
    if (quality !== null && quality < MIN_MATCH_QUALITY) {
      console.warn("Corrispondenza ambigua (qualità " + quality + "). Navigazione bloccata.");
      return { targetId: null, ambiguous: true };
    }
    console.info("Elemento scelto da TypeSafe Jev:", decision.choice);
    return { targetId: decision.choice, ambiguous: false };
  }

  const fallback = elements.find(el => el.t.toLowerCase().includes(refinedIntent.toLowerCase()));
  console.info(fallback ? "Fallback locale selezionato:" : "Nessun risultato locale per:", fallback ? fallback.id : refinedIntent);
  return { targetId: fallback ? fallback.id : null, ambiguous: false };
}
