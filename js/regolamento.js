/**
 * Sogno Americano RP - Logica pagina Regolamento
 * - Ricerca live tra le regole
 * - Scroll-spy sull'indice della sidebar
 * - Bottone "torna su"
 * - Smooth scroll con offset per la navbar sticky
 */

(function () {
  'use strict';

  // === ELEMENTI ===
  const inputRicerca = document.getElementById('ricerca');
  const sezioni = document.querySelectorAll('.rego-section');
  const linkIndice = document.querySelectorAll('#indice a');
  const messaggioVuoto = document.getElementById('vuoto');
  const bottoneTornaSu = document.getElementById('tornaSu');

  // ============================================
  // RICERCA LIVE
  // ============================================

  function filtraRegole(query) {
    const termine = query.trim().toLowerCase();
    let trovate = 0;

    sezioni.forEach(sezione => {
      const titoloSezione = (sezione.dataset.titolo || '').toLowerCase();
      const regole = sezione.querySelectorAll('.rego-rule');
      let regoleVisibili = 0;

      // Se la query è vuota mostra tutto
      if (termine === '') {
        sezione.classList.remove('nascosto');
        regole.forEach(r => {
          r.style.display = '';
          r.classList.remove('evidenziato');
        });
        trovate++;
        return;
      }

      // Filtra le regole della sezione
      regole.forEach(regola => {
        const testo = regola.textContent.toLowerCase();
        const matchRegola = testo.includes(termine);
        const matchTitolo = titoloSezione.includes(termine);

        if (matchRegola || matchTitolo) {
          regola.style.display = '';
          regola.classList.toggle('evidenziato', matchRegola);
          regoleVisibili++;
        } else {
          regola.style.display = 'none';
          regola.classList.remove('evidenziato');
        }
      });

      // Mostra/nascondi sezione in base ai risultati
      if (regoleVisibili > 0 || titoloSezione.includes(termine)) {
        sezione.classList.remove('nascosto');
        // Se match titolo, rendi visibili tutte le regole
        if (titoloSezione.includes(termine) && regoleVisibili === 0) {
          regole.forEach(r => r.style.display = '');
        }
        trovate++;
      } else {
        sezione.classList.add('nascosto');
      }
    });

    // Empty state
    if (trovate === 0 && termine !== '') {
      messaggioVuoto.classList.add('visibile');
    } else {
      messaggioVuoto.classList.remove('visibile');
    }
  }

  if (inputRicerca) {
    let timeoutDebounce;
    inputRicerca.addEventListener('input', (e) => {
      clearTimeout(timeoutDebounce);
      timeoutDebounce = setTimeout(() => filtraRegole(e.target.value), 120);
    });

    // ESC per cancellare ricerca
    inputRicerca.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.target.value = '';
        filtraRegole('');
      }
    });
  }

  // ============================================
  // SCROLL SPY (evidenzia link sidebar attivo)
  // ============================================

  function aggiornaSezioneAttiva() {
    const offset = 120; // margine per la navbar
    let sezioneCorrente = '';

    sezioni.forEach(sezione => {
      if (sezione.classList.contains('nascosto')) return;
      const top = sezione.getBoundingClientRect().top;
      if (top <= offset) {
        sezioneCorrente = sezione.id;
      }
    });

    linkIndice.forEach(link => {
      link.classList.toggle('attivo', link.getAttribute('href') === '#' + sezioneCorrente);
    });
  }

  // ============================================
  // SMOOTH SCROLL CON OFFSET
  // ============================================

  function vaiASezione(e) {
    const href = this.getAttribute('href');
    if (!href || !href.startsWith('#')) return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.pageYOffset - 90;
    window.scrollTo({ top, behavior: 'smooth' });

    // Aggiorna URL senza ricaricare
    history.replaceState(null, '', href);
  }

  linkIndice.forEach(link => link.addEventListener('click', vaiASezione));

  // ============================================
  // BOTTONE "TORNA SU"
  // ============================================

  function gestisciBottoneSu() {
    if (!bottoneTornaSu) return;
    bottoneTornaSu.classList.toggle('visibile', window.scrollY > 600);
  }

  if (bottoneTornaSu) {
    bottoneTornaSu.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ============================================
  // LISTENERS GLOBALI (con throttle leggero via rAF)
  // ============================================

  let inAttesa = false;
  function gestisciScroll() {
    if (inAttesa) return;
    inAttesa = true;
    requestAnimationFrame(() => {
      aggiornaSezioneAttiva();
      gestisciBottoneSu();
      inAttesa = false;
    });
  }

  window.addEventListener('scroll', gestisciScroll, { passive: true });

  // Inizializza al caricamento
  document.addEventListener('DOMContentLoaded', () => {
    aggiornaSezioneAttiva();
    gestisciBottoneSu();

    // Se c'è un hash nell'URL, scrolla con offset corretto
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        setTimeout(() => {
          const top = target.getBoundingClientRect().top + window.pageYOffset - 90;
          window.scrollTo({ top, behavior: 'smooth' });
        }, 100);
      }
    }
  });

  // Shortcut da tastiera: Ctrl/Cmd + K per focus sulla ricerca
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (inputRicerca) {
        inputRicerca.focus();
        inputRicerca.select();
      }
    }
  });

})();
