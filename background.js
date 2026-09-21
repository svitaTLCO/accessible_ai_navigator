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

  const TYPESAFE_API_KEY = "IL_TUO_TYPESAFE_API_KEY";
  const criteria = {};
  elements.forEach(el => { criteria[el.id] = `Ruolo: ${el.r}, Testo: "${el.t}"`; });

  let decision = null;
  let quality = null;
  const MIN_MATCH_QUALITY = 2;
  if (TYPESAFE_API_KEY === "IL_TUO_TYPESAFE_API_KEY") {
    console.warn("Chiave TypeSafe non configurata in background.js. Salto l'API e uso il fallback locale.");
  } else {
    try {
      const response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Authorization": `Bearer ${TYPESAFE_API_KEY}`,
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
      quality = typeof data.answers?.match_quality?.score === "number" ? data.answers.match_quality.score : null;
    } catch (error) {
      console.error("Errore TypeSafe Jev:", error);
    }
  }

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