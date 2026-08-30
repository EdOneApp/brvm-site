/**
 * app.js — utilitaires partagés par toutes les pages.
 * Aucune dépendance externe (pas de CDN) : formatage, ticker, graphique
 * canvas fait-maison, tri/filtre de tableau, moteur de score "Bons plans".
 */

const BRVM = (function () {

  // Signale que JavaScript est actif : la CSS n'arme les animations
  // d'apparition ([data-reveal]) que sous html.js — sans JS, tout le
  // contenu reste visible.
  document.documentElement.classList.add("js");

  /* ---------------------------- Formatage ---------------------------- */
  function fmtFCFA(n, { decimals = 0 } = {}) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n) + " FCFA";
  }
  function fmtNum(n, decimals = 0) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
  }
  function fmtPct(n, decimals = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(decimals).replace(".", ",")}%`;
  }
  function pctClass(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "nul";
    if (n > 0) return "up"; if (n < 0) return "down"; return "nul";
  }
  function tagClass(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "tag-nul";
    if (n > 0) return "tag-up"; if (n < 0) return "tag-down"; return "tag-nul";
  }
  function arrow(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "→";
    if (n > 0) return "▲"; if (n < 0) return "▼"; return "→";
  }
  function parseDateFR(d) {
    // "25/02/2025" -> Date
    if (!d) return null;
    const [dd, mm, yyyy] = d.split("/").map(Number);
    return new Date(yyyy, mm - 1, dd);
  }

  /* ------------------------------ Ticker ------------------------------ */
  function renderTicker(containerEl, actions) {
    if (!containerEl) return;
    const items = actions.map(a => {
      const last = a.history[a.history.length - 1];
      const cls = pctClass(last.variation);
      return `<span class="ticker-item"><span class="code">${a.code}</span><span class="px num">${fmtNum(last.cours)}</span><span class="${cls} num">${arrow(last.variation)} ${fmtPct(last.variation)}</span></span>`;
    }).join("");
    // dupliqué pour boucle infinie fluide
    containerEl.innerHTML = `<div class="ticker-track">${items}${items}</div>`;
  }

  /* ---------------------------- Data helpers --------------------------- */
  function actionsAsArray(data) {
    return Object.entries(data.actions).map(([code, v]) => ({ code, ...v }));
  }
  function obligationsAsArray(data) {
    return Object.entries(data.obligations).map(([code, v]) => ({ code, ...v }));
  }
  function indicesAsArray(data) {
    return Object.entries(data.indices).map(([code, v]) => ({ code, ...v }));
  }

  function obligationType(code) {
    if (/^(EO|TP|SUK)/.test(code)) return "État / Trésor public";
    if (/^F/.test(code)) return "Titrisation (FCTC) / Privée";
    return "Institution régionale / Privée";
  }

  /* --------------------------- Mini line chart -------------------------- */
  // Canvas fait-maison (pas de dépendance CDN). history = [{date, value}]
  function drawLineChart(canvas, points, { color = "#f0b24b", fill = true, label = "", height = 220 } = {}) {
    if (!canvas || !points || !points.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(rect.width, 280);
    // IMPORTANT : H est TOUJOURS dérivé du paramètre logique `height`, jamais
    // relu depuis canvas.height — cet attribut est écrasé plus bas par la
    // valeur en pixels physiques (H * dpr). Le relire ferait grandir le
    // graphique exponentiellement à chaque redessin (bug observé sur mobile :
    // le canvas "grandissait à l'infini" au moindre resize pendant le scroll).
    const H = height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // annule toute mise à l'échelle précédente avant de rescaler
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { l: 46, r: 14, t: 18, b: 26 };
    const vals = points.map(p => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const spanY = max - min;
    const x = i => pad.l + (i / Math.max(points.length - 1, 1)) * (W - pad.l - pad.r);
    const y = v => H - pad.b - ((v - min) / spanY) * (H - pad.t - pad.b);

    // grille horizontale
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(167,171,184,.75)";
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = min + (spanY * i) / steps;
      const yy = y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
      ctx.fillText(v.toFixed(spanY < 5 ? 2 : 0), 4, yy + 3);
    }

    // aire sous la courbe
    if (fill && points.length > 1) {
      const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
      grad.addColorStop(0, color + "55");
      grad.addColorStop(1, color + "02");
      ctx.beginPath();
      ctx.moveTo(x(0), y(points[0].value));
      points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)));
      ctx.lineTo(x(points.length - 1), H - pad.b);
      ctx.lineTo(x(0), H - pad.b);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ligne (avec halo lumineux)
    ctx.beginPath();
    points.forEach((p, i) => { const px = x(i), py = y(p.value); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // points
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      ctx.beginPath();
      ctx.arc(x(i), y(p.value), isLast ? 4 : (points.length > 40 ? 0 : 3), 0, Math.PI * 2);
      ctx.fillStyle = isLast ? "#ffffff" : color;
      if (isLast) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // labels de dates (premier, milieu, dernier)
    ctx.fillStyle = "rgba(135,146,172,.9)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    const idxs = points.length > 1 ? [0, points.length - 1] : [0];
    idxs.forEach(i => {
      const d = points[i].date;
      ctx.textAlign = i === 0 ? "left" : "right";
      ctx.fillText(d, x(i), H - 8);
    });
    ctx.textAlign = "left";
  }

  /* --------------------------- Tri / filtre table ------------------------ */
  function makeSortableTable({ tableEl, rows, columns, renderRow, initialSort, cardsEl, renderCard }) {
    let sortKey = initialSort ? initialSort.key : columns[0].key;
    let sortDir = initialSort ? initialSort.dir : "asc";
    let filterFn = () => true;

    function apply() {
      let data = rows.filter(filterFn);
      data.sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va === null || va === undefined) va = sortDir === "asc" ? Infinity : -Infinity;
        if (vb === null || vb === undefined) vb = sortDir === "asc" ? Infinity : -Infinity;
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
      const tbody = tableEl.querySelector("tbody");
      tbody.innerHTML = data.map(renderRow).join("") || `<tr><td colspan="${columns.length}" style="padding:24px;text-align:center;color:var(--muted)">Aucun résultat.</td></tr>`;
      tableEl.querySelectorAll("thead th[data-key]").forEach(th => {
        th.querySelector(".arrow") && th.querySelector(".arrow").remove();
        if (th.dataset.key === sortKey) {
          const arrowEl = document.createElement("span");
          arrowEl.className = "arrow";
          arrowEl.textContent = sortDir === "asc" ? "↑" : "↓";
          th.appendChild(arrowEl);
        }
      });
      // Version cartes (mobile) : mêmes données, remplie en même temps que le
      // tableau à chaque tri/filtre, pour ne jamais désynchroniser les deux vues.
      if (cardsEl && renderCard) {
        cardsEl.innerHTML = data.map(renderCard).join("") || `<div style="padding:24px;text-align:center;color:var(--muted)">Aucun résultat.</div>`;
      }
      initTableScrollHints();
    }

    tableEl.querySelectorAll("thead th[data-key]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortKey = key; sortDir = "desc"; }
        apply();
      });
    });

    apply();
    return { refresh: apply, setFilter: fn => { filterFn = fn; apply(); } };
  }

  // Gabarit de carte réutilisable pour l'affichage mobile (mêmes infos qu'une
  // ligne de tableau, présentées empilées). `extras` : liste de [label, valeur].
  function rowCard({ href, code, title, tag, tagCls, price, extras = [] }) {
    return `<a href="${href}" class="card row-card">
      <div class="row-card-head">
        <div><span class="code-badge">${code}</span><div class="row-card-title">${title}</div></div>
        ${tag !== undefined ? `<span class="tag ${tagCls}">${tag}</span>` : ""}
      </div>
      ${price !== undefined ? `<div class="row-card-price num">${price}</div>` : ""}
      ${extras.length ? `<div class="row-card-extras">${extras.map(([l, v]) => `<div class="field"><span class="l">${l}</span><span class="v">${v}</span></div>`).join("")}</div>` : ""}
    </a>`;
  }

  /* ------------------------- Moteur "Bons plans" ------------------------- */
  // Score indicatif (0-100) combinant : valorisation (PER bas), dynamique du
  // jour, et liquidité. Volontairement transparent et limité : nous ne
  // disposons pas d'historique de dividendes ni de série longue par titre
  // tant que l'historique Drive n'a pas plusieurs mois de profondeur.
  function computeOpportunityScore(action) {
    const last = action.history[action.history.length - 1];
    const per = last.per;
    // Valorisation : PER entre 5 (excellent, score 100) et 40 (faible, score 0). Pas de PER => neutre 50.
    let scoreVal = 50;
    if (per !== null && per !== undefined && per > 0) {
      scoreVal = Math.max(0, Math.min(100, 100 - ((per - 5) / (40 - 5)) * 100));
    }
    // Dynamique du jour : -5% => 0, +5% => 100, borné.
    const v = last.variation ?? 0;
    const scoreMomentum = Math.max(0, Math.min(100, ((v + 5) / 10) * 100));
    // Liquidité : part de la valeur totale échangée ce jour (déjà en %), plafonnée à 15%.
    const liq = last.volValeurPct ?? 0;
    const scoreLiquidite = Math.max(0, Math.min(100, (liq / 15) * 100));

    const score = scoreVal * 0.5 + scoreMomentum * 0.3 + scoreLiquidite * 0.2;
    return { score: Math.round(score), scoreVal: Math.round(scoreVal), scoreMomentum: Math.round(scoreMomentum), scoreLiquidite: Math.round(scoreLiquidite), per, variation: v, liq };
  }

  /* ------------------------------ Nav / init ----------------------------- */
  function markActiveNav() {
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a[data-page]").forEach(a => {
      if (a.dataset.page === path) a.classList.add("active");
    });
  }

  function injectSessionPill(el, market, source) {
    if (!el) return;
    const label = source === "drive" ? "Historique Drive actif" : "Instantané du jour (Drive non configuré)";
    el.innerHTML = `<span class="blink"></span> Séance différée 15 min — MAJ ${market.date} ${market.heure} · ${label}`;
  }

  /* --------------------- Indice de défilement des tableaux -------------------- */
  // Sur mobile, les tableaux larges défilent horizontalement (voir .table-shell
  // dans style.css). Cette fonction masque automatiquement la flèche "→" une
  // fois qu'il n'y a plus rien à faire défiler à droite, et la réaffiche si le
  // contenu change (tri, filtre) ou si l'écran est redimensionné.
  function initTableScrollHints() {
    document.querySelectorAll(".table-shell").forEach(shell => {
      const check = () => {
        const atEnd = shell.scrollWidth - shell.clientWidth <= shell.scrollLeft + 2;
        const scrollable = shell.scrollWidth > shell.clientWidth + 2;
        shell.classList.toggle("at-end", atEnd || !scrollable);
      };
      check();
      shell.addEventListener("scroll", check, { passive: true });
      window.addEventListener("resize", check);
      const table = shell.querySelector("table.data");
      if (table && window.ResizeObserver) {
        new ResizeObserver(check).observe(table);
      }
    });
  }
  document.addEventListener("DOMContentLoaded", initTableScrollHints);

  /* --------------------- Révélation au défilement --------------------- */
  // Anime l'apparition de tout élément portant l'attribut [data-reveal],
  // y compris le contenu injecté APRÈS coup par les scripts de page
  // (tableaux, cartes d'indices...) grâce à un MutationObserver.
  let _revealIO = null;
  function _observeReveal(el) {
    if (!_revealIO || el.dataset.revealBound) return;
    el.dataset.revealBound = "1";
    _revealIO.observe(el);
  }
  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
      return;
    }
    _revealIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          _revealIO.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

    document.querySelectorAll("[data-reveal]").forEach(_observeReveal);

    new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches("[data-reveal]")) _observeReveal(node);
        node.querySelectorAll && node.querySelectorAll("[data-reveal]").forEach(_observeReveal);
      }));
    }).observe(document.body, { childList: true, subtree: true });

    // Filet de sécurité : si l'observer n'a rien déclenché (onglet en
    // arrière-plan au chargement, navigateur exotique…), on révèle tout
    // au bout de 2,4 s pour ne jamais laisser de contenu masqué.
    setTimeout(() => {
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-visible");
      });
    }, 2400);
  }

  /* ------------------------- Menu mobile ------------------------- */
  function initNav() {
    const toggle = document.querySelector(".nav-toggle");
    if (!toggle) return;
    const close = () => document.body.classList.remove("nav-open");
    toggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    document.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", close));
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    document.addEventListener("click", e => {
      if (document.body.classList.contains("nav-open") &&
          !e.target.closest(".nav") && !e.target.closest(".nav-toggle")) close();
    });
  }

  /* ------------------- Ombre d'en-tête au défilement ------------------- */
  function initHeaderScroll() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------------- Compteur animé (count-up) --------------------- */
  // Anime un nombre de 0 à sa valeur finale. Usage : BRVM.countUp(el, 1234, {decimals:2, suffix:' %'}).
  function countUp(el, target, { decimals = 0, duration = 900, prefix = "", suffix = "" } = {}) {
    if (!el || Number.isNaN(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = prefix + fmtNum(target, decimals) + suffix; return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + fmtNum(target * eased, decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = prefix + fmtNum(target, decimals) + suffix;
    };
    requestAnimationFrame(step);
  }

  function initAll() {
    markActiveNav();
    initNav();
    initHeaderScroll();
    initReveal();
    initTableScrollHints();
  }
  document.addEventListener("DOMContentLoaded", initAll);

  return {
    fmtFCFA, fmtNum, fmtPct, pctClass, tagClass, arrow, parseDateFR,
    renderTicker, actionsAsArray, obligationsAsArray, indicesAsArray, obligationType,
    drawLineChart, makeSortableTable, rowCard, computeOpportunityScore, markActiveNav, injectSessionPill,
    initTableScrollHints, initReveal, initNav, initHeaderScroll, countUp
  };
})();