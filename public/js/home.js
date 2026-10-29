// Buscador de carpetas y endpoints del catálogo propio.
(function () {
  const btn = document.querySelector('[data-search-btn]');
  const box = document.querySelector('.searchbox');
  const input = box ? box.querySelector('input') : null;
  const results = box ? box.querySelector('.search-results') : null;
  if (!btn || !box || !input || !results) return;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  btn.addEventListener('click', () => {
    const open = box.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Cerrar búsqueda' : 'Buscar');
    if (open) input.focus();
    else {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      btn.focus();
    }
  });

  let docsCache = null;
  let searchVersion = 0;
  async function getDocs() {
    if (docsCache) return docsCache;
    const res = await fetch('/docs');
    if (!res.ok) throw new Error('No se pudo cargar el catálogo');
    docsCache = await res.json();
    return docsCache;
  }

  input.addEventListener('input', async () => {
    const version = ++searchVersion;
    const term = input.value.trim().toLowerCase();
    document.querySelectorAll('.list .row').forEach(row => {
      row.style.display = !term || row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
    if (term.length < 2) { results.innerHTML = ''; return; }
    try {
      const docs = await getDocs();
      if (version !== searchVersion) return;
      const matches = [];
      (docs.categories || []).forEach(cat => {
        (cat.endpoints || []).forEach(ep => {
          const params = (ep.params || []).map(p => `${p.name} ${p.description || ''}`).join(' ');
          const hay = `${cat.id} ${cat.name || ''} ${ep.id} ${ep.description || ''} ${params}`.toLowerCase();
          if (hay.includes(term)) matches.push({ cat: cat.id, ep });
        });
      });
      results.innerHTML = matches.slice(0, 12).map(m =>
        `<a href="/${esc(m.cat)}#row-${esc(m.ep.id)}">GET /${esc(m.cat)}/${esc(m.ep.id)} — ${esc(m.ep.description || '')}</a>`
      ).join('') || '<div class="empty">Sin resultados…</div>';
    } catch (_) {
      if (version === searchVersion) results.innerHTML = '<div class="empty">No se pudo cargar el catálogo.</div>';
    }
  });
})();
