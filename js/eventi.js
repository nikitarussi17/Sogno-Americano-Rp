/**
 * Sogno Americano RP - Pagina Eventi (chat live Discord)
 * Si collega al canale Discord configurato nel bot e mostra i messaggi
 * in stile Discord, con aggiornamenti in real-time via WebSocket.
 */

(function () {
  'use strict';

  const elMessaggi = document.getElementById('chat-messaggi');
  const elStatus = document.getElementById('chat-status');
  const elPill = document.getElementById('chat-pill');
  const elDotLabel = document.getElementById('chat-dot-label');

  let messaggi = [];
  let websocket = null;
  let primoCaricamento = true;

  // ============================================
  // CARICAMENTO INIZIALE
  // ============================================

  async function caricaMessaggi() {
    try {
      const r = await fetch('/api/eventi/messages');
      if (!r.ok) {
        if (r.status === 503) {
          mostraErrore('Bot Discord non ancora pronto. Riprovo tra 5 secondi...');
          setTimeout(caricaMessaggi, 5000);
          return;
        }
        mostraErrore('Errore nel caricamento dei messaggi.');
        return;
      }
      const json = await r.json();
      if (!json.success) {
        mostraErrore('API ha restituito errore.');
        return;
      }
      messaggi = json.data || [];
      renderTutto();
      aggiornaStatus(true);
    } catch (e) {
      console.error('[Eventi]', e);
      mostraErrore('Impossibile contattare il server.');
    }
  }

  function mostraErrore(msg) {
    elMessaggi.innerHTML = '<div class="chat-loading">⚠️ ' + escapeHtml(msg) + '</div>';
  }

  function aggiornaStatus(online) {
    if (online) {
      elStatus.textContent = messaggi.length + ' messaggi caricati · aggiornamenti in tempo reale';
      elPill.classList.add('online');
      elDotLabel.textContent = 'Live';
    } else {
      elStatus.textContent = 'Riconnessione in corso...';
      elPill.classList.remove('online');
      elDotLabel.textContent = 'Offline';
    }
  }

  // ============================================
  // RENDER
  // ============================================

  function renderTutto() {
    if (messaggi.length === 0) {
      elMessaggi.innerHTML = '<div class="chat-loading">Nessun messaggio ancora.</div>';
      return;
    }

    elMessaggi.innerHTML = '';
    let messaggioPrecedente = null;
    messaggi.forEach(m => {
      const raggruppa = doveraggruppare(messaggioPrecedente, m);
      elMessaggi.appendChild(creaElementoMessaggio(m, raggruppa));
      messaggioPrecedente = m;
    });

    if (primoCaricamento) {
      scrollFondo(false);
      primoCaricamento = false;
    } else {
      scrollFondo(true);
    }
  }

  function doveraggruppare(prec, corrente) {
    if (!prec) return false;
    if (prec.author.id !== corrente.author.id) return false;
    // Raggruppa se la differenza è minore di 5 minuti
    return (corrente.timestamp - prec.timestamp) < 5 * 60 * 1000;
  }

  function creaElementoMessaggio(m, raggruppato) {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (raggruppato ? ' raggruppato' : '');
    div.dataset.id = m.id;

    const coloreNome = m.author.roleColor || '';
    const stileNome = coloreNome ? `style="color:${coloreNome}"` : '';
    const botBadge = m.author.bot ? '<span class="chat-bot-badge">BOT</span>' : '';

    if (raggruppato) {
      div.innerHTML = `
        <div class="chat-msg-spacer">
          <span class="chat-msg-mini-time">${formattaOraMini(m.timestamp)}</span>
        </div>
        <div class="chat-msg-body">
          ${costruisciContenuto(m)}
        </div>
      `;
    } else {
      div.innerHTML = `
        <img class="chat-msg-avatar chat-msg-avatar-clickable" data-author-id="${m.author.id}" data-author-name="${escapeHtml(m.author.displayName)}" src="${m.author.avatar}" alt="${escapeHtml(m.author.displayName)}" loading="lazy" title="Click per vedere il profilo Discord">
        <div class="chat-msg-body">
          <div class="chat-msg-head">
            <span class="chat-msg-author chat-msg-author-clickable" data-author-id="${m.author.id}" data-author-name="${escapeHtml(m.author.displayName)}" ${stileNome}>${escapeHtml(m.author.displayName)}</span>
            ${botBadge}
            <span class="chat-msg-time">${formattaOra(m.timestamp)}</span>
          </div>
          ${costruisciContenuto(m)}
        </div>
      `;
    }

    return div;
  }

  // Click delegato su avatar / nome -> apre il profilo Discord
  elMessaggi.addEventListener('click', (e) => {
    const target = e.target.closest('[data-author-id]');
    if (!target) return;
    const id = target.getAttribute('data-author-id');
    const nome = target.getAttribute('data-author-name') || '';
    if (window.BaledraDiscordProfile && id) {
      window.BaledraDiscordProfile.apri(id, { fallbackName: nome });
    }
  });

  function costruisciContenuto(m) {
    let html = '';
    if (m.content) {
      html += `<div class="chat-msg-content">${formattaContenuto(m.content, m.mentions, m.channelMentions, m.roleMentions)}</div>`;
    }

    // Sondaggio (poll Discord)
    if (m.poll) {
      html += renderSondaggio(m.poll);
    }

    // Allegati (immagini, video, file)
    if (m.attachments && m.attachments.length > 0) {
      html += '<div class="chat-msg-attachments">';
      m.attachments.forEach(a => {
        if (a.isImage) {
          html += `<a href="${a.url}" target="_blank" rel="noopener" class="chat-attach-img-link">
            <img class="chat-attach-img" src="${a.url}" alt="${escapeHtml(a.name)}" loading="lazy">
          </a>`;
        } else if (a.isVideo) {
          html += `<video controls class="chat-attach-video" preload="metadata">
            <source src="${a.url}" type="${a.contentType || 'video/mp4'}">
          </video>`;
        } else {
          html += `<a class="chat-attach-file" href="${a.url}" target="_blank" rel="noopener">
            📎 <span>${escapeHtml(a.name)}</span> <small>${formattaBytes(a.size)}</small>
          </a>`;
        }
      });
      html += '</div>';
    }

    // Embeds (link preview, immagini incorporate)
    if (m.embeds && m.embeds.length > 0) {
      m.embeds.forEach(e => {
        if (e.image) {
          html += `<div class="chat-msg-embed-img"><img src="${e.image}" loading="lazy"></div>`;
        } else if (e.title || e.description) {
          html += `
            <div class="chat-msg-embed">
              ${e.title ? `<div class="chat-embed-title">${escapeHtml(e.title)}</div>` : ''}
              ${e.description ? `<div class="chat-embed-desc">${formattaContenuto(e.description)}</div>` : ''}
            </div>`;
        }
      });
    }

    if (m.editedTimestamp) {
      html += '<span class="chat-msg-edited">(modificato)</span>';
    }

    return html;
  }

  // ============================================
  // FORMATTAZIONE TESTO (markdown-lite + mention)
  // ============================================

  function formattaContenuto(testo, mentions, channelMentions, roleMentions) {
    // 1. Estrai e proteggi i blocchi di codice ```lang ... ```
    const blocchi = [];
    let s = testo.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, content) => {
      blocchi.push({ lang: (lang || '').toLowerCase(), content: content.replace(/\n$/, '') });
      return 'CB' + (blocchi.length - 1) + '';
    });

    // 2. Escape HTML
    s = escapeHtml(s);

    // 3. Markdown inline
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    s = s.replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '<em>$1</em>');
    s = s.replace(/`([^`\n]+?)`/g, '<code class="chat-code">$1</code>');
    s = s.replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/\|\|(.+?)\|\|/g, '<span class="chat-spoiler" onclick="this.classList.add(\'rivelato\')">$1</span>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

    // 4. Mention
    s = s.replace(/&lt;@!?(\d+)&gt;/g, (match, id) => {
      const u = mentions?.[id];
      if (!u) return '<span class="chat-mention">@user</span>';
      const stile = u.color ? ` style="color:${u.color};background:${u.color}30"` : '';
      return `<span class="chat-mention"${stile}>@${escapeHtml(u.displayName)}</span>`;
    });
    s = s.replace(/&lt;#(\d+)&gt;/g, (match, id) => {
      const c = channelMentions?.[id];
      return `<span class="chat-mention">#${escapeHtml(c?.name || 'canale')}</span>`;
    });
    s = s.replace(/&lt;@&amp;(\d+)&gt;/g, (match, id) => {
      const r = roleMentions?.[id];
      if (!r) return '<span class="chat-mention">@ruolo</span>';
      const stile = r.color ? ` style="color:${r.color};background:${r.color}30"` : '';
      return `<span class="chat-mention"${stile}>@${escapeHtml(r.name)}</span>`;
    });
    s = s.replace(/@(everyone|here)\b/g, '<span class="chat-mention">@$1</span>');
    s = s.replace(/\n/g, '<br>');

    // 5. Sostituisci i placeholder dei code block col rendering
    s = s.replace(/CB(\d+)/g, (m, idx) => {
      const b = blocchi[parseInt(idx)];
      return renderBloccoCodice(b.lang, b.content);
    });

    return s;
  }

  function renderBloccoCodice(lang, content) {
    if (lang === 'diff') {
      const righe = content.split('\n').map(linea => {
        const safe = escapeHtml(linea);
        if (linea.startsWith('+')) return `<div class="diff-line diff-add">${safe || '&nbsp;'}</div>`;
        if (linea.startsWith('-')) return `<div class="diff-line diff-remove">${safe || '&nbsp;'}</div>`;
        if (linea.startsWith('!')) return `<div class="diff-line diff-warn">${safe || '&nbsp;'}</div>`;
        if (linea.startsWith('#')) return `<div class="diff-line diff-comment">${safe || '&nbsp;'}</div>`;
        if (linea.startsWith('@')) return `<div class="diff-line diff-header">${safe || '&nbsp;'}</div>`;
        return `<div class="diff-line">${safe || '&nbsp;'}</div>`;
      });
      return `<pre class="chat-codeblock chat-diff" data-lang="diff">${righe.join('')}</pre>`;
    }
    const safe = escapeHtml(content);
    const langLabel = lang ? `<span class="chat-codeblock-lang">${escapeHtml(lang)}</span>` : '';
    return `<pre class="chat-codeblock"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${langLabel}<code>${safe}</code></pre>`;
  }

  function renderSondaggio(poll) {
    const totale = poll.totalVotes || 0;
    let html = `
      <div class="chat-poll">
        <div class="chat-poll-question">📊 ${escapeHtml(poll.question)}</div>
        <div class="chat-poll-answers">`;

    poll.answers.forEach(a => {
      const percentuale = totale > 0 ? (a.voteCount / totale) * 100 : 0;
      const emojiHtml = a.emoji?.id
        ? `<img class="chat-poll-emoji-img" src="https://cdn.discordapp.com/emojis/${a.emoji.id}.${a.emoji.animated ? 'gif' : 'png'}" alt="">`
        : (a.emoji?.name ? `<span class="chat-poll-emoji">${escapeHtml(a.emoji.name)}</span>` : '');
      html += `
        <div class="chat-poll-answer">
          <div class="chat-poll-bar-bg">
            <div class="chat-poll-bar-fill" style="width:${percentuale.toFixed(1)}%"></div>
          </div>
          <div class="chat-poll-answer-row">
            ${emojiHtml}
            <span class="chat-poll-text">${escapeHtml(a.text)}</span>
            <span class="chat-poll-percent">${percentuale.toFixed(0)}%</span>
            <span class="chat-poll-votes">${a.voteCount} ${a.voteCount === 1 ? 'voto' : 'voti'}</span>
          </div>
        </div>`;
    });

    html += '</div>';

    // Footer info
    const infoParts = [];
    if (totale === 0) {
      infoParts.push('Nessun voto');
    } else {
      infoParts.push(totale + ' ' + (totale === 1 ? 'voto totale' : 'voti totali'));
    }
    if (poll.allowMultiselect) infoParts.push('Selezione multipla');
    if (poll.expiresAt) {
      const ora = Date.now();
      if (poll.expiresAt > ora) {
        const minRimasti = Math.floor((poll.expiresAt - ora) / 60000);
        if (minRimasti < 60) {
          infoParts.push('Termina tra ' + minRimasti + 'm');
        } else if (minRimasti < 1440) {
          infoParts.push('Termina tra ' + Math.floor(minRimasti / 60) + 'h');
        } else {
          infoParts.push('Termina tra ' + Math.floor(minRimasti / 1440) + 'g');
        }
      } else {
        infoParts.push('Sondaggio terminato');
      }
    }
    html += `<div class="chat-poll-meta">${infoParts.join(' · ')}</div>`;
    html += '</div>';
    return html;
  }

  // ============================================
  // UTILITY
  // ============================================

  function escapeHtml(t) {
    if (t === null || t === undefined) return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formattaOra(ts) {
    const d = new Date(ts);
    const oggi = new Date();
    const ieri = new Date();
    ieri.setDate(oggi.getDate() - 1);

    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    if (d.toDateString() === oggi.toDateString()) {
      return 'Oggi alle ' + ora;
    }
    if (d.toDateString() === ieri.toDateString()) {
      return 'Ieri alle ' + ora;
    }
    return d.toLocaleDateString('it-IT') + ' ' + ora;
  }

  function formattaOraMini(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function formattaBytes(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  function scrollFondo(animato) {
    if (animato) {
      elMessaggi.scrollTo({ top: elMessaggi.scrollHeight, behavior: 'smooth' });
    } else {
      elMessaggi.scrollTop = elMessaggi.scrollHeight;
    }
  }

  // ============================================
  // WEBSOCKET — AGGIORNAMENTI LIVE
  // ============================================

  function connettiWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocket = new WebSocket(proto + '//' + location.host + '/');

    websocket.addEventListener('open', () => {
      console.log('[Eventi] WS connesso');
    });

    websocket.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Filtra solo gli eventi che riguardano il canale "eventi"
        if (msg.canale && msg.canale !== 'eventi') return;
        if (msg.tipo === 'nuovoMessaggio' && msg.messaggio) {
          aggiungiMessaggio(msg.messaggio);
        } else if (msg.tipo === 'messaggioAggiornato' && msg.messaggio) {
          aggiornaMessaggio(msg.messaggio);
        } else if (msg.tipo === 'messaggioEliminato' && msg.id) {
          rimuoviMessaggio(msg.id);
        }
      } catch (err) {}
    });

    websocket.addEventListener('close', () => {
      aggiornaStatus(false);
      setTimeout(connettiWs, 3000);
    });

    websocket.addEventListener('error', () => {
      try { websocket.close(); } catch (e) {}
    });
  }

  function aggiungiMessaggio(m) {
    // Evita duplicati
    if (messaggi.some(x => x.id === m.id)) return;

    messaggi.push(m);
    while (messaggi.length > 50) messaggi.shift();

    // Verifica se l'utente è in fondo PRIMA di aggiungere
    const inFondo = (elMessaggi.scrollHeight - elMessaggi.scrollTop - elMessaggi.clientHeight) < 50;

    // Determina se raggruppare
    const prec = messaggi[messaggi.length - 2];
    const raggruppa = doveraggruppare(prec, m);

    // Rimuovi placeholder se presente
    const placeholder = elMessaggi.querySelector('.chat-loading');
    if (placeholder) placeholder.remove();

    elMessaggi.appendChild(creaElementoMessaggio(m, raggruppa));
    aggiornaStatus(true);

    // Auto-scroll solo se l'utente era in fondo (per non disturbare se sta leggendo sopra)
    if (inFondo) scrollFondo(true);
  }

  function rimuoviMessaggio(id) {
    messaggi = messaggi.filter(m => m.id !== id);
    const el = elMessaggi.querySelector(`.chat-msg[data-id="${id}"]`);
    if (el) el.remove();
  }

  function aggiornaMessaggio(m) {
    // Aggiorna nell'array
    const idx = messaggi.findIndex(x => x.id === m.id);
    if (idx >= 0) {
      messaggi[idx] = m;
    } else {
      // Se non c'era, aggiungilo come nuovo
      aggiungiMessaggio(m);
      return;
    }

    // Aggiorna nel DOM (sostituendo solo il body, non l'avatar)
    const el = elMessaggi.querySelector(`.chat-msg[data-id="${m.id}"]`);
    if (!el) return;
    const body = el.querySelector('.chat-msg-body');
    if (!body) return;
    const raggruppato = el.classList.contains('raggruppato');
    if (raggruppato) {
      body.innerHTML = costruisciContenuto(m);
    } else {
      const coloreNome = m.author.roleColor || '';
      const stileNome = coloreNome ? `style="color:${coloreNome}"` : '';
      const botBadge = m.author.bot ? '<span class="chat-bot-badge">BOT</span>' : '';
      body.innerHTML = `
        <div class="chat-msg-head">
          <span class="chat-msg-author" ${stileNome}>${escapeHtml(m.author.displayName)}</span>
          ${botBadge}
          <span class="chat-msg-time">${formattaOra(m.timestamp)}</span>
        </div>
        ${costruisciContenuto(m)}
      `;
    }
  }

  // ============================================
  // AVVIO
  // ============================================

  caricaMessaggi();
  connettiWs();

})();
