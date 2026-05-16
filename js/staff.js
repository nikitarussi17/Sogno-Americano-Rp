/**
 * Sogno Americano RP - Logica pagina Staff con integrazione Discord LIVE
 *
 * Fonti dati:
 *  1. /data/staff.json  → lista discord ID + ruolo Sogno Americano RP
 *  2. discordlookup.mesalytic.moe → avatar, banner, badge, accent_color (sempre)
 *  3. api.lanyard.rest → status, attività (Spotify/giochi/custom status)
 *     ⚠️ Richiede che l'utente sia nel server Discord di Lanyard
 */

(function () {
  'use strict';

  // Endpoint locali serviti dal nostro server.js (bot.js gestisce la connessione Discord)
  const URL_DISCORD_LOOKUP = '/api/discord-user/';
  const URL_LANYARD = '/api/presence/';
  const URL_RUOLI = '/api/member-roles/';

  const contenitore = document.getElementById('staff-contenuto');
  const modale = document.getElementById('modaleProfilo');
  const cardProfilo = document.getElementById('cardProfilo');

  // Cache in memoria per evitare richieste duplicate
  const cacheUtenti = new Map();
  // Mappa discordId -> { card, dati, membro } per aggiornamenti live via WebSocket
  const cardsPerUtente = new Map();
  let membroCorrente = null;
  let datiCorrenti = null;
  let timerAggiornamento = null;
  let websocket = null;

  // ============================================
  // ENTRY POINT
  // ============================================

  async function inizializza() {
    try {
      const risposta = await fetch('/data/staff.json');
      if (!risposta.ok) throw new Error('staff.json non trovato');
      const dati = await risposta.json();
      await renderizzaStaff(dati);
    } catch (errore) {
      console.error('[Staff] Errore inizializzazione:', errore);
      contenitore.innerHTML = '<div class="staff-loading">⚠️ Impossibile caricare i dati dello staff.</div>';
    }
  }

  // ============================================
  // FETCH DATI DISCORD
  // ============================================

  async function fetchDiscordLookup(discordId) {
    if (cacheUtenti.has('lookup_' + discordId)) {
      return cacheUtenti.get('lookup_' + discordId);
    }
    try {
      const r = await fetch(URL_DISCORD_LOOKUP + discordId);
      if (!r.ok) return null;
      const dati = await r.json();
      cacheUtenti.set('lookup_' + discordId, dati);
      return dati;
    } catch (e) {
      console.warn('[Staff] DiscordLookup fail per ' + discordId, e);
      return null;
    }
  }

  async function fetchLanyard(discordId) {
    try {
      const r = await fetch(URL_LANYARD + discordId);
      if (!r.ok) return null;
      const json = await r.json();
      return json.success ? json.data : null;
    } catch (e) {
      // Lanyard fallisce se l'utente non è nel server Lanyard - non è grave
      return null;
    }
  }

  async function fetchProfiloCompleto(membro) {
    // Se l'ID non è un snowflake valido (placeholder, vuoto, ecc.) salta i fetch
    if (!idSnowflakeValido(membro.discordId)) {
      return unisciDati(membro, null, null, null);
    }
    const [lookup, lanyard, ruoli] = await Promise.all([
      fetchDiscordLookup(membro.discordId),
      fetchLanyard(membro.discordId),
      fetchRuoli(membro.discordId)
    ]);
    return unisciDati(membro, lookup, lanyard, ruoli);
  }

  async function fetchRuoli(discordId) {
    try {
      const r = await fetch(URL_RUOLI + discordId);
      if (!r.ok) return null;
      const json = await r.json();
      return json.success ? json.data : null;
    } catch (e) {
      return null;
    }
  }

  function idSnowflakeValido(id) {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
  }

  function unisciDati(membro, lookup, lanyard, ruoli) {
    const u = lanyard?.discord_user || lookup || {};
    const idValido = membro.discordId && !membro.discordId.startsWith('INSERISCI');

    // Avatar
    const avatar = lookup?.avatar?.link
      || (u.avatar ? `https://cdn.discordapp.com/avatars/${membro.discordId}/${u.avatar}.png?size=256` : null)
      || `https://cdn.discordapp.com/embed/avatars/${(parseInt(membro.discordId) || 0) % 5}.png`;

    // Banner
    const banner = lookup?.banner?.link || null;
    const accentColor = lookup?.accent_color
      ? '#' + lookup.accent_color.toString(16).padStart(6, '0')
      : (lookup?.banner?.color ? '#' + lookup.banner.color.toString(16).padStart(6, '0') : '#ff6b00');

    // Nomi
    const displayName = u.global_name || u.display_name || u.username || membro.fallbackName || 'Sconosciuto';
    const username = u.username || 'utente';

    // Status (solo se Lanyard è disponibile)
    const status = lanyard?.discord_status || null; // online | idle | dnd | offline
    const activities = lanyard?.activities || [];
    const customStatus = activities.find(a => a.type === 4);
    const spotify = lanyard?.listening_to_spotify ? lanyard.spotify : null;
    // TUTTE le attività non-spotify e non custom-status (giochi, streaming, watching, competing)
    const tutteAttivita = activities.filter(a =>
      a.type !== 4 && // escludi custom status
      !(a.type === 2 && a.name === 'Spotify') // escludi Spotify (renderizzato a parte)
    );

    // Badge
    const badges = lookup?.badges || [];

    return {
      membro,
      idValido,
      avatar,
      banner,
      accentColor,
      displayName,
      username,
      status,
      customStatus: customStatus?.state || null,
      customEmoji: customStatus?.emoji || null,
      tutteAttivita,
      spotify,
      badges,
      ruoli: ruoli || [],
      lanyardDisponibile: !!lanyard,
      raw: { lookup, lanyard, ruoli }
    };
  }

  // ============================================
  // RENDERIZZAZIONE PAGINA
  // ============================================

  async function renderizzaStaff(dati) {
    contenitore.innerHTML = '';

    for (const categoria of dati.categorie) {
      const sezione = document.createElement('section');
      sezione.className = 'staff-categoria';
      sezione.innerHTML = `
        <div class="staff-cat-head">
          <div class="staff-cat-icon">${categoria.icona}</div>
          <div>
            <h2>${escapeHtml(categoria.titolo)}</h2>
            <p>${escapeHtml(categoria.descrizione)}</p>
          </div>
        </div>
        <div class="staff-griglia"></div>
      `;
      const griglia = sezione.querySelector('.staff-griglia');

      // Crea card placeholder per ogni membro
      categoria.membri.forEach(membro => {
        const card = creaCardPlaceholder(membro);
        griglia.appendChild(card);
        // Carica dati Discord in background
        caricaECompilaCard(card, membro);
      });

      contenitore.appendChild(sezione);
    }
  }

  function creaCardPlaceholder(membro) {
    const card = document.createElement('button');
    card.className = 'staff-membro caricamento';
    card.style.setProperty('--accent', '#ff6b00');
    card.innerHTML = `
      <div class="staff-membro-banner"></div>
      <div class="staff-membro-avatar">
        <div class="staff-skeleton-avatar"></div>
      </div>
      <div class="staff-membro-info">
        <div class="staff-membro-nome staff-skeleton-text"></div>
        <div class="staff-membro-handle staff-skeleton-text" style="width: 60%"></div>
        <div class="staff-membro-ruolo">${escapeHtml(membro.ruolo || 'Staff')}</div>
      </div>
    `;
    return card;
  }

  async function caricaECompilaCard(card, membro) {
    const dati = await fetchProfiloCompleto(membro);
    aggiornaCard(card, dati);
    // Registra la card. Per ID validi usa il discordId (così le ricevute WS lo trovano).
    // Per placeholder usa una chiave sintetica (così il click apre comunque il modal).
    const chiave = idSnowflakeValido(membro.discordId)
      ? membro.discordId
      : 'placeholder_' + Math.random().toString(36).slice(2);
    cardsPerUtente.set(chiave, { card, dati, membro });
    card.addEventListener('click', () => apriModalProfilo(chiave));
  }

  function aggiornaCard(card, dati) {
    card.classList.remove('caricamento');
    card.style.setProperty('--accent', dati.accentColor);

    const sfondoBanner = dati.banner
      ? `background-image: url('${dati.banner}'); background-size: cover; background-position: center;`
      : `background: linear-gradient(135deg, ${dati.accentColor}, ${oscura(dati.accentColor, 30)});`;

    const indicatoreStatus = dati.status
      ? `<span class="staff-status-pallino status-${dati.status}" title="${etichettaStatus(dati.status)}"></span>`
      : '';

    const nitroIcon = haNitro(dati.badges)
      ? '<span class="staff-nitro" title="Nitro">' + iconaNitro() + '</span>'
      : '';

    // Ruolo da mostrare sulla card: più alto Discord (se disponibile) -> manuale -> "Staff"
    const ruoloPrincipale = (dati.ruoli && dati.ruoli.length > 0) ? dati.ruoli[0] : null;
    const testoRuolo = ruoloPrincipale ? ruoloPrincipale.name : (dati.membro.ruolo || 'Staff');
    const coloreRuolo = ruoloPrincipale?.color || dati.accentColor;
    const stileRuolo = `background:${coloreRuolo}1a;color:${coloreRuolo};border-color:${coloreRuolo}33`;

    card.innerHTML = `
      <div class="staff-membro-banner" style="${sfondoBanner}"></div>
      <div class="staff-membro-avatar">
        <img src="${dati.avatar}" alt="${escapeHtml(dati.displayName)}" loading="lazy">
        ${indicatoreStatus}
      </div>
      <div class="staff-membro-info">
        <div class="staff-membro-nome">
          ${escapeHtml(dati.displayName)}
          ${nitroIcon}
        </div>
        <div class="staff-membro-handle">@${escapeHtml(dati.username)}</div>
        <div class="staff-membro-ruolo" style="${stileRuolo}">${escapeHtml(testoRuolo)}</div>
      </div>
    `;
  }

  // ============================================
  // MODAL PROFILO DISCORD
  // ============================================

  function apriModalProfilo(discordId) {
    // Prendi i dati più freschi dal registry (aggiornati dal WS)
    const info = cardsPerUtente.get(discordId);
    const dati = info ? info.dati : null;
    if (!dati) return;

    membroCorrente = dati.membro;
    datiCorrenti = dati;
    cardProfilo.innerHTML = costruisciProfilo(dati);
    cardProfilo.style.setProperty('--accent-profilo', dati.accentColor);
    modale.classList.add('aperto');
    modale.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    modale.querySelectorAll('[data-chiudi]').forEach(el => {
      el.addEventListener('click', chiudiModalProfilo, { once: true });
    });
  }

  function chiudiModalProfilo() {
    modale.classList.remove('aperto');
    modale.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    membroCorrente = null;
    datiCorrenti = null;
    if (timerAggiornamento) {
      clearInterval(timerAggiornamento);
      timerAggiornamento = null;
    }
  }

  function costruisciProfilo(d) {
    const m = d.membro;

    const sfondoBanner = d.banner
      ? `background-image: url('${d.banner}'); background-size: cover; background-position: center;`
      : `background: linear-gradient(135deg, ${d.accentColor}, ${oscura(d.accentColor, 30)});`;

    const indicatorePresenza = d.status
      ? `<span class="dc-presenza status-${d.status}" title="${etichettaStatus(d.status)}"></span>`
      : '';

    const customStatus = d.customStatus ? `
      <div class="dc-stato">
        ${d.customEmoji?.name ? '<span>' + escapeHtml(d.customEmoji.name) + '</span>' : '<span class="dc-stato-pallino"></span>'}
        ${escapeHtml(d.customStatus)}
      </div>` : '';

    const linkDiscord = d.idValido
      ? `https://discord.com/users/${m.discordId}`
      : 'https://discord.gg/gqzEKCPNzt';

    const badgesHtml = costruisciBadges(d.badges);

    return `
      <button class="dc-chiudi" data-chiudi aria-label="Chiudi">✕</button>

      <div class="dc-banner" style="${sfondoBanner}"></div>

      <div class="dc-corpo">

        <div class="dc-avatar-wrap">
          <img class="dc-avatar" src="${d.avatar}" alt="${escapeHtml(d.displayName)}">
          ${indicatorePresenza}
        </div>

        <div class="dc-pannello">

          <div class="dc-nome-riga">
            <h2 class="dc-display-name">${escapeHtml(d.displayName)}</h2>
            ${badgesHtml ? `<div class="dc-badges">${badgesHtml}</div>` : ''}
          </div>
          <div class="dc-username">${escapeHtml(d.username)}</div>

          ${customStatus}

          ${costruisciSezioneAttivita(d)}

          ${costruisciSezioneRuoli(d)}

          ${m.memberSince ? `
            <div class="dc-sezione">
              <p class="dc-titolo-sezione">Membro Sogno Americano RP da</p>
              <p class="dc-info-secondaria">${escapeHtml(m.memberSince)}</p>
            </div>` : ''}


        </div>
      </div>
    `;
  }

  function costruisciSezioneRuoli(d) {
    const m = d.membro;

    // Se ho ruoli reali dal Discord li mostro
    if (d.ruoli && d.ruoli.length > 0) {
      const tags = d.ruoli.map(r => {
        const colore = r.color || '#99aab5';
        const icona = r.icon ? `<img class="dc-ruolo-icona" src="${r.icon}" alt="">` : (r.unicodeEmoji ? `<span class="dc-ruolo-emoji">${r.unicodeEmoji}</span>` : `<span class="dc-ruolo-pallino" style="background:${colore}"></span>`);
        return `<div class="dc-ruolo-tag" style="border-color:${colore};color:${colore};background:${colore}1a">${icona}${escapeHtml(r.name)}</div>`;
      }).join('');

      return `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">Ruoli su Discord</p>
          <div class="dc-ruoli-grid">${tags}</div>
        </div>`;
    }

    // Fallback: ruolo manuale dal staff.json
    if (m.ruolo) {
      return `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">Ruolo su Sogno Americano RP</p>
          <div class="dc-ruolo-tag" style="border-color:${d.accentColor};color:${d.accentColor};background:${d.accentColor}1a">
            <span class="dc-ruolo-pallino" style="background:${d.accentColor}"></span>
            ${escapeHtml(m.ruolo)}
          </div>
        </div>`;
    }

    return '';
  }

  function costruisciSezioneAttivita(d) {
    if (!d.lanyardDisponibile) {
      return '<div id="dc-attivita-live"></div>';
    }

    let html = '<div id="dc-attivita-live">';

    // SPOTIFY (sempre prima)
    if (d.spotify) {
      const s = d.spotify;
      const durata = (s.timestamps?.end || 0) - (s.timestamps?.start || 0);
      const corrente = Date.now() - (s.timestamps?.start || 0);
      const percentuale = durata > 0 ? Math.min(100, (corrente / durata) * 100) : 0;

      html += `
        <div class="dc-sezione">
          <p class="dc-titolo-sezione">🎵 Sta ascoltando Spotify</p>
          <div class="dc-spotify">
            <img class="dc-spotify-album" src="${s.album_art_url}" alt="${escapeHtml(s.album)}">
            <div class="dc-spotify-info">
              <div class="dc-spotify-song">${escapeHtml(s.song)}</div>
              <div class="dc-spotify-artist">di ${escapeHtml(s.artist)}</div>
              <div class="dc-spotify-album-name">in ${escapeHtml(s.album)}</div>
              <div class="dc-spotify-progress">
                <div class="dc-spotify-progress-bar" style="width: ${percentuale.toFixed(1)}%"></div>
              </div>
            </div>
          </div>
        </div>`;
    }

    // TUTTE LE ALTRE ATTIVITÀ (giochi, streaming, watching, competing)
    if (d.tutteAttivita && d.tutteAttivita.length > 0) {
      d.tutteAttivita.forEach(a => {
        html += renderizzaAttivita(a);
      });
    }

    html += '</div>';
    return html;
  }

  function renderizzaAttivita(a) {
    const titoloIntestazione = tipoAttivitaTitolo(a.type, a.name);

    const iconaGrande = a.assets?.large_image
      ? immagineAttivita(a.application_id, a.assets.large_image)
      : null;
    const iconaPiccola = a.assets?.small_image
      ? immagineAttivita(a.application_id, a.assets.small_image)
      : null;
    const testoGrande = a.assets?.large_text || '';
    const testoPiccolo = a.assets?.small_text || '';

    const iconaHtml = iconaGrande
      ? `<div class="dc-attivita-icon-wrap">
           <img class="dc-attivita-icon" src="${iconaGrande}" alt="${escapeHtml(testoGrande || a.name)}" title="${escapeHtml(testoGrande)}" onerror="this.style.display='none'">
           ${iconaPiccola ? `<img class="dc-attivita-icon-piccola" src="${iconaPiccola}" alt="" title="${escapeHtml(testoPiccolo)}" onerror="this.style.display='none'">` : ''}
         </div>`
      : `<div class="dc-attivita-icon-wrap"><div class="dc-attivita-icon dc-attivita-placeholder">${iconaTipoAttivita(a.type)}</div></div>`;

    const tempoStart = a.timestamps?.start || null;
    const tempoHtml = tempoStart
      ? `<div class="dc-attivita-tempo" data-start="${tempoStart}">${formattaDurata(tempoStart)}</div>`
      : '';

    return `
      <div class="dc-sezione">
        <p class="dc-titolo-sezione">${titoloIntestazione}</p>
        <div class="dc-attivita">
          ${iconaHtml}
          <div class="dc-attivita-info">
            <div class="dc-attivita-nome">${escapeHtml(a.name)}</div>
            ${a.details ? `<div class="dc-attivita-dettagli">${escapeHtml(a.details)}</div>` : ''}
            ${a.state ? `<div class="dc-attivita-dettagli">${escapeHtml(a.state)}</div>` : ''}
            ${tempoHtml}
          </div>
        </div>
      </div>`;
  }

  function tipoAttivitaTitolo(type, nome) {
    switch (type) {
      case 0: return '🎮 Sta giocando a ' + escapeHtml(nome);
      case 1: return '📺 In live su ' + escapeHtml(nome);
      case 2: return '🎵 Sta ascoltando ' + escapeHtml(nome);
      case 3: return '👀 Sta guardando ' + escapeHtml(nome);
      case 5: return '🏆 In competizione su ' + escapeHtml(nome);
      default: return '✨ ' + escapeHtml(nome);
    }
  }

  function iconaTipoAttivita(type) {
    return { 0: '🎮', 1: '📺', 2: '🎵', 3: '👀', 5: '🏆' }[type] || '✨';
  }

  function formattaDurata(startMs) {
    if (!startMs) return '';
    const sec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    if (sec < 60) return sec + 's trascorsi';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return m + ':' + s.toString().padStart(2, '0') + ' trascorsi';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + ':' + mm.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0') + ' trascorsi';
  }

  function costruisciBadges(badges) {
    if (!badges || badges.length === 0) return '';
    const mappa = {
      DISCORD_EMPLOYEE: { icon: '🛠️', titolo: 'Discord Staff' },
      DISCORD_PARTNER: { icon: '🤝', titolo: 'Partner' },
      HYPESQUAD_EVENTS: { icon: '🎉', titolo: 'HypeSquad Events' },
      BUG_HUNTER_LEVEL_1: { icon: '🐛', titolo: 'Bug Hunter' },
      BUG_HUNTER_LEVEL_2: { icon: '🐞', titolo: 'Bug Hunter Lv.2' },
      HOUSE_BRAVERY: { icon: '🦁', titolo: 'HypeSquad Bravery' },
      HOUSE_BRILLIANCE: { icon: '🦊', titolo: 'HypeSquad Brilliance' },
      HOUSE_BALANCE: { icon: '🐲', titolo: 'HypeSquad Balance' },
      EARLY_SUPPORTER: { icon: '⭐', titolo: 'Early Supporter' },
      VERIFIED_BOT_DEVELOPER: { icon: '✓', titolo: 'Bot Developer' },
      ACTIVE_DEVELOPER: { icon: '⚙️', titolo: 'Active Developer' },
      NITRO: { icon: iconaNitro(), titolo: 'Nitro', classe: 'dc-badge-nitro' },
      EARLY_VERIFIED_BOT_DEVELOPER: { icon: '✓', titolo: 'Bot Dev' }
    };
    return badges.map(b => {
      const def = mappa[b] || { icon: '🏅', titolo: b };
      return `<div class="dc-badge ${def.classe || ''}" title="${def.titolo}">${def.icon}</div>`;
    }).join('');
  }

  // ============================================
  // UTILITÀ
  // ============================================

  function etichettaStatus(s) {
    return { online: 'Online', idle: 'Inattivo', dnd: 'Non disturbare', offline: 'Offline' }[s] || s;
  }

  function haNitro(badges) {
    return badges?.includes('NITRO');
  }

  function oscura(hex, perc) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - perc);
    const g = Math.max(0, ((num >> 8) & 0xff) - perc);
    const b = Math.max(0, (num & 0xff) - perc);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function immagineAttivita(appId, asset) {
    if (!asset) return null;
    // Spotify cover
    if (asset.startsWith('spotify:')) {
      return 'https://i.scdn.co/image/' + asset.replace('spotify:', '');
    }
    // Asset esterni (Twitch, YouTube, FiveM custom, ecc.) via media proxy Discord
    if (asset.startsWith('mp:')) {
      return 'https://media.discordapp.net/' + asset.substring(3);
    }
    // URL già completi
    if (asset.startsWith('http://') || asset.startsWith('https://')) {
      return asset;
    }
    // Asset standard dell'applicazione (Fortnite, FiveM, qualsiasi gioco con Rich Presence)
    if (appId) {
      return 'https://cdn.discordapp.com/app-assets/' + appId + '/' + asset + '.png';
    }
    return null;
  }

  function escapeHtml(testo) {
    if (!testo && testo !== 0) return '';
    return String(testo)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function iconaNitro() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14.5 8.5C14.5 9.328 13.828 10 13 10C12.172 10 11.5 9.328 11.5 8.5C11.5 7.672 12.172 7 13 7C13.828 7 14.5 7.672 14.5 8.5ZM9.376 19.998C9.123 20 8.872 19.937 8.65 19.815L4.65 17.622C4.299 17.43 4.062 17.083 4.011 16.687C3.96 16.292 4.103 15.896 4.392 15.621L11.392 8.621C11.781 8.232 12.413 8.232 12.802 8.621L19.802 15.621C20.092 15.896 20.234 16.292 20.183 16.687C20.132 17.083 19.895 17.43 19.544 17.622L15.544 19.815C15.071 20.073 14.474 20.062 14.012 19.787L13 19.176V21C13 21.552 12.552 22 12 22C11.448 22 11 21.552 11 21V19.176L9.988 19.787C9.799 19.926 9.589 19.998 9.376 19.998Z"/></svg>';
  }

  // ============================================
  // EVENTI GLOBALI
  // ============================================

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modale.classList.contains('aperto')) {
      chiudiModalProfilo();
    }
  });

  // ============================================
  // WEBSOCKET — AGGIORNAMENTI LIVE
  // ============================================

  function avviaWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/';

    try {
      websocket = new WebSocket(url);
    } catch (e) {
      console.warn('[Staff] WS init fallito:', e);
      programmaRiconnessione();
      return;
    }

    websocket.addEventListener('open', () => {
      console.log('[Staff] WebSocket connesso — aggiornamenti live attivi');
    });

    websocket.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'presenceUpdate') {
          applicaAggiornamentoPresenza(msg.userId, msg.dati);
        }
        // ping/connesso ignorati
      } catch (err) {
        console.warn('[Staff] WS messaggio non valido', err);
      }
    });

    websocket.addEventListener('close', () => {
      console.log('[Staff] WebSocket chiuso, riconnetto in 3s');
      programmaRiconnessione();
    });

    websocket.addEventListener('error', () => {
      try { websocket.close(); } catch (e) {}
    });
  }

  function programmaRiconnessione() {
    setTimeout(avviaWebSocket, 3000);
  }

  function applicaAggiornamentoPresenza(userId, presenza) {
    const info = cardsPerUtente.get(userId);
    if (!info) return; // non è un membro che stiamo mostrando

    // Riusa lookup e ruoli già fetchati, sovrascrive solo la presenza
    const datiAggiornati = unisciDati(
      info.membro,
      info.dati.raw.lookup,
      presenza,
      info.dati.raw.ruoli
    );
    info.dati = datiAggiornati;

    // Aggiorna la card
    aggiornaCard(info.card, datiAggiornati);

    // Se il modal è aperto su questo utente, aggiorna anche il modal
    if (membroCorrente && membroCorrente.discordId === userId) {
      datiCorrenti = datiAggiornati;
      aggiornaModalLive(datiAggiornati);
    }
  }

  function aggiornaModalLive(d) {
    // Aggiorna sezione attività (Spotify, gioco)
    const sezioneAttivita = cardProfilo.querySelector('#dc-attivita-live');
    if (sezioneAttivita) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = costruisciSezioneAttivita(d);
      const nuovo = wrapper.firstElementChild;
      if (nuovo) sezioneAttivita.replaceWith(nuovo);
    }

    // Aggiorna indicatore presenza
    const indicatore = cardProfilo.querySelector('.dc-presenza');
    if (indicatore) {
      indicatore.className = 'dc-presenza status-' + (d.status || 'offline');
      indicatore.title = etichettaStatus(d.status || 'offline');
    }

    // Aggiorna custom status (se presente)
    const statoVecchio = cardProfilo.querySelector('.dc-stato');
    const nuovoCustomHtml = d.customStatus ? `
      <div class="dc-stato">
        ${d.customEmoji?.name ? '<span>' + escapeHtml(d.customEmoji.name) + '</span>' : '<span class="dc-stato-pallino"></span>'}
        ${escapeHtml(d.customStatus)}
      </div>` : '';

    if (statoVecchio && !d.customStatus) {
      statoVecchio.remove();
    } else if (statoVecchio && d.customStatus) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = nuovoCustomHtml.trim();
      statoVecchio.replaceWith(wrapper.firstElementChild);
    } else if (!statoVecchio && d.customStatus) {
      // Inserisci prima delle attività
      const sezioneAtt = cardProfilo.querySelector('#dc-attivita-live');
      if (sezioneAtt) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = nuovoCustomHtml.trim();
        sezioneAtt.parentElement.insertBefore(wrapper.firstElementChild, sezioneAtt);
      }
    }
  }

  // Timer globale che aggiorna ogni secondo le durate trascorse delle attività
  setInterval(() => {
    document.querySelectorAll('.dc-attivita-tempo[data-start]').forEach(el => {
      const start = parseInt(el.getAttribute('data-start'));
      if (start) el.textContent = formattaDurata(start);
    });
    // Aggiorna anche la barra di progresso Spotify
    if (datiCorrenti?.spotify?.timestamps) {
      const s = datiCorrenti.spotify;
      const durata = (s.timestamps.end || 0) - (s.timestamps.start || 0);
      const corrente = Date.now() - (s.timestamps.start || 0);
      const percentuale = durata > 0 ? Math.min(100, (corrente / durata) * 100) : 0;
      const bar = cardProfilo.querySelector('.dc-spotify-progress-bar');
      if (bar) bar.style.width = percentuale.toFixed(1) + '%';
    }
  }, 1000);

  inizializza();
  avviaWebSocket();

})();
