# Accessible AI Browser Navigator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](manifest.json)
[![No build step](https://img.shields.io/badge/build-none-success.svg)](#sviluppo)

Estensione Chrome (Manifest V3) che consente di navigare un sito web in linguaggio naturale e di atterrare sulla pagina giusta. Pensata per chi usa screen reader e navigazione da tastiera su siti la cui struttura è difficile da attraversare.

Descrivi una destinazione — *"il modulo contatti"*, *"la pagina del centralino VoIP"*, *"orari di apertura"* — e l'estensione esplora il sito collegamento per collegamento finché raggiunge la pagina di destinazione e la annuncia.

L'interfaccia del prodotto è in italiano; il codice in inglese. Questo documento è disponibile in **italiano** e in [inglese](README.en.md).

---

## Indice

- [Panoramica](#panoramica)
- [Funzionalità](#funzionalità)
- [Come funziona](#come-funziona)
- [Permessi e privacy](#permessi-e-privacy)
- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Uso](#uso)
- [Benchmark](#benchmark)
- [Struttura del progetto](#struttura-del-progetto)
- [Sviluppo](#sviluppo)
- [Contribuire](#contribuire)
- [Licenza](#licenza)

---

## Panoramica

L'estensione guida un modello decisionale — [TypeSafe System One ("Jev")](https://docs.typesafe.ai) — che risponde a **domande tipizzate** su una descrizione strutturata della pagina. Non c'è generazione libera da interpretare: ogni risposta è una scelta, un punteggio o una probabilità calibrata, e **tutta la logica di controllo resta nel codice**.

Partendo dalla pagina corrente, la missione **Naviga nel sito** è multi-passo: a ogni passo decide se cliccare un collegamento, scorrere, attendere, usare la ricerca interna del sito o fermarsi.

## Funzionalità

- **Navigazione in linguaggio naturale** — descrivi la destinazione e la missione percorre il sito fino a raggiungerla, partendo dalla pagina in cui ti trovi.
- **Navigazione nello stesso sito** — la missione fissa il dominio di partenza e non devia mai verso fornitori esterni collegati.
- **Consapevole della ricerca del sito** — quando un sito ha un campo di ricerca proprio, l'agente può digitare la richiesta e inviarla.
- **Navigazione resiliente** — clic sintetico con fallback di navigazione diretta; i collegamenti a file statici vengono saltati; i vicoli ciechi tornano alla migliore alternativa invece di fallire.
- **Ancoraggio semantico** — i collegamenti portano con sé la regione (`menu`, `testata`, `contenuto`, …), l'intestazione di sezione più vicina e il contesto di riga, così i collegamenti generici e quelli solo icona restano distinguibili.
- **Ranking comprensibile** — i candidati vengono riordinati nel codice in base ai termini *essenziali* della richiesta su testo + intestazione + contesto, pesati per regione.
- **Filtro di pertinenza** — una pagina fuori tema (o un bersaglio incerto) non viene cliccata; dopo alcuni passi sterili la missione termina con *"Nessuna pagina pertinente trovata"* invece di vagare.
- **Interfaccia accessibile prima di tutto** — overlay ad alto contrasto, stato ARIA live persistente annunciato a ogni passo, focus spostato sul controllo di arresto e ripristinato alla chiusura, Esc per fermarsi da qualsiasi punto, `lang="it"` sull'interfaccia, etichette visibili e indicatori di focus, scorrimento fluido che rispetta `prefers-reduced-motion`.
- **Nessun parametro di tracciamento** negli URL che segue.

## Come funziona

```
scorciatoia da tastiera ──▶ content.js: costruisce il modello pagina ──▶ background.js
                                                            │  espande la richiesta (intento, essenziali, varianti)
                                                            │  1 richiesta a Jev:  operation · click_target · section
                                                            │                      done · done_page · error
                                                            │                      relevance · on_topic
                                                            ▼
                                            il codice decide (filtri, ranking, frontier, backtrack)
                                                            ▼
                                     content.js: clic / scorrimento / ricerca / focus sull'intestazione
```

- `content.js` costruisce un modello compatto della pagina (collegamenti visibili con regione, intestazione di sezione e contesto di riga; testo principale; dialoghi aperti; campo di ricerca del sito) e contrassegna gli elementi con `data-a11y-id`.
- `background.js` esegue una richiesta System One per passo, raggruppa molte domande atomiche in essa e compone le risposte tipizzate con regole deterministiche. La selezione è delegata a Jev; tutto il resto — tempi, limiti, filtri di sicurezza, protezioni dal loop — è codice.
- La missione vive in `chrome.storage.session` (mai sincronizzata) e viene cancellata a stop / done / stuck.

## Permessi e privacy

Il manifest non richiede **nessuna voce `permissions`**.

| Ambito | Valore | Perché |
|---|---|---|
| `host_permissions` | `https://api.typesafe.ai/*` | Il motore di selezione. |
| `host_permissions` | `https://api.openai.com/*` | Solo se lo configuri come raffinatore di frase facoltativo. |
| `optional_host_permissions` | `https://*/*` | Richiesto al salvataggio, limitato all'host esatto che digiti, solo per un endpoint di raffinamento personalizzato. |

Flusso dei dati:

- La frase digitata e i **testi/collegamenti visibili della pagina** (ordinati per pertinenza) vengono inviati al motore di selezione per scegliere il collegamento.
- Se la pagina offre una **ricerca interna**, l'estensione può digitare la tua richiesta in quel campo e inviarla — in quel caso la richiesta va al sito visitato, esattamente come se l'avessi digitata tu.
- Se configuri un **raffinatore facoltativo** (compatibile OpenAI), la frase digitata può esservi inviata prima.
- La missione (obiettivo, passo, pagine visitate) resta solo nella sessione del browser e viene eliminata quando la missione termina.
- Le chiavi API si inseriscono nella pagina delle opzioni e sono salvate solo in `chrome.storage.local` del tuo profilo browser — mai sincronizzate, mai registrate nei log, mai inviate agli script di contenuto.
- Dove il browser lo supporta, parte dell'espansione della richiesta avviene **sul dispositivo** (`LanguageModel` / `aiLanguageModel`).

## Requisiti

- Chrome (o un browser basato su Chromium) con Manifest V3 e, per la navigazione multi-passo, accesso a `chrome.storage.session` dagli script di contenuto.
- Una chiave API TypeSafe Jev (per il motore di selezione). Il modello sul dispositivo e il raffinatore facoltativo sono fallback, non requisiti.
- Nessuna build, nessuna dipendenza.

## Installazione

1. Clona il repository.
2. Apri `chrome://extensions`.
3. Attiva la **Modalità sviluppatore**.
4. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella del repository.
5. Dopo aver modificato i file, premi **Ricarica** sulla scheda dell'estensione; le modifiche agli script di contenuto richiedono anche il ricaricamento della pagina di destinazione.

## Configurazione

Apri la pagina **Opzioni** dell'estensione:

- **Chiave API TypeSafe Jev** — necessaria per la navigazione.
- **Raffinatore facoltativo** — un endpoint compatibile OpenAI (URL di base + chiave, modello facoltativo con rilevamento automatico tramite `GET /models`) usato solo per riscrivere la frase prima della selezione.

## Uso

- Premi **Ctrl+Shift+Y** (**Cmd+Shift+Y** su macOS) per aprire la barra di navigazione.
- Digita la destinazione e premi **Invio**, oppure clicca **Naviga nel sito**, per avviare la missione di navigazione multi-passo.
- **Esc** o **Interrompi** ferma una missione.

## Benchmark

Un benchmark autonomo e senza dipendenze pilota il vero `background.js` contro **siti pubblici complessi e dal vivo** con verifiche dell'URL atteso, in livelli di difficoltà da 1 a 5.

```bash
node bench/run.mjs               # tutti i livelli
node bench/run.mjs --tier 4      # un livello di difficoltà
node bench/run.mjs --only R5,R8  # attività specifiche
```

La chiave Jev si legge da `TYPESAFE_API_KEY` o, su macOS, dal Portachiavi (`typesafe-api-key`). I siti dal vivo cambiano, quindi un fallimento può dipendere dal sito più che dall'agente — ogni riga stampa l'URL effettivamente raggiunto.

Punteggio attuale: **12/12** su MDN, python.org, mozilla.org, gnu.org, Wikipedia e books.toscrape, incluse le protezioni per fuori sito, mailto e parametri di tracciamento.

## Struttura del progetto

```
manifest.json      manifest MV3
background.js      service worker: espansione della richiesta, chiamate a Jev, loop di navigazione
content.js         modello pagina, interfaccia overlay, azioni (clic / scorrimento / ricerca / focus)
options.html/.js/.css  pagina delle opzioni (chiave Jev, raffinatore facoltativo)
styles.css         stile dell'overlay ad alto contrasto
bench/             benchmark su siti dal vivo (run.mjs) e attività (tasks.mjs)
AGENTS.md          note di architettura per contributori/agenti
```

## Sviluppo

- Nessun gestore di pacchetti, nessun bundler, nessuna configurazione di lint: JS + CSS puri caricati direttamente da Chrome.
- Mantieni MV3, `async/await` (niente catene `.then()`), permessi minimi e gestione degli errori su ogni operazione asincrona.
- Vedi **[AGENTS.md](AGENTS.md)** per il flusso completo dei messaggi, il filtro di pertinenza, i limiti e gli invarianti.
- Esegui il benchmark dopo aver modificato qualsiasi filtro di navigazione.

## Contribuire

Issue e pull request sono benvenute. Mantieni le modifiche piccole e verificale con il benchmark (`node bench/run.mjs`) quando toccano il comportamento di navigazione.

## Licenza

[MIT](LICENSE).
