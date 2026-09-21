# Chrome Web Store Listing — Accessible AI Browser Navigator

> Last Updated: 2026-09-21

## Store Listing

**Extension Name** [REQUIRED]
Accessible AI Browser Navigator

**Short Description** [REQUIRED]
Naviga una pagina in linguaggio naturale: descrivi la destinazione e vai direttamente all'elemento giusto.

**Detailed Description** [REQUIRED]

Accessible AI Browser Navigator ti permette di muoverti in una pagina web descrivendo a parole dove vuoi andare.

Dalla parte alta della pagina appare una barra di digitazione accessibile, ad alto contrasto. Scrivi una destinazione in linguaggio naturale (ad esempio "contatti" o "carrello") e l'estensione individua l'elemento corrispondente, lo porta al centro dello schermo e gli assegna il focus, così puoi continuare a lavorare con la tastiera o con uno screen reader.

Come si usa: premi Ctrl+Shift+Y (Cmd+Shift+Y su Mac) per aprire la barra, digita la destinazione e premi Invio. Premi Esc per chiuderla. Se nessun elemento corrisponde, la barra te lo comunica.

Privacy: per scegliere l'elemento, la frase digitata e un elenco limitato dei testi visibili nella pagina (massimo 60 voci, ognuna troncata a 60 caratteri) vengono sempre inviati a TypeSafe, che è l'unico motore di selezione. Inoltre, solo se l'utente configura nella pagina Opzioni un proprio servizio di raffinamento del testo (compatibile OpenAI), la sola frase digitata può essere inviata anche a quel servizio prima della selezione, per riformulare la richiesta, usando esclusivamente le chiavi da lui inserite. Nessuna informazione viene raccolta oltre a quella necessaria alla funzione; le chiavi configurate restano salvate soltanto nel profilo del browser. Dove il browser lo consente, una parte dell'elaborazione avviene localmente nel dispositivo.

Segnalazioni e suggerimenti: s.vita@tlco.it [VERIFICA]

**Category** [REQUIRED]
Accessibility

**Single Purpose** [REQUIRED]
Guida l'utente a un elemento della pagina tramite una descrizione in linguaggio naturale, con overlay accessibile ad alto contrasto.

**Primary Language** [REQUIRED]
Italian

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ⬜ Not created | |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes

- Screenshot 1: barra di navigazione attiva su una reale pagina web, destinazione digitata, elemento risultante evidenziato al centro.
- Screenshot 2 (consigliata): stato "Nessun elemento trovato" per mostrare i messaggi di feedback.
- Manifest non dichiara icone: generare le sole icone richieste dallo store (128×128 per il tile; icone applicative facoltative).

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `https://api.typesafe.ai/*` | host_permissions | Invia l'elenco degli elementi visibili della pagina corrente (ruolo ARIA + testo troncato a 60 caratteri, massimo 60 voci) insieme alla frase di destinazione digitata dall'utente al motore decisionale TypeSafe (Jev), che restituisce l'identificativo dell'elemento da raggiungere. È il motore predefinito; nessun endpoint di rete viene chiamato finché l'utente non configura diversamente nelle Opzioni. |
| `https://api.openai.com/*` | host_permissions | Usato solo se l'utente lo configura come servizio di raffinamento della frase dalla pagina Opzioni: qui viaggia SOLO la frase digitata (mai la lista degli elementi né la selezione finale), autenticata unicamente con la chiave inserita dall'utente. Non viene mai chiamato automaticamente. |
| `https://*/*` | optional_host_permissions | Non richiesta né attiva di default. Solo dopo che l'utente salva un endpoint personalizzato, l'estensione chiede tramite il dialogo standard di consenso di Chrome l'accesso limitato all'host digitato (pattern `https://<host>/*`), necessario per inviare la richiesta di raffinamento all'endpoint scelto. Può essere rifiutata e revocata in ogni momento dalle impostazioni estensione. |

