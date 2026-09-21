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
  const defaults = { provider: "jev", jevApiKey: "", baseUrl: "", apiKey: "", model: "" };
  try {
    const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const saved = stored[CONFIG_STORAGE_KEY] || {};
    const config = { ...defaults };
    if (saved.provider === "jev" || saved.provider === "openaiCompatible") config.provider = saved.provider;
    for (const field of ["jevApiKey", "baseUrl", "apiKey", "model"]) {
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

function parseSelectionJson(rawContent) {
  if (typeof rawContent !== "string") return null;
  const text = rawContent.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed.element_id !== "string") return null;
    return { choice: parsed.element_id.trim(), quality: extractQuality(parsed.match_quality) };
  } catch (error) {
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

async function selectWithOpenAICompatible(baseUrl, apiKey, model, refinedIntent, elements) {
  if (!baseUrl || !apiKey || !model) {
    console.warn("Endpoint personalizzato incompleto (URL, chiave o modello mancanti). Uso il fallback locale.");
    return { decision: null, quality: null };
  }
  const candidates = elements.map(el => `- ${el.id} | ruolo: ${el.r} | testo: "${el.t}"`).join("\n");
  let selection = null;
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
            content: `Sei il selettore degli elementi di una pagina web. In base alla destinazione cercata dall'utente, scegli l'elemento più adatto tra i candidati disponibili. Rispondi esclusivamente con un oggetto JSON valido nel formato esatto: {"element_id": "<id dell'elemento>", "match_quality": <intero da 0 a 3>}, dove match_quality misura la qualità della corrispondenza: 0 = nessuna plausibile, 1 = debole o ambigua, 2 = ragionevole, 3 = chiara e univoca. Non includere altro testo, spiegazioni o marcature di codice.`
          },
          {
            role: "user",
            content: `Destinazione cercata: "${refinedIntent}".\n\nCandidati disponibili:\n${candidates}`
          }
        ]
      })
    });
    if (!response.ok) throw new Error("Endpoint personalizzato ha risposto HTTP " + response.status);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    selection = parseSelectionJson(content);
  } catch (error) {
    console.error("Errore endpoint personalizzato:", error);
    if (error instanceof TypeError) {
      console.warn("Possibile blocco di rete: verifica URL e che l'accesso all'host sia stato concesso dalla pagina Opzioni.");
    }
  }
  const decision = selection ? { choice: selection.choice } : null;
  const quality = selection ? selection.quality : null;
  return { decision, quality };
}

async function handleNavigation(userQuery, elements) {
  let refinedIntent = userQuery;
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
      if (answer && answer.trim()) refinedIntent = answer.trim();
    } catch (e) {
      console.warn("Chrome AI local model non pronto. Uso query originale.", e);
    } finally {
      session?.destroy?.();
    }
  }

  const config = await loadLlmConfig();
  const selection = config.provider === "openaiCompatible"
    ? await selectWithOpenAICompatible(config.baseUrl, config.apiKey, config.model, refinedIntent, elements)
    : await selectWithSystemOne(config.jevApiKey, refinedIntent, elements);

  const decision = selection.decision;
  const quality = selection.quality;
  if (decision && decision.choice && elements.some(el => el.id === decision.choice)) {
    if (quality !== null && quality < MIN_MATCH_QUALITY) {
      console.warn("Corrispondenza ambigua (qualità " + quality + "). Navigazione bloccata.");
      return { targetId: null, ambiguous: true };
    }
    const chosenBy = config.provider === "openaiCompatible" ? "dal provider personalizzato" : "da TypeSafe Jev";
    console.info("Elemento scelto " + chosenBy + ":", decision.choice);
    return { targetId: decision.choice, ambiguous: false };
  }

  const fallback = elements.find(el => el.t.toLowerCase().includes(refinedIntent.toLowerCase()));
  console.info(fallback ? "Fallback locale selezionato:" : "Nessun risultato locale per:", fallback ? fallback.id : refinedIntent);
  return { targetId: fallback ? fallback.id : null, ambiguous: false };
}
