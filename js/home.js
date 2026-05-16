/**
 * Sogno Americano RP - Home: contatore visualizzazioni live
 * - Fetcha il conteggio iniziale da /api/visualizzazioni
 * - Si connette al WebSocket per ricevere aggiornamenti istantanei
 *   quando un nuovo IP visita il sito (senza reload)
 */

(function () {
  'use strict';

  const elCount = document.getElementById('vis-count');
  if (!elCount) return;

  // ============================================
  // FETCH INIZIALE
  // ============================================

  async function caricaConteggioVisite() {
    try {
      const r = await fetch('/api/visualizzazioni');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      mostraConteggio(json.count, false);
    } catch (e) {
      console.warn('[Home] Errore fetch visualizzazioni:', e);
      elCount.textContent = '—';
    }
  }

  // ============================================
  // RENDER
  // ============================================

  const elProgress = document.getElementById('vis-progress');
  const TARGET_REGALO = 1000;

  function mostraConteggio(n, animato) {
    if (typeof n !== 'number') return;
    elCount.textContent = n.toLocaleString('it-IT');
    if (animato) {
      elCount.classList.remove('vis-flash');
      void elCount.offsetWidth;
      elCount.classList.add('vis-flash');
    }
    // Aggiorna barra di progresso verso 1000
    if (elProgress) {
      const percent = Math.min(100, (n / TARGET_REGALO) * 100);
      elProgress.style.width = percent.toFixed(2) + '%';
      // Cambia stile se raggiunto
      if (n >= TARGET_REGALO) {
        elProgress.classList.add('vis-progress-completato');
      }
    }
  }

  // ============================================
  // WEBSOCKET
  // ============================================

  let ws = null;
  let timerRiconnessione = null;

  function connettiWs() {
    if (timerRiconnessione) {
      clearTimeout(timerRiconnessione);
      timerRiconnessione = null;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(proto + '//' + location.host + '/');
    } catch (e) {
      programmaRiconnessione();
      return;
    }

    ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'visualizzazioni' && typeof msg.count === 'number') {
          mostraConteggio(msg.count, true);
        }
      } catch (err) {}
    });

    ws.addEventListener('close', programmaRiconnessione);
    ws.addEventListener('error', () => {
      try { ws.close(); } catch (e) {}
    });
  }

  function programmaRiconnessione() {
    if (timerRiconnessione) return;
    timerRiconnessione = setTimeout(() => {
      timerRiconnessione = null;
      connettiWs();
    }, 3000);
  }

  // ============================================
  // AVVIO
  // ============================================

  caricaConteggioVisite();
  connettiWs();

})();
