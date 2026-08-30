/**
 * motion.js — couche d'animation & micro-interactions de BRVM Live.
 * ------------------------------------------------------------------
 * Aucune dépendance externe (pas de Framer Motion, pas de CDN) : tout
 * est fait maison en Canvas / requestAnimationFrame / IntersectionObserver.
 *
 * Chaque sous-système est isolé dans un try/catch : si l'un échoue, les
 * autres continuent, et le site reste 100 % utilisable sans JS (toutes
 * les améliorations sont conditionnées à la classe <html class="motion">).
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";
  var D = document, root = D.documentElement;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("motion");

  var run = function (label, fn) { try { fn(); } catch (e) { console.warn("[motion] " + label, e); } };
  var onReady = function (fn) {
    if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", fn);
    else fn();
  };

  /* =================================================================
     1. TRANSITIONS DE PAGE  (effet « Framer Motion » fait main)
     ================================================================= */
  run("transitions", function () {
    var MONO = '<svg class="pt-logo" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="60" cy="60" r="52" stroke="url(#ptg)" stroke-width="2.5" stroke-dasharray="4 8" class="pt-ring"/>' +
      '<circle cx="60" cy="60" r="40" fill="#0c0c0f" stroke="rgba(240,178,75,.35)" stroke-width="1"/>' +
      '<text x="60" y="76" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="46" font-weight="700" fill="url(#ptg)">₣</text>' +
      '<defs><linearGradient id="ptg" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#ffe6ad"/><stop offset="1" stop-color="#e78f37"/></linearGradient></defs></svg>';

    var el = D.createElement("div");
    el.className = "page-transition";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="pt-fill pt-fill-a"></div><div class="pt-fill pt-fill-b"></div>' + MONO;
    onReady(function () { D.body.appendChild(el); playEnter(); });

    var LEAVING = false;

    function playEnter() {
      var navigated = false;
      try { navigated = sessionStorage.getItem("brvm_nav") === "1"; } catch (e) {}
      try { sessionStorage.removeItem("brvm_nav"); } catch (e) {}
      if (REDUCED) return;
      if (navigated) {
        el.classList.add("is-cover");
        // force reflow puis on lève le rideau
        void el.offsetWidth;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { el.classList.remove("is-cover"); el.classList.add("is-reveal"); });
        });
        clearCover(720);
      }
    }
    function clearCover(ms) {
      setTimeout(function () { el.classList.remove("is-cover", "is-reveal"); }, ms);
    }

    function leaveTo(url) {
      if (LEAVING) return;
      LEAVING = true;
      try { sessionStorage.setItem("brvm_nav", "1"); } catch (e) {}
      if (REDUCED) { location.href = url; return; }
      el.classList.add("is-cover");
      var done = false, go = function () { if (!done) { done = true; location.href = url; } };
      el.addEventListener("transitionend", function h(ev) {
        if (ev.propertyName === "transform" || ev.propertyName === "clip-path") { el.removeEventListener("transitionend", h); go(); }
      });
      setTimeout(go, 620); // filet de sécurité
    }

    function sameOriginDoc(a) {
      return a && a.href && a.origin === location.origin &&
        /\.html?($|[?#])/.test(a.pathname + a.search) === false ? true : true;
    }
    function eligible(a, e) {
      if (!a || e.defaultPrevented) return false;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      if (a.target && a.target !== "_self") return false;
      if (a.hasAttribute("download")) return false;
      var rel = (a.getAttribute("rel") || "").toLowerCase();
      if (rel.indexOf("external") > -1) return false;
      if (a.origin !== location.origin) return false;
      var href = a.getAttribute("href") || "";
      if (!href || href[0] === "#" || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
      // même page (juste une ancre) -> pas de transition
      if (a.pathname === location.pathname && a.search === location.search && a.hash) return false;
      return true;
    }

    // Liens classiques
    D.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!eligible(a, e)) return;
      e.preventDefault();
      leaveTo(a.href);
    });

    // Lignes de tableau / cartes score : onclick="location.href='...'"
    D.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      var t = e.target.closest && e.target.closest("[onclick]");
      if (!t || t.closest("a")) return;
      var m = String(t.getAttribute("onclick")).match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (!m) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      leaveTo(new URL(m[1], location.href).href);
    }, true);

    // Retour arrière / bfcache
    window.addEventListener("pageshow", function (ev) {
      LEAVING = false;
      if (ev.persisted) { el.classList.remove("is-cover", "is-reveal"); }
    });
  });

  /* =================================================================
     2. CANVAS « MARCHÉ EN DIRECT » derrière le hero
     ================================================================= */
  run("hero-canvas", function () {
    if (REDUCED) return;
    onReady(function () {
      var hero = D.querySelector(".hero");
      if (!hero) return;
      var cv = D.createElement("canvas");
      cv.className = "hero-canvas";
      cv.setAttribute("aria-hidden", "true");
      var bg = hero.querySelector(".hero-bg");
      if (bg) bg.after(cv); else hero.prepend(cv);

      var ctx = cv.getContext("2d");
      var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
      var candles = [], glyphs = [], t0 = performance.now(), lastPush = 0, price = 100, running = true;
      var GLYPH_CHARS = ["₣", "$", "€", "₦", "¢"];

      function resize() {
        var r = hero.getBoundingClientRect();
        W = Math.max(r.width, 320); H = Math.max(r.height, 260);
        cv.width = W * DPR; cv.height = H * DPR;
        cv.style.width = W + "px"; cv.style.height = H + "px";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
      resize();
      window.addEventListener("resize", resize);

      function seedCandles() {
        candles = [];
        var n = Math.ceil(W / 26) + 4;
        for (var i = 0; i < n; i++) candles.push(makeCandle());
      }
      function makeCandle() {
        var drift = (Math.random() - 0.48) * 6;
        var open = price;
        price = Math.max(20, price + drift);
        var close = price;
        var hi = Math.max(open, close) + Math.random() * 4;
        var lo = Math.min(open, close) - Math.random() * 4;
        return { o: open, c: close, h: hi, l: lo };
      }
      seedCandles();

      function spawnGlyph() {
        glyphs.push({
          ch: GLYPH_CHARS[(Math.random() * GLYPH_CHARS.length) | 0],
          x: Math.random() * W,
          y: H + 20,
          vy: 0.25 + Math.random() * 0.5,
          size: 12 + Math.random() * 26,
          a: 0.04 + Math.random() * 0.12,
          rot: (Math.random() - 0.5) * 0.6
        });
      }
      for (var g = 0; g < 7; g++) { spawnGlyph(); glyphs[g].y = Math.random() * H; }

      function frame(now) {
        if (!running) return;
        var dt = Math.min(now - t0, 50); t0 = now;
        ctx.clearRect(0, 0, W, H);

        // grille
        ctx.strokeStyle = "rgba(255,255,255,.035)";
        ctx.lineWidth = 1;
        for (var y = H; y > 0; y -= 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // défilement des bougies
        var speed = dt * 0.024;
        for (var i = 0; i < candles.length; i++) candles[i]._x = (candles[i]._x == null ? i * 26 : candles[i]._x) - speed;
        if (now - lastPush > 620) {
          lastPush = now;
          var last = candles[candles.length - 1];
          var nc = makeCandle(); nc._x = (last._x || 0) + 26;
          candles.push(nc);
          while (candles.length && candles[0]._x < -30) candles.shift();
        }

        // échelle verticale sur la fenêtre visible
        var vals = [];
        candles.forEach(function (c) { vals.push(c.h, c.l); });
        var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
        if (mx - mn < 1) { mx += 1; mn -= 1; }
        var pad = (mx - mn) * 0.18; mn -= pad; mx += pad;
        var Y = function (v) { return H - ((v - mn) / (mx - mn)) * H; };

        // bougies
        candles.forEach(function (c) {
          var x = c._x; if (x < -20 || x > W + 20) return;
          var up = c.c >= c.o;
          var col = up ? "rgba(64,224,160,.55)" : "rgba(255,106,106,.5)";
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
          var yTop = Y(Math.max(c.o, c.c)), hgt = Math.max(Math.abs(Y(c.o) - Y(c.c)), 1.5);
          ctx.fillRect(x - 4, yTop, 8, hgt);
        });

        // ligne lissée + aire lumineuse
        ctx.beginPath();
        candles.forEach(function (c, i) {
          var x = c._x, y = Y((c.o + c.c) / 2);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        var grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "rgba(240,178,75,.18)");
        grad.addColorStop(1, "rgba(240,178,75,0)");
        ctx.lineTo(candles[candles.length - 1]._x, H);
        ctx.lineTo(candles[0]._x, H);
        ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();

        ctx.beginPath();
        candles.forEach(function (c, i) {
          var x = c._x, y = Y((c.o + c.c) / 2);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.strokeStyle = "rgba(240,178,75,.85)";
        ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.shadowColor = "rgba(240,178,75,.9)"; ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // glyphes monétaires flottants
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (var k = glyphs.length - 1; k >= 0; k--) {
          var gl = glyphs[k];
          gl.y -= gl.vy * (dt / 16);
          ctx.save();
          ctx.translate(gl.x, gl.y); ctx.rotate(gl.rot);
          ctx.fillStyle = "rgba(240,178,75," + gl.a + ")";
          ctx.font = "600 " + gl.size + "px 'IBM Plex Mono', monospace";
          ctx.fillText(gl.ch, 0, 0);
          ctx.restore();
          if (gl.y < -30) glyphs.splice(k, 1);
        }
        if (glyphs.length < 8 && Math.random() < 0.03) spawnGlyph();

        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      D.addEventListener("visibilitychange", function () {
        running = !D.hidden;
        if (running) { t0 = performance.now(); lastPush = t0; requestAnimationFrame(frame); }
      });
    });
  });

  /* =================================================================
     3. COMPTEURS ANIMÉS (count-up) sur les chiffres clés
     ================================================================= */
  run("counters", function () {
    onReady(function () {
      var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); animate(en.target); } });
      }, { threshold: 0.4 }) : null;

      function parse(str) {
        var s = String(str).trim();
        if (/\d[-/]\d/.test(s)) return null;                       // dates / plages : ignore
        var m = s.match(/^([+-]?\d[\d.,\s\u00a0\u202f]*)(.*)$/);   // run numerique glouton + reste
        if (!m) return null;
        var numRaw = m[1].replace(/[\s\u00a0\u202f]/g, "");
        if (!/^[+-]?\d[\d.,]*$/.test(numRaw)) return null;
        var decimals = 0, dm = numRaw.match(/,(\d+)$/);
        if (dm) decimals = dm[1].length;
        var val = parseFloat(numRaw.replace(/\./g, "").replace(",", "."));
        if (!isFinite(val)) return null;
        var suffix = (m[2] || "").trim();
        if (suffix && !/^[A-Za-zÀ-ÿ%€$₣¢.\s]{1,10}$/.test(suffix)) return null;
        return { val: val, decimals: Math.min(decimals, 2), suffix: suffix };
      }
      function fmt(n, d) {
        return (window.BRVM && BRVM.fmtNum) ? BRVM.fmtNum(n, d)
          : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
      }
      function targetNode(el) {
        if (el.classList.contains("px")) {
          for (var i = 0; i < el.childNodes.length; i++)
            if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) return el.childNodes[i];
          return null;
        }
        return el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.firstChild
          : (el.children.length === 0 ? el : null);
      }
      function animate(el) {
        if (el.dataset.counted) return;
        var node = targetNode(el);
        if (!node) return;
        var raw = node.nodeType === 3 ? node.nodeValue : node.textContent;
        var trail = node.nodeType === 3 && /\s$/.test(raw) ? " " : "";
        var p = parse(raw);
        if (!p || Math.abs(p.val) < 0.001) { el.dataset.counted = "1"; return; }
        el.dataset.counted = "1";
        var dur = 1100, start = performance.now(), set;
        set = function (txt) { if (node.nodeType === 3) node.nodeValue = txt; else node.textContent = txt; };
        var tail = p.suffix ? " " + p.suffix : trail;
        function step(now) {
          var k = Math.min((now - start) / dur, 1), e = 1 - Math.pow(1 - k, 3);
          set(fmt(p.val * e, p.decimals) + tail);
          if (k < 1) requestAnimationFrame(step);
          else set(fmt(p.val, p.decimals) + tail);
        }
        requestAnimationFrame(step);
      }

      var SEL = ".board-cell .value, .metric-cell .v, .detail-price .px, .detail-hero .px";
      function scan(scope) {
        (scope || D).querySelectorAll(SEL).forEach(function (el) {
          if (el.dataset.seen) return; el.dataset.seen = "1";
          io ? io.observe(el) : animate(el);
        });
      }
      scan(D);
      var host = D.querySelector("main") || D.body;
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) if (muts[i].addedNodes.length) { scan(D); break; }
      }).observe(host, { childList: true, subtree: true });
    });
  });

  /* =================================================================
     4. BARRES DE SCORE : remplissage animé depuis 0
     ================================================================= */
  run("score-bars", function () {
    if (REDUCED) return;
    onReady(function () {
      var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          var w = en.target.dataset.w;
          requestAnimationFrame(function () { en.target.style.width = w; });
        });
      }, { threshold: 0.3 }) : null;
      function scan() {
        D.querySelectorAll(".score-bar-fill").forEach(function (el) {
          if (el.dataset.w != null) return;
          el.dataset.w = el.style.width || "0%";
          el.style.width = "0%";
          io ? io.observe(el) : (el.style.width = el.dataset.w);
        });
      }
      scan();
      var host = D.querySelector("main") || D.body;
      new MutationObserver(function () { scan(); }).observe(host, { childList: true, subtree: true });
    });
  });

  /* =================================================================
     5. SPOTLIGHT qui suit le curseur sur les cartes
     ================================================================= */
  run("spotlight", function () {
    if (REDUCED || !window.matchMedia("(hover:hover)").matches) return;
    onReady(function () {
      var SEL = ".card, .board-cell, .metric-cell, .glossary-item, .score-row";
      function bind(el) {
        if (el.dataset.spot) return; el.dataset.spot = "1";
        el.classList.add("spotlight");
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          el.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
          el.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
        });
      }
      function scan() { D.querySelectorAll(SEL).forEach(bind); }
      scan();
      var host = D.querySelector("main") || D.body;
      new MutationObserver(function () { scan(); }).observe(host, { childList: true, subtree: true });
    });
  });

  /* =================================================================
     6. BOUTONS MAGNÉTIQUES
     ================================================================= */
  run("magnetic", function () {
    if (REDUCED || !window.matchMedia("(hover:hover)").matches) return;
    onReady(function () {
      function bind(btn) {
        if (btn.dataset.mag) return; btn.dataset.mag = "1";
        btn.addEventListener("pointermove", function (e) {
          var r = btn.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          btn.style.transform = "translate(" + (dx * 10).toFixed(1) + "px," + (dy * 10).toFixed(1) + "px)";
        });
        btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
      }
      D.querySelectorAll(".btn").forEach(bind);
      var host = D.querySelector("main") || D.body;
      new MutationObserver(function () { D.querySelectorAll(".btn").forEach(bind); }).observe(host, { childList: true, subtree: true });
    });
  });

})();
