/**
 * Sogno Americano RP - Pagina Pack Donazioni
 * Carica i pack da /data/pack-donazioni.json (organizzati per categorie) e li renderizza.
 * Click sull'immagine -> lightbox.
 */

(function () {
  'use strict';

  const elGriglia = document.getElementById('pack-griglia');

  // ============================================
  // GESTIONE SCONTO 30% (auto-reset al 21/5/2026 00:00 ora italiana)
  // ============================================
  // Fine sconto = mezzanotte fra il 20 e il 21 maggio 2026 (cioè "fino a tutto il 20 maggio compreso")
  const Baledra_FineSconto = new Date('2026-05-21T00:00:00');

  function Baledra_ScontoAttivo() {
    return Date.now() < Baledra_FineSconto.getTime();
  }

  async function carica() {
    try {
      const r = await fetch('/data/pack-donazioni.json?t=' + Date.now());
      if (!r.ok) throw new Error('JSON non trovato');
      const dati = await r.json();
      // Supporta sia "categorie" che "packs" (legacy)
      if (Array.isArray(dati.categorie) && dati.categorie.length) {
        renderCategorie(dati.categorie);
      } else if (Array.isArray(dati.packs)) {
        renderFlat(dati.packs);
      } else {
        elGriglia.innerHTML = '<div class="pack-empty"><div class="pack-empty-icon">📦</div><h3>Nessun pack ancora pubblicato</h3></div>';
      }
    } catch (e) {
      console.error('[Pack]', e);
      elGriglia.innerHTML = '<div class="pack-loading">⚠️ Impossibile caricare i pack.</div>';
    }
  }

  function slug(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function renderCategorie(categorie) {
    elGriglia.innerHTML = '';
    elGriglia.classList.add('pack-griglia-categorie');

    const validCats = categorie.filter(c => c.packs && c.packs.length);

    // Costruisci la sidebar dx con i link alle categorie
    Baledra_PopolaSidebar(validCats);

    validCats.forEach(cat => {
      const id = cat.id || slug(cat.titolo);
      const sezione = document.createElement('section');
      sezione.className = 'pack-cat pack-sezione';
      sezione.id = 'pack-cat-' + id;
      sezione.dataset.cat = id;
      sezione.style.setProperty('--cat-accent', cat.accent || '#ff6b00');

      // Estrai emoji dal titolo per l'header
      const titolo = cat.titolo || 'Pack';
      const matchEmoji = titolo.match(/^([\p{Emoji}‍]+)\s*/u);
      const emoji = matchEmoji ? matchEmoji[1] : '📦';
      const titoloPulito = titolo.replace(/^([\p{Emoji}‍]+)\s*/u, '');

      sezione.innerHTML = `
        <header class="pack-sezione-head" style="border-color:${escapeHtml(cat.accent || '#6366f1')}55;background:linear-gradient(135deg,${escapeHtml(cat.accent || '#6366f1')}1f,${escapeHtml(cat.accent || '#6366f1')}08)">
          <span class="pack-sezione-icona">${emoji}</span>
          <div>
            <h2 class="pack-sezione-titolo">${escapeHtml(titoloPulito)}</h2>
            <p class="pack-sezione-sub">${cat.packs.length} pack disponibili</p>
          </div>
        </header>
        ${cat._nota ? `<div class="pack-cat-nota">ℹ️ ${escapeHtml(cat._nota)}</div>` : ''}
        <div class="pack-cat-griglia"></div>
      `;
      const griglia = sezione.querySelector('.pack-cat-griglia');
      cat.packs.forEach(p => griglia.appendChild(creaCard(p)));
      elGriglia.appendChild(sezione);
    });

    Baledra_AvviaScrollSpy();
  }

  function Baledra_PopolaSidebar(categorie) {
    const ul = document.getElementById('pack-sidebar-lista');
    if (!ul) return;
    ul.innerHTML = '';
    categorie.forEach(cat => {
      const id = cat.id || slug(cat.titolo);
      const titolo = cat.titolo || 'Pack';
      const matchEmoji = titolo.match(/^([\p{Emoji}‍]+)\s*/u);
      const emoji = matchEmoji ? matchEmoji[1] : '📦';
      const titoloPulito = titolo.replace(/^([\p{Emoji}‍]+)\s*/u, '');
      const li = document.createElement('li');
      li.innerHTML = `
        <a href="#pack-cat-${escapeHtml(id)}" class="pack-sidebar-item" data-cat="${escapeHtml(id)}">
          <span class="pack-sidebar-emoji">${emoji}</span>
          <span class="pack-sidebar-label">${escapeHtml(titoloPulito)}</span>
          <span class="pack-sidebar-count">${cat.packs.length}</span>
        </a>
      `;
      const a = li.querySelector('a');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById('pack-cat-' + id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      ul.appendChild(li);
    });
  }

  function Baledra_AvviaScrollSpy() {
    const sezioni = document.querySelectorAll('.pack-sezione');
    const links = document.querySelectorAll('.pack-sidebar-item');
    if (!sezioni.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const id = en.target.dataset.cat;
          links.forEach(l => l.classList.toggle('attivo', l.dataset.cat === id));
        }
      });
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
    sezioni.forEach(s => obs.observe(s));
  }

  function renderFlat(packs) {
    elGriglia.innerHTML = '';
    if (!packs.length) {
      elGriglia.innerHTML = '<div class="pack-empty"><div class="pack-empty-icon">📦</div><h3>Nessun pack ancora pubblicato</h3></div>';
      return;
    }
    packs.forEach(p => elGriglia.appendChild(creaCard(p)));
  }

  // Calcola lo scontato del 30% su ogni numero seguito da € nella stringa prezzo
  // Es: "10€" -> "7€" ; "10€ / 20€" -> "7€ / 14€" ; "30/40" -> "21/28"
  // Ritorna null se lo sconto è scaduto (così la card mostra solo il prezzo originale)
  function calcolaScontato(prezzoStr) {
    if (!Baledra_ScontoAttivo()) return null;
    if (!prezzoStr || typeof prezzoStr !== 'string') return null;
    const SCONTO = 0.7;
    let trovato = false;
    let out = prezzoStr.replace(/(\d+(?:[.,]\d+)?)\s*(€|eur|EUR|\$)?/g, (match, num, valuta) => {
      const n = parseFloat(num.replace(',', '.'));
      if (isNaN(n)) return match;
      trovato = true;
      const scontato = Math.round(n * SCONTO * 100) / 100;
      // formato pulito: niente .00, virgola se decimale
      const fmt = (Number.isInteger(scontato) ? String(scontato) : scontato.toFixed(2).replace('.', ','));
      return fmt + (valuta || '€');
    });
    return trovato ? out : null;
  }

  function creaCard(p) {
    const card = document.createElement('article');
    card.className = 'pack-card';
    if (p.accent) card.style.setProperty('--accent', p.accent);

    const conImmagine = !!p.immagine;
    const sconto = p.sconto || '30%';
    const prezzoOrig = p.prezzo || '';
    const prezzoScont = calcolaScontato(prezzoOrig);

    // Blocco prezzo: se calcolabile mostro originale barrato + scontato + badge
    const prezzoBlock = (prezzoScont && prezzoScont !== prezzoOrig) ? `
      <div class="pack-card-prezzo-wrap pack-card-prezzo-scontato">
        <span class="pack-card-prezzo-orig">${escapeHtml(prezzoOrig)}</span>
        <span class="pack-card-prezzo-new"${p.accent ? ` style="color:${escapeHtml(p.accent)}"` : ''}>${escapeHtml(prezzoScont)}</span>
        <span class="pack-card-prezzo-badge">-${escapeHtml(sconto)}</span>
      </div>
    ` : `
      <div class="pack-card-prezzo-wrap">
        <span class="pack-card-prezzo" style="${p.accent ? 'background: linear-gradient(90deg, ' + p.accent + ', ' + oscura(p.accent, 30) + ');-webkit-background-clip:text;background-clip:text;color:transparent' : ''}">${escapeHtml(prezzoOrig || '?')}</span>
      </div>
    `;

    let bodyHtml = `
      <div class="pack-card-info">
        ${p.variante ? `<div class="pack-card-variante" style="${p.accent ? 'color:' + p.accent : ''}">${escapeHtml(p.variante)}</div>` : ''}
        <h3 class="pack-card-nome">${escapeHtml(p.nome || 'Pack')}</h3>
        ${p.descrizione ? `<p class="pack-card-desc">${escapeHtml(p.descrizione)}</p>` : ''}
        ${p.contenuto && p.contenuto.length ? `
          <ul class="pack-card-contenuto">
            ${p.contenuto.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>` : ''}
        ${p.extras ? `<p class="pack-card-extras">⭐ ${escapeHtml(p.extras)}</p>` : ''}
        ${p.scadenza ? `<p class="pack-card-scadenza">⏰ ${escapeHtml(p.scadenza)}</p>` : ''}
        ${p.preview ? `<a href="${escapeHtml(p.preview)}" target="_blank" rel="noopener" class="pack-card-preview">▶ Guarda preview</a>` : ''}
        <div class="pack-card-footer">
          ${prezzoBlock}
          <div class="pack-card-azioni">
            <a href="https://discord.com/channels/1441476415437668354/1491449709565448342" target="_blank" rel="noopener" class="btn pack-card-btn" title="Apri il ticket nel canale donazioni">
              🎫 Apri ticket
            </a>
            <a href="https://discord.gg/gqzEKCPNzt" target="_blank" rel="noopener" class="pack-card-btn-secondario" title="Non sei nel server? Entra qui">
              📥 Entra nel server
            </a>
          </div>
        </div>
      </div>
    `;

    card.innerHTML = `
      ${conImmagine ? `
        <div class="pack-card-immagine" data-pack-wrap>
          <img src="${escapeHtml(p.immagine)}" alt="${escapeHtml(p.nome || 'Pack')}" loading="lazy">
          <span class="pack-card-sconto">-${escapeHtml(sconto)}</span>
        </div>` : renderFallbackHtml(p, sconto)}
      ${bodyHtml}
    `;

    if (conImmagine) {
      const wrap = card.querySelector('[data-pack-wrap]');
      const img = wrap?.querySelector('img');
      if (img) {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => apriLightbox(p.immagine, p.nome));
        // Se l'immagine non si carica, sostituisci con fallback banner generato
        img.addEventListener('error', () => {
          const tmp = document.createElement('div');
          tmp.innerHTML = renderFallbackHtml(p, sconto).trim();
          const nuovo = tmp.firstElementChild;
          if (nuovo && wrap.parentElement) {
            wrap.parentElement.replaceChild(nuovo, wrap);
          }
        }, { once: true });
      }
    }
    return card;
  }

  // Genera una "grafica" stile Sogno Americano RP per pack senza immagine reale
  function renderFallbackHtml(p, sconto) {
    const accent = p.accent || '#ff6b00';
    const icon = iconaPerPack(p);
    return `
      <div class="pack-card-immagine pack-card-fallback-banner" style="--accent:${accent}">
        <div class="pack-fb-pattern"></div>
        <div class="pack-fb-icon-bg">${icon}</div>
        <div class="pack-fb-header">
          <div class="pack-fb-brand">Sogno Americano RP</div>
          <div class="pack-fb-nome">${escapeHtml(p.nome || 'Pack')}</div>
          ${p.variante ? `<div class="pack-fb-variante">${escapeHtml(p.variante)}</div>` : ''}
        </div>
        <div class="pack-fb-prezzo-banner">${escapeHtml(p.prezzo || '?')}</div>
        <span class="pack-card-sconto">-${escapeHtml(sconto)}</span>
      </div>`;
  }

  function iconaPerPack(p) {
    const n = (p.nome || '').toLowerCase();
    const v = (p.variante || '').toLowerCase();
    if (n.includes('chat')) return '💬';
    if (n.includes('radio')) return '📻';
    if (n.includes('mercato')) return '🔫';
    if (n.includes('pulizia') || n.includes('soldi')) return '💸';
    if (n.includes('giubbotto')) return '🧥';
    if (n.includes('eliporto')) return '🚁';
    if (n.includes('torture')) return '⚙️';
    if (n.includes('pets') || n.includes('animal')) return '🐶';
    if (n.includes('helper')) return '🟢';
    if (n.includes('mod')) return '🔵';
    if (n.includes('admin')) return '🟣';
    if (n.includes('founder') || n.includes('owner')) return '👑';
    if (n.includes('manager')) return '⚙️';
    return '📦';
  }

  function apriLightbox(src, alt) {
    if (!src) return;
    const lb = document.createElement('div');
    lb.className = 'pack-lightbox';
    lb.innerHTML = `
      <button class="pack-lightbox-chiudi" aria-label="Chiudi">✕</button>
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}">
    `;
    document.body.appendChild(lb);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => lb.classList.add('aperto'));

    const chiudi = () => {
      lb.classList.remove('aperto');
      setTimeout(() => { lb.remove(); document.body.style.overflow = ''; }, 200);
    };
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.classList.contains('pack-lightbox-chiudi')) chiudi();
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { chiudi(); document.removeEventListener('keydown', esc); }
    });
  }

  function escapeHtml(t) {
    if (t == null) return '';
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function oscura(hex, p) {
    const m = (hex || '#ff6b00').replace('#', '');
    const n = parseInt(m, 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - p);
    const g = Math.max(0, ((n >> 8) & 0xff) - p);
    const b = Math.max(0, (n & 0xff) - p);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // Nasconde banner sconto e badge "-30%" sulle grafiche se sconto scaduto
  function Baledra_AggiornaUiSconto() {
    if (Baledra_ScontoAttivo()) return;
    document.querySelectorAll('.pack-banner-sconto, .pack-card-sconto, .pack-card-prezzo-badge').forEach(el => {
      el.style.display = 'none';
    });
    // Nasconde anche eventuali badge "SCONTI 30%!" nella navbar
    document.querySelectorAll('.nav-pack-badge').forEach(el => {
      el.style.display = 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', Baledra_AggiornaUiSconto);
  carica();
})();
