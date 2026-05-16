/**
 * Sogno Americano RP - Logica navbar (dropdown REGALO + altro)
 * Gestisce l'apertura/chiusura dei dropdown della navbar.
 */

(function () {
  'use strict';

  // ============================================
  // GESTIONE GLOBALE SCONTO 30%
  // Auto-reset al 21/5/2026 00:00 (mezzanotte locale italiana)
  // ============================================
  const Baledra_FineSconto = new Date('2026-05-21T00:00:00');
  function Baledra_ScontoAttivo() {
    return Date.now() < Baledra_FineSconto.getTime();
  }
  // Espongo globalmente (usato anche da pack-donazioni.js se vuole evitare di duplicare)
  window.Baledra_ScontoAttivo = Baledra_ScontoAttivo;

  // Se sconto scaduto -> nascondi tutti gli elementi promozionali ovunque
  document.addEventListener('DOMContentLoaded', () => {
    Baledra_IniettaHamburger();
    if (Baledra_ScontoAttivo()) return;
    const selettori = [
      '.nav-pack-badge',          // pill "SCONTI 30%!" nella navbar
      '.pack-banner-sconto',      // banner sconto pagina pack
      '.pack-card-sconto',        // badge -30% sulle grafiche
      '.pack-card-prezzo-badge',  // badge -30% accanto al prezzo testo
      '.pack-card-prezzo-orig',   // prezzo barrato (non serve più)
      '.catalogo-cat-prezzo-orig',
      '.catalogo-cat-prezzo-badge',
      '.catalogo-info'            // banner sconto in /catalogo-auto
    ];
    selettori.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });
  });

  // Inietta il bottone hamburger nella navbar (visibile solo su mobile via CSS)
  function Baledra_IniettaHamburger() {
    const navInner = document.querySelector('.navbar .nav-inner');
    if (!navInner || navInner.querySelector('.nav-hamburger')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-hamburger';
    btn.setAttribute('aria-label', 'Apri menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `
      <svg class="nav-hamburger-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <line x1="4" y1="7"  x2="20" y2="7"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <line x1="4" y1="17" x2="20" y2="17"/>
      </svg>
      <svg class="nav-hamburger-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <line x1="6" y1="6" x2="18" y2="18"/>
        <line x1="18" y1="6" x2="6" y2="18"/>
      </svg>
    `;
    navInner.appendChild(btn);

    const navbar = document.querySelector('.navbar');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const aperto = navbar.classList.toggle('nav-aperto');
      btn.setAttribute('aria-expanded', aperto ? 'true' : 'false');
    });

    // Click su un link del menu -> chiudi
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', () => {
        navbar.classList.remove('nav-aperto');
        btn.setAttribute('aria-expanded', 'false');
      });
    });

    // Click fuori dalla navbar -> chiudi
    document.addEventListener('click', (e) => {
      if (!navbar.contains(e.target) && navbar.classList.contains('nav-aperto')) {
        navbar.classList.remove('nav-aperto');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // ESC chiude
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navbar.classList.contains('nav-aperto')) {
        navbar.classList.remove('nav-aperto');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.nav-dropdown-toggle');
    const dropdowns = document.querySelectorAll('.nav-dropdown');

    if (toggle) {
      e.preventDefault();
      const dd = toggle.closest('.nav-dropdown');
      const eraAperto = dd.classList.contains('aperto');
      // Chiudi tutti gli altri dropdown
      dropdowns.forEach(d => d.classList.remove('aperto'));
      // Se non era aperto, aprilo
      if (!eraAperto) dd.classList.add('aperto');
      return;
    }

    // Click fuori da qualsiasi dropdown -> chiudi tutti
    if (!e.target.closest('.nav-dropdown')) {
      dropdowns.forEach(d => d.classList.remove('aperto'));
    }
  });

  // ESC chiude i dropdown
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.nav-dropdown.aperto').forEach(d => d.classList.remove('aperto'));
    }
  });
})();
