/**
 * Sogno Americano RP - Pagina Statistiche server FiveM
 * Fetcha dati live da CFX API tramite il nostro proxy /api/server-stats
 * e li renderizza in stile FiveM browser.
 */

(function () {
  'use strict';

  const INTERVALLO_REFRESH = 30000; // 30 secondi
  let cfxIdCorrente = 'e6eel83'; // ID CFX del server, usato per banner e logo

  // ============================================
  // FETCH + RENDER
  // ============================================

  let tentativiStats = 0;

  async function caricaStats() {
    try {
      const r = await fetch('/api/server-stats');
      const json = await r.json();

      if (!json.success) {
        // CFX a volte risponde 503/timeout: ritenta con backoff
        if (tentativiStats < 5) {
          tentativiStats++;
          const el = document.getElementById('hostname');
          if (el) el.textContent = '🔄 Connessione al server CFX (tentativo ' + tentativiStats + ')...';
          setTimeout(caricaStats, Math.min(8000, 2000 * tentativiStats));
          return;
        }
        mostraErrore('Server CFX non raggiungibile.');
        return;
      }
      tentativiStats = 0;

      cfxIdCorrente = json.cfxId || 'e6eel83';
      const data = json.data?.Data || json.data;
      if (!data) {
        mostraErrore('Risposta API non valida.');
        return;
      }

      renderizza(data, cfxIdCorrente);
      aggiornaTimestamp();
    } catch (e) {
      console.error('[Stats] Errore:', e);
      mostraErrore('Errore di rete: ' + e.message);
    }
  }

  function renderizza(data, cfxId) {
    // Hostname (con color codes FiveM convertiti in HTML)
    const hostnameEl = document.getElementById('hostname');
    hostnameEl.innerHTML = pulisciStringaFivem(data.hostname || 'Server senza nome');

    // Project description
    const desc = data.vars?.sv_projectDesc || data.projectDesc || '';
    document.getElementById('projectDesc').innerHTML = pulisciStringaFivem(desc);

    // Player count
    const correnti = data.clients || (data.players ? data.players.length : 0);
    const massimo = parseInt(data.svMaxclients || data.sv_maxclients || data.vars?.sv_maxClients || 0);
    document.getElementById('players-count').textContent = correnti + ' / ' + massimo;
    document.getElementById('players-text').textContent = correnti + ' / ' + massimo;
    const percentuale = massimo > 0 ? (correnti / massimo) * 100 : 0;
    document.getElementById('players-bar').style.width = percentuale + '%';

    // Flag
    const locale = (data.vars?.locale || 'it_IT').toLowerCase();
    const codice = locale.split('_').pop().toLowerCase();
    document.getElementById('flag').textContent = bandieraEmoji(codice);
    document.getElementById('locale-text').textContent = codice.toUpperCase();

    // Banner animato (banner_detail / banner_connecting / banner_disconnect)
    const banner = data.vars?.banner_detail || data.vars?.banner_connecting || data.vars?.banner_disconnect;
    const bannerImg = document.getElementById('banner-img');
    if (banner && bannerImg) {
      bannerImg.style.display = 'block';
      bannerImg.removeAttribute('hidden');
      bannerImg.onerror = () => {
        bannerImg.style.display = 'none';
        console.warn('[Stats] Banner non caricato:', banner);
      };
      bannerImg.src = banner;
    } else if (bannerImg) {
      bannerImg.style.display = 'none';
    }

    // Logo del server
    const logo = document.getElementById('server-logo');
    if (logo && data.iconVersion !== undefined && data.iconVersion !== null) {
      logo.style.display = 'block';
      logo.removeAttribute('hidden');
      logo.onerror = () => {
        logo.style.display = 'none';
        console.warn('[Stats] Logo non caricato per', cfxId);
      };
      logo.src = 'https://i.ibb.co/6JT2qh9X/Sogno-Americano-RP-Logo.png' + cfxId + '/' + data.iconVersion + '.png';
    } else if (logo) {
      logo.style.display = 'none';
    }

    // Connect URLs
    const connectUrl = 'https://cfx.re/join/e6eel83' + cfxId;
    const connectBtn = document.getElementById('connect-btn');
    const connectBtn2 = document.getElementById('connect-btn-2');
    if (connectBtn) connectBtn.href = connectUrl;
    if (connectBtn2) connectBtn2.href = connectUrl;
    document.getElementById('cfx-url').textContent = 'cfx.re/join/e6eel83' + cfxId;

    // Dettagli sezione (player online + cfx id)
    const playersDetailEl = document.getElementById('players-detail');
    if (playersDetailEl) playersDetailEl.textContent = correnti + ' / ' + massimo;
    const cfxRow = document.getElementById('cfx-id-row');
    if (cfxRow) cfxRow.textContent = 'cfx.re/join/e6eel83' + cfxId;

    // Discord (se presente nelle vars)
    const discordVar = data.vars?.discord || '';
    if (discordVar) {
      const link = document.getElementById('discord-link');
      const url = discordVar.startsWith('http')
        ? discordVar
        : (discordVar.startsWith('discord.gg/') ? 'https://' + discordVar : 'https://discord.gg/' + discordVar);
      link.href = url;
      link.textContent = discordVar.replace(/^https?:\/\//, '');
    }

    // Tags
    const tagsList = document.getElementById('tags-list');
    tagsList.innerHTML = '';
    const tagsRaw = data.vars?.tags || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
    if (tags.length === 0) {
      tagsList.innerHTML = '<span class="stats-loading-text">Nessun tag</span>';
    } else {
      tags.forEach(t => {
        const span = document.createElement('span');
        span.className = 'stats-tag';
        span.textContent = t;
        tagsList.appendChild(span);
      });
    }

    // Resources
    const resources = data.resources || [];
    document.getElementById('resources-count').textContent = resources.length;
    const resList = document.getElementById('resources-list');
    resList.innerHTML = '';
    resources.forEach(r => {
      const span = document.createElement('span');
      span.className = 'stats-resource-tag';
      span.textContent = r;
      resList.appendChild(span);
    });
  }

  function mostraErrore(msg) {
    document.getElementById('hostname').textContent = '⚠️ ' + msg;
    document.getElementById('players-count').textContent = '0/0';
    document.getElementById('players-text').textContent = 'offline';
  }

  function aggiornaTimestamp() {
    const ora = new Date();
    document.getElementById('last-update').textContent = ora.toLocaleTimeString('it-IT');
  }

  // ============================================
  // UTILITÀ
  // ============================================

  // Converte i color code FiveM (^0-9) in span colorati (e codifica HTML)
  function pulisciStringaFivem(testo) {
    if (!testo) return '';
    const colori = {
      '^0': '#000000',
      '^1': '#ff0000',
      '^2': '#00ff00',
      '^3': '#ffff00',
      '^4': '#3b82f6',
      '^5': '#06b6d4',
      '^6': '#ec4899',
      '^7': '#ffffff',
      '^8': '#ff8c00',
      '^9': '#9ca3af'
    };
    // Escape HTML basic
    let safe = testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let out = '';
    let i = 0;
    let inSpan = false;
    while (i < safe.length) {
      if (safe[i] === '^' && i + 1 < safe.length && /[0-9]/.test(safe[i + 1])) {
        if (inSpan) {
          out += '</span>';
          inSpan = false;
        }
        const codice = safe.substring(i, i + 2);
        const colore = colori[codice];
        if (colore && codice !== '^7' && codice !== '^0') {
          out += '<span style="color:' + colore + '">';
          inSpan = true;
        }
        i += 2;
      } else {
        out += safe[i];
        i++;
      }
    }
    if (inSpan) out += '</span>';
    return out;
  }

  function bandieraEmoji(codice) {
    if (!codice || codice.length !== 2) return '🌐';
    const base = 0x1F1E6;
    const a = codice.toUpperCase().charCodeAt(0) - 65 + base;
    const b = codice.toUpperCase().charCodeAt(1) - 65 + base;
    return String.fromCodePoint(a) + String.fromCodePoint(b);
  }

  // ============================================
  // BOTTONE COPIA CONNECT
  // ============================================

  document.getElementById('btn-copy').addEventListener('click', () => {
    const testo = 'cfx.re/join/e6eel83' + cfxIdCorrente;
    navigator.clipboard.writeText(testo).then(() => {
      const btn = document.getElementById('btn-copy');
      const orig = btn.textContent;
      btn.textContent = '✅ Copiato!';
      setTimeout(() => btn.textContent = orig, 2000);
    });
  });

  // ============================================
  // AVVIO
  // ============================================

  caricaStats();
  setInterval(caricaStats, INTERVALLO_REFRESH);

})();
