/**
 * Sogno Americano RP - Catalogo Auto & Moto
 * Fetch live delle foto dai canali Discord, divise per fascia di prezzo.
 * WebSocket per aggiornamenti in tempo reale (nuove foto / foto rimosse).
 */
(function() {
  'use strict';

  // Configurazione categorie (deve combaciare con bot.js / server.js)
  const Baledra_Categorie = [
    { id: 'moto-10',     titolo: 'Moto 10€',    icona: '🏍️', prezzo: 10, descrizione: 'Tutte le moto disponibili a 10€' },
    { id: 'auto-10',     titolo: 'Auto 10€',    icona: '🚗', prezzo: 10, descrizione: 'Auto in fascia 10€' },
    { id: 'auto-15',     titolo: 'Auto 15€',    icona: '🚙', prezzo: 15, descrizione: 'Auto in fascia 15€' },
    { id: 'auto-20',     titolo: 'Auto 20€',    icona: '🚘', prezzo: 20, descrizione: 'Auto in fascia 20€' },
    { id: 'auto-30',     titolo: 'Auto 30€',    icona: '🏎️', prezzo: 30, descrizione: 'Auto sportive in fascia 30€' },
    { id: 'auto-40',     titolo: 'Auto 40€',    icona: '🚓', prezzo: 40, descrizione: 'Auto premium in fascia 40€' },
    { id: 'auto-50',     titolo: 'Auto 50€',    icona: '💎', prezzo: 50, descrizione: 'Auto top di gamma in fascia 50€' },
    { id: 'auto-custom', titolo: 'Auto Custom', icona: '🔧', prezzo: null, descrizione: 'Auto personalizzate su misura' }
  ];

  // Dati in memoria
  const Baledra_DatiCatalogo = {};
  let Baledra_LightboxItems = [];
  let Baledra_LightboxIndex = 0;

  // ============================================
  // ESCAPE / UTIL
  // ============================================

  function Baledra_EscHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ============================================
  // MARKDOWN DISCORD -> HTML SICURO
  // Supporta: # ## ### heading, **bold**, *italic*, __underline__, ~~strike~~, `code`, ```block```
  // Estrae anche un eventuale "Prezzo: 10€" e lo rende come pill
  // ============================================

  function Baledra_RenderMarkdown(testo) {
    if (!testo) return '';
    // Step 1: escape totale per sicurezza
    let html = Baledra_EscHtml(testo);

    // Step 2: blocchi di codice ``` ``` (prima di tutto, multi-line)
    html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
      '<pre class="cat-md-pre"><code>' + code.trim() + '</code></pre>'
    );

    // Step 3: heading riga per riga
    const righe = html.split('\n').map(riga => {
      let r = riga;
      if (/^###\s+/.test(r)) return '<h4 class="cat-md-h3">' + r.replace(/^###\s+/, '') + '</h4>';
      if (/^##\s+/.test(r))  return '<h3 class="cat-md-h2">' + r.replace(/^##\s+/, '') + '</h3>';
      if (/^#\s+/.test(r))   return '<h2 class="cat-md-h1">' + r.replace(/^#\s+/, '') + '</h2>';
      return r;
    });
    html = righe.join('\n');

    // Step 4: inline (ordine: code -> bold -> underline -> italic -> strike)
    html = html.replace(/`([^`\n]+)`/g, '<code class="cat-md-code">$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

    // Step 5: paragrafi: gruppi di righe non heading separati da newline doppi
    // Per semplicità: avvolgo righe non-tag in paragrafi e converto \n singole in <br>
    const parti = html.split(/\n{2,}/).map(blocco => {
      const trimmed = blocco.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|pre|ul|ol|blockquote)/i.test(trimmed)) return trimmed;
      return '<p class="cat-md-p">' + trimmed.replace(/\n/g, '<br>') + '</p>';
    });
    return parti.filter(Boolean).join('');
  }

  // Estrae info strutturate dal caption Discord (nome auto + prezzo se trovati)
  function Baledra_EstraiInfoCaption(testo) {
    if (!testo) return { nome: '', prezzo: '', restoMd: '' };
    const linee = testo.split('\n').map(l => l.trim()).filter(Boolean);
    let nome = '';
    let prezzo = '';
    const restanti = [];
    const regexBoldHeading = /^#\s+\*\*([^*]+)\*\*/;
    const regexPrezzo = /\*\*\s*prezzo\s*:?\s*`?\s*([^`*\n]+?)\s*`?\s*\*\*/i;
    const regexPrezzoSemplice = /^prezzo\s*:?\s*(.+)$/i;

    for (const l of linee) {
      let consumata = false;

      // Nome: # **fmx** o # fmx
      if (!nome) {
        const m = l.match(regexBoldHeading);
        if (m) {
          nome = m[1].trim();
          // controlla se nella stessa riga c'è anche il prezzo
          const m2 = l.match(regexPrezzo);
          if (m2) prezzo = m2[1].trim();
          consumata = true;
        } else if (/^#\s+/.test(l)) {
          nome = l.replace(/^#\s+/, '').replace(/\*\*/g, '').trim();
          consumata = true;
        }
      }

      // Prezzo standalone su riga separata
      if (!prezzo) {
        const mp = l.match(regexPrezzo);
        if (mp) {
          prezzo = mp[1].trim();
          if (/^\*\*\s*prezzo/i.test(l)) consumata = true;
        } else {
          const mps = l.match(regexPrezzoSemplice);
          if (mps && /€|\$|eur/i.test(mps[1])) {
            prezzo = mps[1].replace(/[`*]/g, '').trim();
            consumata = true;
          }
        }
      }

      if (!consumata) restanti.push(l);
    }
    return { nome, prezzo, restoMd: restanti.join('\n') };
  }

  // Controlla che sia un URL Discord CDN safe
  function Baledra_UrlImgValido(url) {
    if (typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const hostOk = ['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname)
        || u.hostname.endsWith('.discordapp.net');
      return hostOk;
    } catch (e) {
      return false;
    }
  }

  // Sconto 30% attivo solo fino al 21/5/2026 00:00 locale (uguale a nav.js)
  function Baledra_ScontoCatAttivo() {
    if (typeof window.Baledra_ScontoAttivo === 'function') return window.Baledra_ScontoAttivo();
    return Date.now() < new Date('2026-05-21T00:00:00').getTime();
  }

  function Baledra_PrezzoScontato(prezzoOriginale) {
    if (prezzoOriginale == null) return null;
    if (!Baledra_ScontoCatAttivo()) return null;
    return Math.round(prezzoOriginale * 0.7 * 100) / 100;
  }

  // ============================================
  // FETCH
  // ============================================

  let Baledra_CatTentativi = 0;

  async function Baledra_CaricaCatalogo() {
    try {
      const r = await fetch('/api/catalogo');
      const j = await r.json();
      if (!j.success) {
        // Bot in fase di login: ritenta con backoff
        if (j.error === 'bot_not_ready' && Baledra_CatTentativi < 12) {
          Baledra_CatTentativi++;
          const el = document.getElementById('catalogo-categorie');
          if (el) el.innerHTML = '<div class="catalogo-loading">🔄 Connessione al bot in corso...</div>';
          setTimeout(Baledra_CaricaCatalogo, Math.min(8000, 1500 * Baledra_CatTentativi));
          return;
        }
        Baledra_MostraErrore(j.error || 'Errore caricamento catalogo');
        return;
      }
      Baledra_CatTentativi = 0;
      Object.assign(Baledra_DatiCatalogo, j.data);
      Baledra_RenderTutto();
    } catch (e) {
      Baledra_MostraErrore('Impossibile contattare il server');
      console.warn('[Catalogo] Errore fetch:', e);
    }
  }

  function Baledra_MostraErrore(msg) {
    const el = document.getElementById('catalogo-categorie');
    if (el) el.innerHTML = '<div class="catalogo-errore">⚠️ ' + Baledra_EscHtml(msg) + '</div>';
  }

  // ============================================
  // RENDER
  // ============================================

  function Baledra_RenderTutto() {
    const container = document.getElementById('catalogo-categorie');
    if (!container) return;
    container.innerHTML = '';

    Baledra_Categorie.forEach(cat => {
      const items = Baledra_DatiCatalogo[cat.id] || [];
      const sezione = Baledra_RenderCategoria(cat, items);
      container.appendChild(sezione);
      Baledra_AggiornaContatore(cat.id, items.length);
    });
  }

  function Baledra_RenderCategoria(cat, items) {
    const sezione = document.createElement('section');
    sezione.className = 'catalogo-cat';
    sezione.id = 'cat-' + cat.id;
    sezione.dataset.cat = cat.id;

    const prezzoOrig = cat.prezzo;
    const prezzoScont = Baledra_PrezzoScontato(prezzoOrig);

    let prezzoBlock = '';
    if (prezzoOrig != null) {
      if (prezzoScont != null) {
        // Sconto attivo: barrato + nuovo + badge
        prezzoBlock = `
          <div class="catalogo-cat-prezzo">
            <span class="catalogo-cat-prezzo-orig">${prezzoOrig}€</span>
            <span class="catalogo-cat-prezzo-new">${prezzoScont}€</span>
            <span class="catalogo-cat-prezzo-badge">-30%</span>
          </div>
        `;
      } else {
        // Sconto scaduto: solo prezzo pieno
        prezzoBlock = `
          <div class="catalogo-cat-prezzo">
            <span class="catalogo-cat-prezzo-new">${prezzoOrig}€</span>
          </div>
        `;
      }
    } else {
      prezzoBlock = `<div class="catalogo-cat-prezzo"><span class="catalogo-cat-prezzo-custom">Prezzo su richiesta</span></div>`;
    }

    sezione.innerHTML = `
      <header class="catalogo-cat-head">
        <div class="catalogo-cat-head-left">
          <span class="catalogo-cat-icona">${cat.icona}</span>
          <div>
            <h2 class="catalogo-cat-titolo">${Baledra_EscHtml(cat.titolo)}</h2>
            <p class="catalogo-cat-sub">${Baledra_EscHtml(cat.descrizione)}</p>
          </div>
        </div>
        ${prezzoBlock}
      </header>
      <div class="catalogo-cat-grid" data-grid="${cat.id}"></div>
    `;

    const grid = sezione.querySelector('[data-grid="' + cat.id + '"]');
    if (items.length === 0) {
      grid.innerHTML = '<div class="catalogo-cat-vuota">Nessuna foto disponibile per ora.<br><small>Le foto vengono sincronizzate dal Discord.</small></div>';
    } else {
      items.forEach((item, idx) => {
        const card = Baledra_CreaCard(cat, item, idx);
        if (card) grid.appendChild(card);
      });
    }
    return sezione;
  }

  function Baledra_CreaCard(cat, item, idx) {
    const img = item.immagini?.[0];
    if (!img || !Baledra_UrlImgValido(img.url)) return null;

    const card = document.createElement('article');
    card.className = 'catalogo-card';
    card.dataset.itemId = item.id;
    card.dataset.cat = cat.id;

    const info = Baledra_EstraiInfoCaption(item.caption);
    const nome = info.nome || '';
    const prezzo = info.prezzo || '';
    const restoHtml = info.restoMd ? Baledra_RenderMarkdown(info.restoMd) : '';

    let bodyHtml = '';
    if (nome || prezzo || restoHtml) {
      bodyHtml = `<div class="catalogo-card-body">`;
      if (nome) bodyHtml += `<div class="catalogo-card-nome">${Baledra_EscHtml(nome)}</div>`;
      if (prezzo) bodyHtml += `<div class="catalogo-card-prezzo-pill">💰 ${Baledra_EscHtml(prezzo)}</div>`;
      if (restoHtml) bodyHtml += `<div class="catalogo-card-extra">${restoHtml}</div>`;
      bodyHtml += `</div>`;
    }

    card.innerHTML = `
      <div class="catalogo-card-img-wrap">
        <img class="catalogo-card-img" loading="lazy" alt="${Baledra_EscHtml(nome || cat.titolo)}" src="${Baledra_EscHtml(img.url)}">
        <div class="catalogo-card-overlay">
          <span class="catalogo-card-zoom">🔍</span>
        </div>
      </div>
      ${bodyHtml}
    `;

    card.addEventListener('click', (e) => {
      // Se ho cliccato un link nel body, lascialo passare
      if (e.target.closest('a')) return;
      Baledra_ApriLightbox(cat.id, item.id);
    });
    return card;
  }

  function Baledra_AggiornaContatore(catId, n) {
    document.querySelectorAll('[data-count="' + catId + '"]').forEach(el => {
      el.textContent = n;
    });
  }

  // ============================================
  // LIGHTBOX
  // ============================================

  function Baledra_ApriLightbox(catId, itemId) {
    const items = Baledra_DatiCatalogo[catId] || [];
    Baledra_LightboxItems = items.flatMap(it =>
      (it.immagini || [])
        .filter(im => Baledra_UrlImgValido(im.url))
        .map(im => ({ url: im.url, caption: it.caption || '', itemId: it.id }))
    );
    Baledra_LightboxIndex = Baledra_LightboxItems.findIndex(x => x.itemId === itemId);
    if (Baledra_LightboxIndex < 0) Baledra_LightboxIndex = 0;
    Baledra_MostraLightbox();
  }

  function Baledra_MostraLightbox() {
    const lb = document.getElementById('catalogo-lightbox');
    const img = document.getElementById('catalogo-lightbox-img');
    const cap = document.getElementById('catalogo-lightbox-caption');
    const cur = Baledra_LightboxItems[Baledra_LightboxIndex];
    if (!lb || !img || !cur) return;
    img.src = cur.url;
    img.alt = cur.caption || 'Foto auto';
    // Renderizza markdown (sicuro: escape interno)
    if (cap) {
      const info = Baledra_EstraiInfoCaption(cur.caption);
      let html = '';
      if (info.nome) html += `<div class="cat-lb-nome">${Baledra_EscHtml(info.nome)}</div>`;
      if (info.prezzo) html += `<div class="cat-lb-prezzo">💰 ${Baledra_EscHtml(info.prezzo)}</div>`;
      if (info.restoMd) html += `<div class="cat-lb-extra">${Baledra_RenderMarkdown(info.restoMd)}</div>`;
      if (!html && cur.caption) html = Baledra_RenderMarkdown(cur.caption);
      cap.innerHTML = html;
    }
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function Baledra_ChiudiLightbox() {
    const lb = document.getElementById('catalogo-lightbox');
    if (lb) lb.hidden = true;
    document.body.style.overflow = '';
  }

  function Baledra_LightboxNext() {
    if (Baledra_LightboxItems.length === 0) return;
    Baledra_LightboxIndex = (Baledra_LightboxIndex + 1) % Baledra_LightboxItems.length;
    Baledra_MostraLightbox();
  }

  function Baledra_LightboxPrev() {
    if (Baledra_LightboxItems.length === 0) return;
    Baledra_LightboxIndex = (Baledra_LightboxIndex - 1 + Baledra_LightboxItems.length) % Baledra_LightboxItems.length;
    Baledra_MostraLightbox();
  }

  // ============================================
  // WEBSOCKET (live update)
  // ============================================

  function Baledra_AvviaWs() {
    let tentativi = 0;
    const connetti = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(proto + '//' + location.host);
      ws.onopen = () => { tentativi = 0; };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.tipo === 'catalogoNuovo' && Baledra_DatiCatalogo[m.categoria]) {
            Baledra_DatiCatalogo[m.categoria].push(m.item);
            Baledra_RenderTutto();
          } else if (m.tipo === 'catalogoEliminato' && Baledra_DatiCatalogo[m.categoria]) {
            Baledra_DatiCatalogo[m.categoria] = Baledra_DatiCatalogo[m.categoria].filter(x => x.id !== m.id);
            Baledra_RenderTutto();
          }
        } catch (e) {}
      };
      ws.onclose = () => {
        tentativi++;
        const ritardo = Math.min(30000, 1000 * Math.pow(1.5, tentativi));
        setTimeout(connetti, ritardo);
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    };
    connetti();
  }

  // ============================================
  // INIT
  // ============================================

  document.addEventListener('DOMContentLoaded', () => {
    Baledra_CaricaCatalogo();
    Baledra_AvviaWs();

    // Lightbox controls
    document.querySelector('.catalogo-lightbox-close')?.addEventListener('click', Baledra_ChiudiLightbox);
    document.querySelector('.catalogo-lightbox-next')?.addEventListener('click', Baledra_LightboxNext);
    document.querySelector('.catalogo-lightbox-prev')?.addEventListener('click', Baledra_LightboxPrev);
    document.getElementById('catalogo-lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'catalogo-lightbox') Baledra_ChiudiLightbox();
    });
    document.addEventListener('keydown', (e) => {
      const lb = document.getElementById('catalogo-lightbox');
      if (!lb || lb.hidden) return;
      if (e.key === 'Escape') Baledra_ChiudiLightbox();
      else if (e.key === 'ArrowRight') Baledra_LightboxNext();
      else if (e.key === 'ArrowLeft') Baledra_LightboxPrev();
    });

    // Sidebar dx: scroll spy + click smooth
    document.querySelectorAll('.catalogo-sidebar-item').forEach(a => {
      a.addEventListener('click', (e) => {
        const cat = a.dataset.cat;
        const target = document.getElementById('cat-' + cat);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.querySelectorAll('.catalogo-sidebar-item').forEach(x => x.classList.remove('attivo'));
          a.classList.add('attivo');
        }
      });
    });

    // Scroll spy
    const osservaSezioni = () => {
      const items = document.querySelectorAll('.catalogo-cat');
      const links = document.querySelectorAll('.catalogo-sidebar-item');
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            const id = en.target.dataset.cat;
            links.forEach(l => l.classList.toggle('attivo', l.dataset.cat === id));
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
      items.forEach(it => obs.observe(it));
    };
    setTimeout(osservaSezioni, 1500);
  });
})();
