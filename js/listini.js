/**
 * Sogno Americano RP - Logica pagina Listini Prezzi
 * Carica /data/listini.json e renderizza una sezione per ogni categoria.
 */

(function () {
  'use strict';

  const tabsEl = document.getElementById('listini-tabs');
  const contenutoEl = document.getElementById('listini-contenuto');
  let datiListini = null;
  let categoriaAttiva = null;

  // ============================================
  // CARICAMENTO DATI
  // ============================================

  async function carica() {
    try {
      const r = await fetch('/data/listini.json');
      if (!r.ok) throw new Error('listini.json non trovato');
      datiListini = await r.json();
      if (!datiListini.categorie || datiListini.categorie.length === 0) {
        contenutoEl.innerHTML = '<p class="staff-loading">Nessun listino disponibile.</p>';
        return;
      }
      categoriaAttiva = datiListini.categorie[0].id;
      renderTabs();
      renderContenuto();
    } catch (e) {
      console.error('[Listini] Errore:', e);
      contenutoEl.innerHTML = '<p class="staff-loading">⚠️ Impossibile caricare i listini.</p>';
    }
  }

  // ============================================
  // RENDER TABS
  // ============================================

  function renderTabs() {
    tabsEl.innerHTML = '';
    datiListini.categorie.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'listini-tab' + (cat.id === categoriaAttiva ? ' attivo' : '');
      btn.style.setProperty('--accent', cat.accent || '#ff6b00');
      btn.innerHTML = `<span class="listini-tab-icona">${cat.icona}</span><span>${escapeHtml(cat.titolo)}</span>`;
      btn.addEventListener('click', () => {
        categoriaAttiva = cat.id;
        document.querySelectorAll('.listini-tab').forEach(t => t.classList.remove('attivo'));
        btn.classList.add('attivo');
        renderContenuto();
      });
      tabsEl.appendChild(btn);
    });
  }

  // ============================================
  // RENDER CONTENUTO CATEGORIA
  // ============================================

  function renderContenuto() {
    const cat = datiListini.categorie.find(c => c.id === categoriaAttiva);
    if (!cat) return;

    const accent = cat.accent || '#ff6b00';
    let html = `
      <div class="listini-header" style="--accent:${accent}">
        <div class="listini-header-icon">${cat.icona}</div>
        <div>
          <h2>${escapeHtml(cat.titolo)}</h2>
          <p>${escapeHtml(cat.descrizione || '')}</p>
        </div>
      </div>
      <div class="listini-griglia">`;

    cat.sezioni.forEach(sez => {
      html += renderSezione(sez, accent);
    });

    html += '</div>';

    if (cat.note) {
      html += `
        <div class="listini-nota">
          <div class="listini-nota-icon">⚠️</div>
          <div>${escapeHtml(cat.note).replace(/\n/g, '<br>')}</div>
        </div>`;
    }

    contenutoEl.innerHTML = html;
  }

  function renderSezione(sez, accent) {
    let html = `
      <div class="listini-sezione" style="--accent:${accent}">
        <div class="listini-sezione-head">
          <span class="listini-sezione-icona">${sez.icona || '📦'}</span>
          <h3>${escapeHtml(sez.titolo)}</h3>
        </div>`;

    // Se la sezione ha un prezzo unico per tutta la categoria
    if (sez.prezzoCategoria) {
      html += `<div class="listini-prezzo-unico">Prezzo unico: <strong>${escapeHtml(sez.prezzoCategoria)}</strong></div>`;
    }

    html += '<ul class="listini-items">';
    (sez.items || []).forEach(item => {
      const prezzo = item.prezzo
        ? `<span class="listini-prezzo">${escapeHtml(item.prezzo)}</span>`
        : '';
      const nota = item.nota
        ? `<div class="listini-nota-item">${escapeHtml(item.nota)}</div>`
        : '';
      html += `
        <li class="listini-item">
          <div class="listini-item-info">
            <span class="listini-item-nome">${escapeHtml(item.nome)}</span>
            ${nota}
          </div>
          ${prezzo}
        </li>`;
    });
    html += '</ul></div>';
    return html;
  }

  // ============================================
  // UTILS
  // ============================================

  function escapeHtml(testo) {
    if (!testo && testo !== 0) return '';
    return String(testo)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  carica();
})();
