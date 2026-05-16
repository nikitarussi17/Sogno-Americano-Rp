(function () {
  'use strict';

  const NOME_CANALE = 'ringraziamenti';

  const elMessaggi = document.getElementById('chat-messaggi');
  const elStatus = document.getElementById('chat-status');
  const elPill = document.getElementById('chat-pill');
  const elDotLabel = document.getElementById('chat-dot-label');

  let messaggi = [];
  let websocket = null;
  let primoCaricamento = true;
  let wsConnesso = false;
  let retryCount = 0;

  async function caricaMessaggi() {
    try {
      const r = await fetch('/api/messages/' + NOME_CANALE);
      if (!r.ok) {
        const delay = r.status === 503 ? 5000 : Math.min(5000 * Math.pow(1.5, retryCount), 30000);
        mostraErrore('Riconnessione in corso...');
        retryCount++;
        setTimeout(caricaMessaggi, delay);
        return;
      }
      const json = await r.json();
      if (!json.success) {
        mostraErrore('Riconnessione in corso...');
        retryCount++;
        setTimeout(caricaMessaggi, Math.min(5000 * retryCount, 30000));
        return;
      }
      retryCount = 0;
      messaggi = json.data || [];
      renderTutto();
      aggiornaStatus(true);
    } catch (e) {
      console.error('[Ringraziamenti]', e);
      mostraErrore('Riconnessione in corso...');
      retryCount++;
      setTimeout(caricaMessaggi, Math.min(5000 * Math.pow(1.5, retryCount), 30000));
    }
  }

  function mostraErrore(msg) { elMessaggi.innerHTML = '<div class="chat-loading">⚠️ ' + escapeHtml(msg) + '</div>'; }
  function aggiornaStatus(online) {
    if (online) {
      elStatus.textContent = messaggi.length + ' messaggi caricati · sincronizzazione live';
      elPill.classList.add('online'); elDotLabel.textContent = 'Live';
    } else {
      elStatus.textContent = 'Riconnessione...';
      elPill.classList.remove('online'); elDotLabel.textContent = 'Offline';
    }
  }

  function renderTutto() {
    if (!messaggi.length) { elMessaggi.innerHTML = '<div class="chat-loading">Nessun ringraziamento ancora pubblicato.</div>'; return; }
    elMessaggi.innerHTML = '';
    let prec = null;
    messaggi.forEach(m => {
      elMessaggi.appendChild(creaElementoMessaggio(m, doveraggruppare(prec, m)));
      prec = m;
    });
    if (primoCaricamento) { scrollFondo(false); primoCaricamento = false; }
    else scrollFondo(true);
  }

  function doveraggruppare(prec, c) {
    if (!prec || prec.author.id !== c.author.id) return false;
    return (c.timestamp - prec.timestamp) < 5 * 60 * 1000;
  }

  function creaElementoMessaggio(m, raggruppato) {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (raggruppato ? ' raggruppato' : '');
    div.dataset.id = m.id;
    const stileNome = m.author.roleColor ? `style="color:${m.author.roleColor}"` : '';
    const botBadge = m.author.bot ? '<span class="chat-bot-badge">BOT</span>' : '';

    if (raggruppato) {
      div.innerHTML = `
        <div class="chat-msg-spacer"><span class="chat-msg-mini-time">${formattaOraMini(m.timestamp)}</span></div>
        <div class="chat-msg-body">${costruisciContenuto(m)}</div>`;
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
        </div>`;
    }
    return div;
  }

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
    if (m.content) html += `<div class="chat-msg-content">${formattaContenuto(m.content, m.mentions, m.channelMentions, m.roleMentions)}</div>`;
    if (m.poll) html += renderSondaggio(m.poll);
    if (m.attachments?.length) {
      html += '<div class="chat-msg-attachments">';
      m.attachments.forEach(a => {
        if (a.isImage) html += `<a href="${a.url}" target="_blank" rel="noopener" class="chat-attach-img-link"><img class="chat-attach-img" src="${a.url}" alt="${escapeHtml(a.name)}" loading="lazy"></a>`;
        else if (a.isVideo) html += `<video controls class="chat-attach-video" preload="metadata"><source src="${a.url}" type="${a.contentType || 'video/mp4'}"></video>`;
        else html += `<a class="chat-attach-file" href="${a.url}" target="_blank" rel="noopener">📎 <span>${escapeHtml(a.name)}</span> <small>${formattaBytes(a.size)}</small></a>`;
      });
      html += '</div>';
    }
    if (m.embeds?.length) {
      m.embeds.forEach(e => {
        if (e.image) html += `<div class="chat-msg-embed-img"><img src="${e.image}" loading="lazy"></div>`;
        else if (e.title || e.description) html += `<div class="chat-msg-embed">${e.title ? `<div class="chat-embed-title">${escapeHtml(e.title)}</div>` : ''}${e.description ? `<div class="chat-embed-desc">${formattaContenuto(e.description, m.mentions, m.channelMentions, m.roleMentions)}</div>` : ''}</div>`;
      });
    }
    if (m.editedTimestamp) html += '<span class="chat-msg-edited">(modificato)</span>';
    return html;
  }

  function formattaContenuto(testo, mentions, channelMentions, roleMentions) {
    const blocchi = [];
    let s = testo.replace(/```(\w+)?\n?([\s\S]*?)```/g, (m, l, c) => { blocchi.push({ lang: (l || '').toLowerCase(), content: c.replace(/\n$/, '') }); return 'CB' + (blocchi.length - 1) + ''; });
    s = escapeHtml(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
         .replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '<em>$1</em>')
         .replace(/`([^`\n]+?)`/g, '<code class="chat-code">$1</code>')
         .replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>')
         .replace(/\|\|(.+?)\|\|/g, '<span class="chat-spoiler" onclick="this.classList.add(\'rivelato\')">$1</span>')
         .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/&lt;@!?(\d+)&gt;/g, (m, id) => {
      const u = mentions?.[id]; if (!u) return '<span class="chat-mention">@user</span>';
      const st = u.color ? ` style="color:${u.color};background:${u.color}30"` : '';
      return `<span class="chat-mention chat-mention-clickable" data-author-id="${id}" data-author-name="${escapeHtml(u.displayName)}"${st}>@${escapeHtml(u.displayName)}</span>`;
    });
    s = s.replace(/&lt;#(\d+)&gt;/g, (m, id) => { const c = channelMentions?.[id]; return `<span class="chat-mention">#${escapeHtml(c?.name || 'canale')}</span>`; });
    s = s.replace(/&lt;@&amp;(\d+)&gt;/g, (m, id) => { const r = roleMentions?.[id]; if (!r) return '<span class="chat-mention">@ruolo</span>'; const st = r.color ? ` style="color:${r.color};background:${r.color}30"` : ''; return `<span class="chat-mention"${st}>@${escapeHtml(r.name)}</span>`; });
    s = s.replace(/@(everyone|here)\b/g, '<span class="chat-mention">@$1</span>').replace(/\n/g, '<br>');
    s = s.replace(/CB(\d+)/g, (m, idx) => { const b = blocchi[parseInt(idx)]; return renderBloccoCodice(b.lang, b.content); });
    return s;
  }

  function renderBloccoCodice(lang, content) {
    if (lang === 'diff') {
      const r = content.split('\n').map(l => {
        const s = escapeHtml(l);
        if (l.startsWith('+')) return `<div class="diff-line diff-add">${s || '&nbsp;'}</div>`;
        if (l.startsWith('-')) return `<div class="diff-line diff-remove">${s || '&nbsp;'}</div>`;
        if (l.startsWith('!')) return `<div class="diff-line diff-warn">${s || '&nbsp;'}</div>`;
        if (l.startsWith('#')) return `<div class="diff-line diff-comment">${s || '&nbsp;'}</div>`;
        if (l.startsWith('@')) return `<div class="diff-line diff-header">${s || '&nbsp;'}</div>`;
        return `<div class="diff-line">${s || '&nbsp;'}</div>`;
      });
      return `<pre class="chat-codeblock chat-diff" data-lang="diff">${r.join('')}</pre>`;
    }
    return `<pre class="chat-codeblock"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${lang ? `<span class="chat-codeblock-lang">${escapeHtml(lang)}</span>` : ''}<code>${escapeHtml(content)}</code></pre>`;
  }

  function renderSondaggio(poll) {
    const t = poll.totalVotes || 0;
    let html = `<div class="chat-poll"><div class="chat-poll-question">📊 ${escapeHtml(poll.question)}</div><div class="chat-poll-answers">`;
    poll.answers.forEach(a => {
      const p = t > 0 ? (a.voteCount / t) * 100 : 0;
      const e = a.emoji?.id ? `<img class="chat-poll-emoji-img" src="https://cdn.discordapp.com/emojis/${a.emoji.id}.${a.emoji.animated ? 'gif' : 'png'}" alt="">` : (a.emoji?.name ? `<span class="chat-poll-emoji">${escapeHtml(a.emoji.name)}</span>` : '');
      html += `<div class="chat-poll-answer"><div class="chat-poll-bar-bg"><div class="chat-poll-bar-fill" style="width:${p.toFixed(1)}%"></div></div><div class="chat-poll-answer-row">${e}<span class="chat-poll-text">${escapeHtml(a.text)}</span><span class="chat-poll-percent">${p.toFixed(0)}%</span><span class="chat-poll-votes">${a.voteCount} ${a.voteCount === 1 ? 'voto' : 'voti'}</span></div></div>`;
    });
    html += `</div><div class="chat-poll-meta">${t === 0 ? 'Nessun voto' : (t + (t === 1 ? ' voto totale' : ' voti totali'))}</div></div>`;
    return html;
  }

  function escapeHtml(t) { if (t == null) return ''; return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function formattaOra(ts) { const d = new Date(ts), o = new Date(), i = new Date(); i.setDate(o.getDate() - 1); const h = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); if (d.toDateString() === o.toDateString()) return 'Oggi alle ' + h; if (d.toDateString() === i.toDateString()) return 'Ieri alle ' + h; return d.toLocaleDateString('it-IT') + ' ' + h; }
  function formattaOraMini(ts) { return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  function formattaBytes(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function scrollFondo(a) { if (a) elMessaggi.scrollTo({ top: elMessaggi.scrollHeight, behavior: 'smooth' }); else elMessaggi.scrollTop = elMessaggi.scrollHeight; }

  // WebSocket con retry esponenziale
  let wsRetryDelay = 3000;
  function connettiWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      websocket = new WebSocket(proto + '//' + location.host + '/');
    } catch (e) {
      console.error('[WS] Errore connessione:', e);
      setTimeout(connettiWs, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 1.5, 30000);
      return;
    }

    websocket.addEventListener('open', () => {
      wsConnesso = true;
      wsRetryDelay = 3000; // reset
      // Se i messaggi non sono ancora caricati, riprova
      if (!messaggi.length) caricaMessaggi();
    });

    websocket.addEventListener('message', (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.canale && m.canale !== NOME_CANALE) return;
        if (m.tipo === 'nuovoMessaggio' && m.messaggio) aggiungiMessaggio(m.messaggio);
        else if (m.tipo === 'messaggioAggiornato' && m.messaggio) aggiornaMessaggio(m.messaggio);
        else if (m.tipo === 'messaggioEliminato' && m.id) rimuoviMessaggio(m.id);
      } catch (err) {}
    });

    websocket.addEventListener('close', () => {
      wsConnesso = false;
      aggiornaStatus(false);
      setTimeout(connettiWs, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 1.5, 30000);
    });

    websocket.addEventListener('error', () => {
      try { websocket.close(); } catch (e) {}
    });
  }

  function aggiungiMessaggio(m) {
    if (messaggi.some(x => x.id === m.id)) return;
    messaggi.push(m); while (messaggi.length > 50) messaggi.shift();
    const inFondo = (elMessaggi.scrollHeight - elMessaggi.scrollTop - elMessaggi.clientHeight) < 50;
    const prec = messaggi[messaggi.length - 2];
    const placeholder = elMessaggi.querySelector('.chat-loading');
    if (placeholder) placeholder.remove();
    elMessaggi.appendChild(creaElementoMessaggio(m, doveraggruppare(prec, m)));
    aggiornaStatus(true);
    if (inFondo) scrollFondo(true);
  }

  function rimuoviMessaggio(id) {
    messaggi = messaggi.filter(m => m.id !== id);
    const el = elMessaggi.querySelector(`.chat-msg[data-id="${id}"]`);
    if (el) el.remove();
  }

  function aggiornaMessaggio(m) {
    const idx = messaggi.findIndex(x => x.id === m.id);
    if (idx >= 0) messaggi[idx] = m; else { aggiungiMessaggio(m); return; }
    const el = elMessaggi.querySelector(`.chat-msg[data-id="${m.id}"]`);
    if (!el) return;
    const body = el.querySelector('.chat-msg-body');
    if (!body) return;
    if (el.classList.contains('raggruppato')) body.innerHTML = costruisciContenuto(m);
    else {
      const stileNome = m.author.roleColor ? `style="color:${m.author.roleColor}"` : '';
      const botBadge = m.author.bot ? '<span class="chat-bot-badge">BOT</span>' : '';
      body.innerHTML = `<div class="chat-msg-head"><span class="chat-msg-author chat-msg-author-clickable" data-author-id="${m.author.id}" data-author-name="${escapeHtml(m.author.displayName)}" ${stileNome}>${escapeHtml(m.author.displayName)}</span>${botBadge}<span class="chat-msg-time">${formattaOra(m.timestamp)}</span></div>${costruisciContenuto(m)}`;
    }
  }

  caricaMessaggi();
  connettiWs();
})();