Note: le permission `activeTab` e `scripting` erano dichiarate ma non utilizzate dal codice e sono state rimosse (messaging verso i propri content script non richiede permessi). Lo script di contenuto è registrato staticamente nel manifest. La permission sperimentale `aiLanguageModel` non è dichiarata: la documentazione corrente indica che l'API del modello on-device non richiede permission nel manifest, e alcuni build di Chrome segnalano quella stringa come sconosciuta con un avviso. Il codice rileva l'API al runtime e degrada elegantemente quando assente.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | | |
| Health info | No | No | | |
| Financial info | No | No | | |
| Authentication info | No | No | | |
| Personal communications | No | No | | |
| Location | No | No | | |
| Web history | No | No | | |
| User activity | Sì — la frase digitata come destinazione di navigazione | Sì | Funzione centrale: far scegliere l'elemento di destinazione | Sì — TypeSafe AI (motore predefinito), oppure l'endpoint personale configurato dall'utente nelle Opzioni |
| Website content | Sì — ruoli ARIA e nomi accessibili degli elementi interattivi visibili nella pagina corrente (max 60 voci, testi troncati a 60 caratteri) | Sì | Funzione centrale: costruire l'insieme di candidati da cui selezionare l'elemento | Sì — TypeSafe AI (motore predefinito), oppure l'endpoint personale configurato dall'utente nelle Opzioni |

L'unica informazione persistita è la configurazione delle Opzioni (chiave TypeSafe e, se presente, URL, chiave e modello dell'endpoint personale), salvata in `chrome.storage.local` del profilo del browser: non è mai sincronizzata e non viene trasmessa ad alcun servizio oltre all'endpoint selezionato. Il raffinamento on-device (dove disponibile) elabora solo la frase digitata, localmente.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
[DA PUBBLICARE — obbligatorio prima della sottomissione; deve essere coerente con la tabella qui sopra]

## Distribution

**Visibility**: Private (non ancora sottomesso allo store)
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
SandroTLCO [VERIFICA]

**Contact Email** [REQUIRED]
s.vita@tlco.it [VERIFICA — deve essere monitorato: Google invia notifiche importanti a questa casella]

**Support URL / Email** [RECOMMENDED]
s.vita@tlco.it

**Homepage URL** [RECOMMENDED]
[da definire]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.0 | 2026-09-21 | Pagina Opzioni: immissione locale della chiave TypeSafe e configurazione facoltativa di un servizio di raffinamento della frase compatibile OpenAI (salvati in `chrome.storage.local`, mai sincronizzati); permessi host ridotti ai preset con concessione opt-in per gli host personalizzati; navigazione bloccata con messaggio dedicato quando il motore valuta ambigua la corrispondenza. | Draft |
| 1.0.0 | 2026-09-21 | Implementazione iniziale: navigazione assistita verso elementi di pagina tramite query in linguaggio naturale, overlay ad alto contrasto, raffinamento on-device opzionale, fallback locale. | Draft |

## Review Notes

### Known Issues / Limitations

- Le chiavi API (TypeSafe e, facoltativamente, quella dell'endpoint personale) non fanno parte del repository: si inseriscono dalla pagina Opzioni e restano soltanto in `chrome.storage.local` del profilo del browser; non devono mai essere committate né condivise.
- Il raffinamento on-device richiede un build recente di Chrome che esponga l'API `LanguageModel`; ovunque altrove il percorso degrada elegantemente (query originale → API remota → matching locale).
- I content script girano su tutti i siti per definizione del prodotto (la destinazione può essere qualsiasi pagina): quando l'utente invia una query, l'elenco degli elementi viaggia sempre verso il motore di selezione (`api.typesafe.ai`), mentre la frase digitata può, se configurato, passare prima attraverso l'endpoint di raffinamento scelto nelle Opzioni. Da mantenere coerente con disclosure e privacy policy.
- Prima della sottomissione vanno creati icona store e almeno uno screenshot (vedi tabella asset).
- Per il ZIP di sottomissione escludere `.git/`, `CHROMEWEBSTORE.md` e qualsiasi file di sviluppo; includere solo `manifest.json`, `background.js`, `content.js`, `styles.css`, `options.html`, `options.css`, `options.js` (+ eventuali asset).
