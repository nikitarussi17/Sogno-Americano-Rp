/**
 * Sogno Americano RP - Modulo profilo Discord condiviso
 * Permette di aprire un modal con il profilo Discord LIVE di un utente
 * usando solo il Discord ID. Usato da eventi, changelog, ringraziamenti, ecc.
 *
 * USO:
 *   BaledraDiscordProfile.apri('1320478727020220537', 'Nikita');
 *   BaledraDiscordProfile.chiudi();
 */

window.BaledraDiscordProfile = (function () {
  'use strict';

  let modale = null;
  let cardProfilo = null;
  let utenteCorrente = null;
  let datiCorrenti = null;
  let websocketCondiviso = null;

  // ============================================
  // INIZIALIZZAZIONE
  // ============================================

  function inizializza() {
    if (modale) return;

    modale = document.createElement('div');
    modale.className = 'discord-modal';
    modale.id = 'discord-profile-modal';
    modale.setAttribute('aria-hidden', 'true');
    modale.innerHTML = `
      <div class="discord-modal-overlay" data-chiudi></div>
      <div class="discord-card" id="discord-profile-card" role="dialog" aria-modal="true"></div>
    `;
    document.body.appendChild(modale);
    cardProfilo = modale.querySelector('.discord-card');

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modale.classList.contains('aperto')) chiudi();
    });

    avviaWsListener();
  }

  // ============================================
  // API PUBBLICA
  // ============================================

  async function apri(discordId, opzioni) {
    inizializza();
    if (!discordId) return;
    opzioni = opzioni || {};

    utenteCorrente = { discordId, ruolo: opzioni.ruolo, fallbackName: opzioni.fallbackName };

    cardProfilo.innerHTML = '<div style="padding:60px;text-align:center;color:#b5bac1">Caricamento profilo...</div>';
    modale.classList.add('aperto');
    modale.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    bindChiusura();

    try {
      const dati = await fetchProfilo(utenteCorrente);
      datiCorrenti = dati;
      cardProfilo.innerHTML = costruisciHtml(dati);
      cardProfilo.style.setProperty('--accent-profilo', dati.accentColor);
      bindChiusura();
    } catch (e) {
      cardProfilo.innerHTML = '<button class="dc-chiudi" data-chiudi>✕</button><div style="padding:60px;text-align:center;color:#f85149">⚠️ Errore caricamento profilo</div>';
      bindChiusura();
    }
  }

  function chiudi() {
    if (!modale) return;
    modale.classList.remove('aperto');
    modale.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    utenteCorrente = null;
    datiCorrenti = null;
  }

  function bindChiusura() {
    cardProfilo.querySelectorAll('[data-chiudi]').forEach(el => {
      el.addEventListener('click', chiudi);
    });
    modale.querySelector('.discord-modal-overlay').addEventListener('click', chiudi);
  }

  // ============================================
  // FETCH DATI
  // ============================================

  async function fetchProfilo(membro) {
    const id = membro.discordId;
    if (!idValido(id)) return unisciDati(membro, null, null, null);
    const [lookup, lanyard, ruoli] = await Promise.all([
      fetchUtente(id),
      fetchPresenza(id),
      fetchRuoli(id)
    ]);
    return unisciDati(membro, lookup, lanyard, ruoli);
  }

  async function fetchUtente(id) {
    try {
      const r = await fetch('/api/discord-user/' + id);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  async function fetchPresenza(id) {
    try {
      const r = await fetch('/api/presence/' + id);
      if (!r.ok) return null;
      const j = await r.json();
      return j.success ? j.data : null;
    } catch (e) { return null; }
  }
  async function fetchRuoli(id) {
    try {
      const r = await fetch('/api/member-roles/' + id);
      if (!r.ok) return null;
      const j = await r.json();
      return j.success ? j.data : null;
    } catch (e) { return null; }
  }

  function idValido(id) {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
  }

  function unisciDati(membro, lookup, lanyard, ruoli) {
    const u = lanyard?.discord_user || lookup || {};
    const avatar = lookup?.avatar?.link
      || (u.avatar ? `https://cdn.discordapp.com/avatars/${membro.discordId}/${u.avatar}.png?size=256` : null)
      || `https://cdn.discordapp.com/embed/avatars/${(parseInt(membro.discordId) || 0) % 5}.png`;
    const banner = lookup?.banner?.link || null;
    const accentColor = lookup?.accent_color
      ? '#' + lookup.accent_color.toString(16).padStart(6, '0')
      : (lookup?.banner?.color ? '#' + lookup.banner.color.toString(16).padStart(6, '0') : '#ff6b00');

    const displayName = u.global_name || u.display_name || u.username || membro.fallbackName || 'Sconosciuto';
    const username = u.username || 'utente';
    const status = lanyard?.discord_status || null;
    const activities = lanyard?.activities || [];
    const customStatus = activities.find(a => a.type === 4);
    const spotify = lanyard?.listening_to_spotify ? lanyard.spotify : null;
    const tutteAttivita = activities.filter(a => a.type !== 4 && !(a.type === 2 && a.name === 'Spotify'));
    const badges = lookup?.badges || [];

    return {
      membro, idValido: idValido(membro.discordId),
      avatar, banner, accentColor,
      displayName, username, status,
      customStatus: customStatus?.state || null,
      customEmoji: customStatus?.emoji || null,
      tutteAttivita, spotify, badges,
      ruoli: ruoli || [],
      lanyardDisponibile: !!lanyard,
      raw: { lookup, lanyard, ruoli }
    };
  }

  // ============================================
  // RENDER PROFILO
  // ============================================

  function costruisciHtml(d) {
    const m = d.membro;
    const sfondo = d.banner
      ? `background-image:url('${d.banner}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg,${d.accentColor},${oscura(d.accentColor, 30)});`;
    const presenza = d.status ? `<span class="dc-presenza status-${d.status}" title="${etichettaStatus(d.status)}"></span>` : '';
    const cs = d.customStatus ? `
      <div class="dc-stato">
        ${d.customEmoji?.name ? '<span>' + escapeHtml(d.customEmoji.name) + '</span>' : '<span class="dc-stato-pallino"></span>'}
        ${escapeHtml(d.customStatus)}
      </div>` : '';
    const badgesHtml = costruisciBadges(d.badges);

    return `
      <button class="dc-chiudi" data-chiudi aria-label="Chiudi">✕</button>
      <div class="dc-banner" style="${sfondo}"></div>
      <div class="dc-corpo">
        <div class="dc-avatar-wrap">
          <img class="dc-avatar" src="${d.avatar}" alt="${escapeHtml(d.displayName)}">
          ${presenza}
        </div>
        <div class="dc-pannello">
          <div class="dc-nome-riga">
            <h2 class="dc-display-name">${escapeHtml(d.displayName)}</h2>
            ${badgesHtml ? `<div class="dc-badges">${badgesHtml}</div>` : ''}
          </div>
          <div class="dc-username">${escapeHtml(d.username)}</div>
          ${cs}
          ${costruisciAttivita(d)}
          ${costruisciRuoli(d)}
        </div>
      </div>
    `;
  }

  function costruisciAttivita(d) {
    if (!d.lanyardDisponibile) return '<div id="dc-attivita-live"></div>';
    let html = '<div id="dc-attivita-live">';
    if (d.spotify) {
      const s = d.spotify;
      const dur = (s.timestamps?.end || 0) - (s.timestamps?.start || 0);
      const cur = Date.now() - (s.timestamps?.start || 0);
      const perc = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      html += `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">🎵 Sta ascoltando Spotify</p>
          <div class="dc-spotify">
            <img class="dc-spotify-album" src="${s.album_art_url}" alt="${escapeHtml(s.album)}">
            <div class="dc-spotify-info">
              <div class="dc-spotify-song">${escapeHtml(s.song)}</div>
              <div class="dc-spotify-artist">di ${escapeHtml(s.artist)}</div>
              <div class="dc-spotify-album-name">in ${escapeHtml(s.album)}</div>
              <div class="dc-spotify-progress"><div class="dc-spotify-progress-bar" style="width:${perc.toFixed(1)}%"></div></div>
            </div>
          </div>
        </div>`;
    }
    (d.tutteAttivita || []).forEach(a => {
      const titolo = tipoAttivitaTitolo(a.type, a.name);
      const ig = a.assets?.large_image ? immagineAttivita(a.application_id, a.assets.large_image) : null;
      const ip_ = a.assets?.small_image ? immagineAttivita(a.application_id, a.assets.small_image) : null;
      const ti = a.assets?.large_text || a.name;
      const tiP = a.assets?.small_text || '';
      const iconaH = ig
        ? `<div class="dc-attivita-icon-wrap">
            <img class="dc-attivita-icon" src="${ig}" alt="${escapeHtml(ti)}" title="${escapeHtml(ti)}" onerror="this.style.display='none'">
            ${ip_ ? `<img class="dc-attivita-icon-piccola" src="${ip_}" alt="" title="${escapeHtml(tiP)}" onerror="this.style.display='none'">` : ''}
          </div>`
        : `<div class="dc-attivita-icon-wrap"><div class="dc-attivita-icon dc-attivita-placeholder">${iconaTipoAttivita(a.type)}</div></div>`;
      const tempoH = a.timestamps?.start ? `<div class="dc-attivita-tempo" data-start="${a.timestamps.start}">${formattaDurata(a.timestamps.start)}</div>` : '';
      html += `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">${titolo}</p>
          <div class="dc-attivita">
            ${iconaH}
            <div class="dc-attivita-info">
              <div class="dc-attivita-nome">${escapeHtml(a.name)}</div>
              ${a.details ? `<div class="dc-attivita-dettagli">${escapeHtml(a.details)}</div>` : ''}
              ${a.state ? `<div class="dc-attivita-dettagli">${escapeHtml(a.state)}</div>` : ''}
              ${tempoH}
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    return html;
  }

  function costruisciRuoli(d) {
    if (d.ruoli && d.ruoli.length > 0) {
      const tags = d.ruoli.map(r => {
        const c = r.color || '#99aab5';
        const i = r.icon ? `<img class="dc-ruolo-icona" src="${r.icon}" alt="">` : (r.unicodeEmoji ? `<span class="dc-ruolo-emoji">${r.unicodeEmoji}</span>` : `<span class="dc-ruolo-pallino" style="background:${c}"></span>`);
        return `<div class="dc-ruolo-tag" style="border-color:${c};color:${c};background:${c}1a">${i}${escapeHtml(r.name)}</div>`;
      }).join('');
      return `<div class="dc-sezione"><p class="dc-titolo-sezione">Ruoli su Discord</p><div class="dc-ruoli-grid">${tags}</div></div>`;
    }
    if (d.membro.ruolo) {
      return `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">Ruolo</p>
          <div class="dc-ruolo-tag" style="border-color:${d.accentColor};color:${d.accentColor};background:${d.accentColor}1a">
            <span class="dc-ruolo-pallino" style="background:${d.accentColor}"></span>
            ${escapeHtml(d.membro.ruolo)}
          </div>
        </div>`;
    }
    return '';
  }

  function costruisciBadges(badges) {
    if (!badges?.length) return '';
    const mappa = {
      DISCORD_EMPLOYEE: { i: '🛠️', t: 'Discord Staff' },
      DISCORD_PARTNER: { i: '🤝', t: 'Partner' },
      HYPESQUAD_EVENTS: { i: '🎉', t: 'HypeSquad' },
      BUG_HUNTER_LEVEL_1: { i: '🐛', t: 'Bug Hunter' },
      HOUSE_BRAVERY: { i: '🦁', t: 'Bravery' },
      HOUSE_BRILLIANCE: { i: '🦊', t: 'Brilliance' },
      HOUSE_BALANCE: { i: '🐲', t: 'Balance' },
      EARLY_SUPPORTER: { i: '⭐', t: 'Early' },
      ACTIVE_DEVELOPER: { i: '⚙️', t: 'Active Dev' },
      NITRO: { i: '✨', t: 'Nitro', cl: 'dc-badge-nitro' }
    };
    return badges.map(b => {
      const def = mappa[b] || { i: '🏅', t: b };
      return `<div class="dc-badge ${def.cl || ''}" title="${def.t}">${def.i}</div>`;
    }).join('');
  }

  // ============================================
  // WEBSOCKET (aggiornamenti live presenza)
  // ============================================

  function avviaWsListener() {
    if (websocketCondiviso) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocketCondiviso = new WebSocket(proto + '//' + location.host + '/');
    websocketCondiviso.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'presenceUpdate' && utenteCorrente && msg.userId === utenteCorrente.discordId) {
          aggiornaPresenzaModale(msg.dati);
        }
      } catch (err) {}
    });
    websocketCondiviso.addEventListener('close', () => {
      websocketCondiviso = null;
      setTimeout(avviaWsListener, 3000);
    });
  }

  function aggiornaPresenzaModale(presenza) {
    if (!datiCorrenti) return;
    const dati = unisciDati(datiCorrenti.membro, datiCorrenti.raw.lookup, presenza, datiCorrenti.raw.ruoli);
    datiCorrenti = dati;
    const sez = cardProfilo.querySelector('#dc-attivita-live');
    if (sez) {
      const w = document.createElement('div');
      w.innerHTML = costruisciAttivita(dati);
      const n = w.firstElementChild;
      if (n) sez.replaceWith(n);
    }
    const ind = cardProfilo.querySelector('.dc-presenza');
    if (ind) ind.className = 'dc-presenza status-' + (dati.status || 'offline');
  }

  // Timer per durate trascorse
  setInterval(() => {
    if (!modale || !modale.classList.contains('aperto')) return;
    cardProfilo.querySelectorAll('.dc-attivita-tempo[data-start]').forEach(el => {
      const start = parseInt(el.getAttribute('data-start'));
      if (start) el.textContent = formattaDurata(start);
    });
  }, 1000);

  // ============================================
  // UTILITY
  // ============================================

  function escapeHtml(t) {
    if (t === null || t === undefined) return '';
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function etichettaStatus(s) {
    return { online: 'Online', idle: 'Inattivo', dnd: 'Non disturbare', offline: 'Offline' }[s] || s;
  }
  function oscura(hex, p) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - p);
    const g = Math.max(0, ((n >> 8) & 0xff) - p);
    const b = Math.max(0, (n & 0xff) - p);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function formattaDurata(start) {
    if (!start) return '';
    const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    if (sec < 60) return sec + 's trascorsi';
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + ':' + s.toString().padStart(2, '0') + ' trascorsi';
    const h = Math.floor(m / 60), mm = m % 60;
    return h + ':' + mm.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0') + ' trascorsi';
  }
  function tipoAttivitaTitolo(t, n) {
    return { 0: '🎮 Sta giocando a ' + escapeHtml(n), 1: '📺 In live su ' + escapeHtml(n), 2: '🎵 Sta ascoltando ' + escapeHtml(n), 3: '👀 Sta guardando ' + escapeHtml(n), 5: '🏆 In competizione su ' + escapeHtml(n) }[t] || ('✨ ' + escapeHtml(n));
  }
  function iconaTipoAttivita(t) { return { 0: '🎮', 1: '📺', 2: '🎵', 3: '👀', 5: '🏆' }[t] || '✨'; }
  function immagineAttivita(appId, asset) {
    if (!asset) return null;
    if (asset.startsWith('spotify:')) return 'https://i.scdn.co/image/' + asset.replace('spotify:', '');
    if (asset.startsWith('mp:')) return 'https://media.discordapp.net/' + asset.substring(3);
    if (asset.startsWith('http')) return asset;
    if (appId) return 'https://cdn.discordapp.com/app-assets/' + appId + '/' + asset + '.png';
    return null;
  }

  return { apri, chiudi };
})();
