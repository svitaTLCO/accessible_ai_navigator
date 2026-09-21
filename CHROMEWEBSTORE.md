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

Privacy: per scegliere l'elemento, la frase digitata e un elenco limitato dei testi visibili nella pagina (massimo 60 voci, ognuna troncata a 60 caratteri) vengono inviati al servizio di analisi TypeSafe. Nessun altro dato viene raccolto, memorizzato o condiviso. Dove il browser lo consente, una parte dell'elaborazione avviene localmente nel dispositivo.

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
| `aiLanguageModel` | permissions | Consumato solo dai browser che espongono il modello on-device integrato: raffina localmente la frase digitata in una parola chiave prima della selezione. Nessun dato lascia il dispositivo attraverso questo percorso; sui browser senza l'API l'estensione funziona identicamente senza di essa. |
| `https://api.typesafe.ai/*` | host_permissions | Invia l'elenco degli elementi visibili della pagina corrente (ruolo ARIA + testo troncato a 60 caratteri, massimo 60 voci) insieme alla frase di destinazione digitata dall'utente al motore decisionale TypeSafe (Jev), che restituisce l'identificativo dell'elemento da raggiungere. Nessun altro endpoint di rete viene chiamato. |

Note: le permission `activeTab` e `scripting` erano dichiarate ma non utilizzate dal codice e sono state rimosse (messaging verso i propri content script non richiede permessi). Lo script di contenuto è registrato staticamente nel manifest.

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
| User activity | Sì — la frase digitata come destinazione di navigazione | Sì | Funzione centrale: far scegliere l'elemento di destinazione | Sì — TypeSafe AI (fornitore del motore decisionale) |
| Website content | Sì — ruoli ARIA e nomi accessibili degli elementi interattivi visibili nella pagina corrente (max 60 voci, testi troncati a 60 caratteri) | Sì | Funzione centrale: costruire l'insieme di candidati da cui selezionare l'elemento | Sì — TypeSafe AI (fornitore del motore decisionale) |

Nessun dato viene persistito nell'estensione o in `chrome.storage`. Il raffinamento on-device (dove disponibile) elabora solo la frase digitata, localmente.

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
| 1.0.0 | 2026-09-21 | Implementazione iniziale: navigazione assistita verso elementi di pagina tramite query in linguaggio naturale, overlay ad alto contrasto, raffinamento on-device opzionale, fallback locale. | Draft |

## Review Notes

### Known Issues / Limitations

- La chiave API TypeSafe è un segnaposto nel repository (`IL_TUO_TYPESAFE_API_KEY` in `background.js`): va fornita localmente prima di ogni test e non deve mai essere committata.
- Il raffinamento on-device richiede un build recente di Chrome che esponga l'API `LanguageModel`; ovunque altrove il percorso degrada elegantemente (query originale → API remota → matching locale).
- I content script girano su tutti i siti per definizione del prodotto (la destinazione può essere qualsiasi pagina): quando l'utente invia una query, i testi visibili viaggiano verso `api.typesafe.ai`. Da mantenere coerente con disclosure e privacy policy.
- Prima della sottomissione vanno creati icona store e almeno uno screenshot (vedi tabella asset).
- Per il ZIP di sottomissione escludere `.git/`, `CHROMEWEBSTORE.md` e qualsiasi file di sviluppo; includere solo `manifest.json`, `background.js`, `content.js`, `styles.css` (+ eventuali asset).
