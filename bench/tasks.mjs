// Real-website tasks for the Jev navigator benchmark, ordered by difficulty.
// Sites are large, public, vendor-neutral and structurally complex (MDN, Python,
// Mozilla, GNU, Wikipedia, Debian, books.toscrape).
//
// start: URL the agent begins on. goal: what the user would type.
// expect: ground-truth check on the live site.
//   landed       -> some visited/final URL contains the string
//   avoided      -> NO visited/final URL contains the string (must not happen)
//   noFalseFound -> must not claim success or navigate on a nonsense goal
// searchUrl: optional (q) => url, used when the agent chooses the site's own search.

export const TASKS = [
  {
    id: "R1-mdn-javascript", tier: 1, mode: "browse",
    start: "https://developer.mozilla.org/en-US/",
    goal: "la documentazione di JavaScript",
    expect: { kind: "landed", includes: "/en-US/docs/Web/JavaScript" }, maxSteps: 4,
    note: "portale enorme con menu e riferimenti incrociati"
  },
  {
    id: "R2-books-category", tier: 1, mode: "browse",
    start: "https://books.toscrape.com/",
    goal: "i libri di poesia",
    expect: { kind: "landed", includes: "poetry_23" }, maxSteps: 4,
    note: "categoria in un menu laterale"
  },
  {
    id: "R3-python-download", tier: 2, mode: "browse",
    start: "https://www.python.org/",
    goal: "scaricare Python",
    expect: { kind: "landed", includes: "/downloads" }, maxSteps: 4,
    note: "voce di menu con piu' varianti di download"
  },
  {
    id: "R4-mozilla-product", tier: 2, mode: "browse",
    start: "https://www.mozilla.org/en-US/",
    goal: "Mozilla Monitor",
    expect: { kind: "landed", includes: "/en-US/products/monitor/" }, maxSteps: 4,
    note: "pagina di prodotto specifica tra molte simili"
  },
  {
    id: "R5-wikipedia-ml", tier: 3, mode: "browse",
    start: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    goal: "machine learning",
    expect: { kind: "landed", includes: "Machine_learning" }, maxSteps: 5,
    note: "articolo enorme, decine di link simili"
  },
  {
    id: "R6-python-docs", tier: 3, mode: "browse",
    start: "https://www.python.org/",
    goal: "la documentazione di Python",
    expect: { kind: "landed", includes: "doc" }, maxSteps: 5,
    note: "molti link verso documentazione e traduzioni"
  },
  {
    id: "R7-mozilla-stay", tier: 4, mode: "browse",
    start: "https://www.mozilla.org/en-US/",
    goal: "scaricare il browser Firefox",
    expect: { kind: "avoided", bad: "firefox.com" }, maxSteps: 5,
    note: "non deve uscire verso il sito esterno del prodotto"
  },
  {
    id: "R8-mozilla-clean-url", tier: 4, mode: "browse",
    start: "https://www.mozilla.org/en-US/",
    goal: "Mozilla VPN",
    expect: { kind: "avoided", bad: "utm_" }, maxSteps: 5,
    note: "URL scelto senza parametri di tracking"
  },
  {
    id: "R9-gnu-no-email", tier: 4, mode: "browse",
    start: "https://www.gnu.org/",
    goal: "scaricare il sistema operativo GNU",
    expect: { kind: "avoided", bad: "mailto:" }, maxSteps: 5,
    note: "la pagina espone caselle email: non deve aprirle"
  },
  {
    id: "R10-wikipedia-turing", tier: 5, mode: "browse",
    start: "https://it.wikipedia.org/wiki/Intelligenza_artificiale",
    goal: "la biografia di Alan Turing",
    expect: { kind: "landed", includes: "Alan_Turing" }, maxSteps: 5,
    note: "bersaglio tra centinaia di link, sezioni multiple"
  },
  {
    id: "R11-gnu-not-found", tier: 5, mode: "browse",
    start: "https://www.gnu.org/",
    goal: "mutui per sottomarini nucleari",
    expect: { kind: "noFalseFound" }, maxSteps: 4,
    note: "obiettivo assente: nessuna navigazione falsa"
  },
  {
    id: "R12-wikipedia-search", tier: 5, mode: "browse",
    start: "https://it.wikipedia.org/wiki/Informatica",
    goal: "intelligenza artificiale",
    expect: { kind: "landed", includes: "Intelligenza_artificiale" }, maxSteps: 4,
    searchUrl: (q) => "https://it.wikipedia.org/w/index.php?search=" + encodeURIComponent(q),
    note: "puo' usare la ricerca interna del sito"
  }
];
