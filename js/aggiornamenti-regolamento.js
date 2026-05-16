/**
 * Sogno Americano RP - Aggiornamenti Regolamento
 * Mostra in un accordion compatto sopra la barra di ricerca del regolamento
 * gli ultimi messaggi dal canale Discord 1490061263294693598.
 * Live update via WebSocket.
 */
(function () {
  'use strict';

  const Baledra_MaxAggiornamenti = 10;
  const Baledra_NomeCanale = 'aggiornamenti-regolamento';
  const Baledra_StorageKey = 'SognoAmericanoRPAggRegoLast';

  let Baledra_Messaggi = [];

  // ============================================
  // ESCAPE / MARKDOWN
  // ============================================

  function Baledra_EscHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // Mini markdown Discord -> HTML sicuro
  function Baledra_RenderMarkdown(testo) {
    if (!testo) return '';
    let html = Baledra_EscHtml(testo);
    // code block triplo
    html = html.replace(/```([\s\S]*?)```/g, (_, c) => '<pre class="rego-agg-pre"><code>' + c.trim() + '</code></pre>');
    // heading per riga
    const righe = html.split('\n').map(r => {
      if (/^###\s+/.test(r)) return '<h5 class="rego-agg-h">' + r.replace(/^###\s+/, '') + '</h5>';
      if (/^##\s+/.test(r))  return '<h4 class="rego-agg-h">' + r.replace(/^##\s+/, '') + '</h4>';
      if (/^#\s+/.test(r))   return '<h3 class="rego-agg-h">' + r.replace(/^#\s+/, '') + '</h3>';
      return r;
    });
    html = righe.join('\n');
    // inline
    html = html.replace(/`([^`\n]+)`/g, '<code class="rego-agg-code">$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    // newline -> <br>
    return html.split(/\n{2,}/).map(b => {
      const t = b.trim();
      if (!t) return '';
      if (/^<(h[1-6]|pre|ul|ol|blockquote)/i.test(t)) return t;
      return '<p class="rego-agg-p">' + t.replace(/\n/g, '<br>') + '</p>';
    }).filter(Boolean).join('');
  }

  function Baledra_FormattaData(ts) {
    try {
      const d = new Date(ts);
      const diff = Date.now() - d.getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return 'ora';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'min fa';
      const ore = Math.floor(min / 60);
      if (ore < 24) return ore + 'h fa';
      const gg = Math.floor(ore / 24);
      if (gg < 7) return gg + 'g fa';
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  // ============================================
  // FETCH
  // ============================================

  let Baledra_TentativiCarica = 0;

  async function Baledra_Carica() {
    try {
      const r = await fetch('/api/messages/' + Baledra_NomeCanale);
      const j = await r.json();
      if (!j.success) {
        // Bot in fase di login: ritenta automaticamente con backoff (max ~30s)
        if (j.error === 'bot_not_ready' && Baledra_TentativiCarica < 12) {
          Baledra_TentativiCarica++;
          Baledra_MostraStato('🔄 Connessione al bot in corso...');
          setTimeout(Baledra_Carica, Math.min(8000, 1500 * Baledra_TentativiCarica));
          return;
        }
        return Baledra_MostraErrore('Bot non disponibile');
      }
      Baledra_TentativiCarica = 0;
      // Più recenti prima
      Baledra_Messaggi = (j.data || []).slice().reverse().slice(0, Baledra_MaxAggiornamenti);
      Baledra_Render();
      Baledra_AggiornaBadge();
    } catch (e) {
      // Errore di rete: ritenta una volta dopo 3s
      if (Baledra_TentativiCarica < 3) {
        Baledra_TentativiCarica++;
        setTimeout(Baledra_Carica, 3000);
        return;
      }
      Baledra_MostraErrore('Errore di rete');
    }
  }

  function Baledra_MostraStato(msg) {
    const el = document.getElementById('rego-agg-lista');
    if (el) el.innerHTML = '<div class="rego-agg-loading">' + Baledra_EscHtml(msg) + '</div>';
  }

  function Baledra_MostraErrore(msg) {
    const el = document.getElementById('rego-agg-lista');
    if (el) el.innerHTML = '<div class="rego-agg-vuota">⚠️ ' + Baledra_EscHtml(msg) + '</div>';
  }

  // ============================================
  // RENDER
  // ============================================

  function Baledra_Render() {
    const el = document.getElementById('rego-agg-lista');
    if (!el) return;
    if (!Baledra_Messaggi.length) {
      el.innerHTML = '<div class="rego-agg-vuota">Nessun aggiornamento al momento.</div>';
      return;
    }
    el.innerHTML = '';
    Baledra_Messaggi.forEach(m => {
      const card = document.createElement('article');
      card.className = 'rego-agg-card';
      card.dataset.id = m.id;

      const colore = m.author?.roleColor || '#ff8a3d';
      const dataFmt = Baledra_FormattaData(m.timestamp);
      const contenutoHtml = m.content ? Baledra_RenderMarkdown(m.content) : '';

      // Allegati immagine (mostra max 2 thumbnail)
      let allegatiHtml = '';
      const imgs = (m.attachments || []).filter(a => a.isImage).slice(0, 2);
      if (imgs.length) {
        allegatiHtml = '<div class="rego-agg-imgs">' +
          imgs.map(a => `<a href="${Baledra_EscHtml(a.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${Baledra_EscHtml(a.proxyUrl || a.url)}" alt=""></a>`).join('') +
          '</div>';
      }

      card.innerHTML = `
        <header class="rego-agg-card-head">
          <img class="rego-agg-avatar" src="${Baledra_EscHtml(m.author.avatar)}" alt="" onerror="this.style.display='none'">
          <div class="rego-agg-meta">
            <div class="rego-agg-author" style="color:${Baledra_EscHtml(colore)}">${Baledra_EscHtml(m.author.displayName || m.author.username)}</div>
            <div class="rego-agg-time">${Baledra_EscHtml(dataFmt)}</div>
          </div>
        </header>
        <div class="rego-agg-body">${contenutoHtml || '<em class="rego-agg-empty-text">(senza testo)</em>'}</div>
        ${allegatiHtml}
      `;
      el.appendChild(card);
    });
  }

  function Baledra_AggiornaBadge() {
    const badge = document.getElementById('rego-agg-badge');
    if (!badge) return;
    if (!Baledra_Messaggi.length) {
      badge.hidden = true;
      return;
    }
    const lastSeen = parseInt(localStorage.getItem(Baledra_StorageKey) || '0', 10);
    const nuovi = Baledra_Messaggi.filter(m => m.timestamp > lastSeen).length;
    if (nuovi > 0) {
      badge.textContent = nuovi > 9 ? '9+' : String(nuovi);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function Baledra_SegnaLetto() {
    if (!Baledra_Messaggi.length) return;
    const piuRecente = Baledra_Messaggi.reduce((max, m) => Math.max(max, m.timestamp || 0), 0);
    try {
      localStorage.setItem(Baledra_StorageKey, String(piuRecente));
    } catch (e) {}
    const badge = document.getElementById('rego-agg-badge');
    if (badge) badge.hidden = true;
  }

  // ============================================
  // WEBSOCKET (live)
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
          if (!m || m.canale !== Baledra_NomeCanale) return;
          if (m.tipo === 'nuovoMessaggio') {
            Baledra_Messaggi.unshift(m.messaggio);
            Baledra_Messaggi = Baledra_Messaggi.slice(0, Baledra_MaxAggiornamenti);
            Baledra_Render();
            Baledra_AggiornaBadge();
          } else if (m.tipo === 'messaggioAggiornato') {
            const idx = Baledra_Messaggi.findIndex(x => x.id === m.messaggio.id);
            if (idx >= 0) {
              Baledra_Messaggi[idx] = m.messaggio;
              Baledra_Render();
            }
          } else if (m.tipo === 'messaggioEliminato') {
            Baledra_Messaggi = Baledra_Messaggi.filter(x => x.id !== m.id);
            Baledra_Render();
            Baledra_AggiornaBadge();
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
    Baledra_Carica();
    Baledra_AvviaWs();

    const toggle = document.getElementById('rego-agg-toggle');
    const lista = document.getElementById('rego-agg-lista');
    if (toggle && lista) {
      toggle.addEventListener('click', () => {
        const aperto = !lista.hidden;
        if (aperto) {
          lista.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.classList.remove('aperto');
        } else {
          lista.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          toggle.classList.add('aperto');
          Baledra_SegnaLetto();
        }
      });
    }
  });
})();
