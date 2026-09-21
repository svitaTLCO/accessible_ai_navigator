let overlay = null;

function createAccessibleInput() {
  if (overlay) { overlay.remove(); overlay = null; return; }

  overlay = document.createElement('div');
  overlay.id = "a11y-nav-overlay";
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Navigazione rapida assistita da AI');

  overlay.innerHTML = `
    <div class="a11y-container">
      <label id="nav-label" for="a11y-nav-input" class="sr-only">Scrivi la destinazione (es. carrello, contatti):</label>
      <input type="text" id="a11y-nav-input" aria-labelledby="nav-label" placeholder="Dove vuoi andare nella pagina?" autocomplete="off" />
      <div id="a11y-status" role="status" aria-live="polite" class="sr-only"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('a11y-nav-input');
  const status = document.getElementById('a11y-status');
  input.focus();

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { overlay.remove(); overlay = null; }
    if (e.key === 'Enter' && input.value.trim() !== '') {
      const query = input.value;
      status.textContent = "Analisi della pagina...";
      
      const optimizedElements = getOptimizedAccessibilityNodes();

      if (optimizedElements.length === 0) {
        status.textContent = "Nessun elemento interattivo trovato.";
        return;
      }

      chrome.runtime.sendMessage({ action: "navigate_to_point", query, elements: optimizedElements }, (response) => {
        if (response && response.success && response.targetId) {
          const targetElement = document.querySelector(`[data-a11y-id="${response.targetId}"]`);
          if (targetElement) {
            status.textContent = `Navigato su elemento.`;
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.focus();
            overlay?.remove();
            overlay = null;
          } else {
            status.textContent = "Elemento non raggiungibile.";
          }
        } else {
          status.textContent = "Destinazione non trovata.";
        }
      });
    }
  });
}

function getOptimizedAccessibilityNodes() {
  const rawElements = document.querySelectorAll(
    'a, button, input, select, textarea, h1, h2, h3, [role], [tabindex="0"], main, nav, header, footer, section'
  );
  
  const nodes = [];
  let nodeCounter = 0;

  rawElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' || 
      style.visibility === 'hidden' || 
      style.opacity === '0' ||
      (rect.width === 0 && rect.height === 0) ||
      el.hasAttribute('aria-hidden')
    ) {
      return;
    }

    let accessibleName = (
      el.getAttribute('aria-label') || 
      el.innerText || 
      el.getAttribute('placeholder') || 
      el.getAttribute('title') || 
      ''
    ).trim().replace(/\s+/g, ' ');

    if (!accessibleName && el.tagName !== 'INPUT') return;

    let role = el.getAttribute('role') || el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3'].includes(role)) role = 'heading';

    if (!el.getAttribute('data-a11y-id')) {
      el.setAttribute('data-a11y-id', `p-${nodeCounter++}`);
    }
    const id = el.getAttribute('data-a11y-id');

    nodes.push({
      id: id,
      r: role,
      t: accessibleName.substring(0, 60)
    });
  });

  return nodes.slice(0, 60); 
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "open_input") createAccessibleInput();
});