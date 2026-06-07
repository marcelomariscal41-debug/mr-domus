(function () {
  "use strict";

  // run ASAP: stop the browser from restoring scroll onto the pinned hero
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (_) {}

  /* ---------- Helpers ---------- */
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------- Header: transparent -> solid on scroll ---------- */
  function initNav() {
    const nav = $("[data-nav]");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Smooth anchor scrolling (native, offset by nav) ---------- */
  function initAnchors() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveals() {
    const els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-revealed"); io.unobserve(e.target); }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });
    els.forEach((el) => io.observe(el));
    // safety net: reveal anything still hidden in-view after 6s
    setTimeout(() => {
      document.querySelectorAll("[data-reveal]:not(.is-revealed)").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-revealed");
      });
    }, 6000);
  }

  /* ---------- Gallery: vertical 3D card stack ---------- */
  function initStack() {
    const stack = $("[data-stack]");
    if (!stack) return;
    const viewport = stack.querySelector("[data-stack-viewport]");
    const cards = Array.from(stack.querySelectorAll("[data-card]"));
    const dotsWrap = $("[data-stack-dots]");
    const curEl = $("[data-stack-cur]");
    const totEl = $("[data-stack-tot]");
    const prevBtn = $("[data-stack-prev]");
    const nextBtn = $("[data-stack-next]");
    const N = cards.length;
    if (!viewport || !N) return;

    let current = 0, lock = 0, onScreen = true;
    if (totEl) totEl.textContent = String(N).padStart(2, "0");

    const dots = [];
    if (dotsWrap) {
      cards.forEach((_, i) => {
        const b = document.createElement("button");
        b.className = "stack-dot"; b.type = "button";
        b.setAttribute("aria-label", "Ir para o vídeo " + (i + 1));
        b.addEventListener("click", () => goTo(i));
        dotsWrap.appendChild(b); dots.push(b);
      });
    }

    function styleFor(diff) {
      if (diff === 0)  return { x: 0,    s: 1,   o: 1,   z: 5, ry: 0 };
      if (diff === -1) return { x: -190, s: .84, o: .55, z: 4, ry: 16 };
      if (diff === -2) return { x: -335, s: .7,  o: .28, z: 3, ry: 24 };
      if (diff === 1)  return { x: 190,  s: .84, o: .55, z: 4, ry: -16 };
      if (diff === 2)  return { x: 335,  s: .7,  o: .28, z: 3, ry: -24 };
      return { x: diff > 0 ? 480 : -480, s: .6, o: 0, z: 0, ry: diff > 0 ? -30 : 30 };
    }
    function layout() {
      cards.forEach((card, i) => {
        let diff = i - current;
        if (diff > N / 2) diff -= N;
        if (diff < -N / 2) diff += N;
        const st = styleFor(diff);
        card.style.transform = "translate(-50%, -50%) translateX(" + st.x + "px) scale(" + st.s + ") rotateY(" + st.ry + "deg)";
        card.style.opacity = String(st.o);
        card.style.zIndex = String(st.z);
        card.style.pointerEvents = Math.abs(diff) <= 2 ? "auto" : "none";
        card.classList.toggle("is-active", i === current);
      });
      dots.forEach((d, i) => d.classList.toggle("is-active", i === current));
      if (curEl) curEl.textContent = String(current + 1).padStart(2, "0");
      playActive();
    }
    function playActive() {
      cards.forEach((card, i) => {
        const v = card.querySelector("video");
        if (!v) return;
        if (i === current && onScreen) {
          v.play().catch(() => {});
        } else {
          v.pause();
          try { v.currentTime = 0; } catch (_) {} // restart from the beginning next time
        }
      });
    }
    function navigate(dir) {
      const now = Date.now();
      if (now - lock < 420) return;
      lock = now;
      current = (current + dir + N) % N;
      layout();
    }
    function goTo(i) { if (i === current) return; current = i; layout(); }

    // drag / swipe (horizontal)
    let dragging = false, startX = 0, moved = 0;
    viewport.addEventListener("pointerdown", (e) => {
      dragging = true; startX = e.clientX; moved = 0;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    });
    viewport.addEventListener("pointermove", (e) => { if (dragging) moved = e.clientX - startX; });
    function endDrag() {
      if (!dragging) return; dragging = false;
      const TH = 46;
      if (moved < -TH) navigate(1);
      else if (moved > TH) navigate(-1);
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);

    // click a peeking card to bring it to front (ignore if it was a drag)
    cards.forEach((card, i) => {
      card.addEventListener("click", () => { if (Math.abs(moved) <= 6 && i !== current) goTo(i); });
      const btn = card.querySelector("[data-sound]");
      const v = card.querySelector("video");
      if (btn && v) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          v.muted = !v.muted;
          const on = !v.muted;
          card.classList.toggle("is-unmuted", on);
          btn.setAttribute("aria-pressed", String(on));
          btn.setAttribute("aria-label", on ? "Desativar som" : "Ativar som");
          if (on) v.play().catch(() => {});
        });
      }
    });

    if (prevBtn) prevBtn.addEventListener("click", () => navigate(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => navigate(1));

    stack.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); navigate(-1); }
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); navigate(1); }
    });

    // pause all videos when the gallery is off-screen
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { onScreen = e.isIntersecting; });
      playActive();
    }, { threshold: 0.2 });
    io.observe(stack);

    layout();
  }

  /* ---------- Hero glowing waves (mouse-reactive canvas) ---------- */
  function initHeroWaves() {
    const canvas = $("[data-waves]");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const hero = canvas.closest(".hero") || canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const isMobile = matchMedia("(hover: none)").matches || window.innerWidth < 760;

    const WAVES = [
      { offset: 0,            amp: 70, freq: 0.0030, color: "rgba(0,71,255,0.95)",   op: 0.52 },
      { offset: Math.PI / 2,  amp: 92, freq: 0.0026, color: "rgba(79,132,255,0.85)", op: 0.42 },
      { offset: Math.PI,      amp: 60, freq: 0.0034, color: "rgba(143,180,255,0.7)", op: 0.34 },
      { offset: Math.PI * 1.5,amp: 80, freq: 0.0022, color: "rgba(120,160,255,0.5)", op: 0.26 },
      { offset: Math.PI * 2,  amp: 55, freq: 0.0040, color: "rgba(185,210,255,0.45)",op: 0.20 }
    ];
    const waves = isMobile ? WAVES.slice(0, 3) : WAVES;

    const influence = reduced ? 12 : 70;
    const radius = reduced ? 180 : 320;
    const smooth = reduced ? 0.05 : 0.1;

    let w = 0, h = 0, t = 0, raf = null;
    const mouse = { x: 0, y: 0 }, target = { x: 0, y: 0 };

    function resize() {
      const r = hero.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mouse.x = target.x = w / 2; mouse.y = target.y = h / 2;
    }
    resize();
    window.addEventListener("resize", resize);

    if (!isMobile) {
      window.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect();
        target.x = e.clientX - r.left; target.y = e.clientY - r.top;
      }, { passive: true });
      window.addEventListener("mouseleave", () => { target.x = w / 2; target.y = h / 2; });
    }

    function draw() {
      t += 1;
      mouse.x += (target.x - mouse.x) * smooth;
      mouse.y += (target.y - mouse.y) * smooth;
      ctx.clearRect(0, 0, w, h);
      for (const wv of waves) {
        ctx.save(); ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const dx = x - mouse.x, dy = h / 2 - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const inf = Math.max(0, 1 - dist / radius);
          const me = inf * influence * Math.sin(t * 0.001 + x * 0.01 + wv.offset);
          const y = h / 2
            + Math.sin(x * wv.freq + t * 0.002 + wv.offset) * wv.amp
            + Math.sin(x * wv.freq * 0.4 + t * 0.003) * (wv.amp * 0.45)
            + me;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 2.8; ctx.strokeStyle = wv.color; ctx.globalAlpha = wv.op;
        ctx.shadowBlur = 38; ctx.shadowColor = wv.color; ctx.stroke();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    }

    // run only while hero is on screen
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { if (!raf) raf = requestAnimationFrame(draw); }
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      });
    }, { threshold: 0 });
    io.observe(hero);
  }

  /* ---------- Pricing: pointer-following blue glow ---------- */
  function initPricing() {
    const sec = $("[data-pricing]");
    if (!sec) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return; // glow only for real pointers
    sec.addEventListener("pointermove", (e) => {
      sec.classList.add("is-glowing");
      sec.style.setProperty("--x", e.clientX.toFixed(1));
      sec.style.setProperty("--y", e.clientY.toFixed(1));
    }, { passive: true });
    sec.addEventListener("pointerleave", () => sec.classList.remove("is-glowing"));
  }

  /* ---------- Testimonials: draggable shuffle deck ---------- */
  function initTestimonials() {
    const wrap = $("[data-tcards]");
    if (!wrap) return;
    const cards = Array.from(wrap.querySelectorAll("[data-tcard]"));
    const N = cards.length;
    if (!N) return;

    let order = cards.map((_, i) => i); // order[0] = front
    let dragging = false, startX = 0, dx = 0;

    const spread = () => (window.innerWidth < 560 ? 0.20 : 0.32);
    function render(animate) {
      const cw = cards[0].offsetWidth || 320;
      order.forEach((idx, pos) => {
        const el = cards[idx];
        const off = (pos - 1) * spread() * cw;
        const rot = (pos - 1) * 6;
        const sc = pos === 0 ? 1 : 0.95;
        el.style.transition = animate === false ? "none" : "";
        el.style.transform = "translate(-50%, -50%) translateX(" + off + "px) rotate(" + rot + "deg) scale(" + sc + ")";
        el.style.zIndex = String(N - pos);
        el.style.opacity = pos === 2 ? "0.92" : "1";
        el.classList.toggle("is-front", pos === 0);
      });
    }
    function next() { order.push(order.shift()); render(); }   // front -> back
    function prev() { order.unshift(order.pop()); render(); }  // back -> front

    wrap.addEventListener("pointerdown", (e) => {
      const card = e.target.closest("[data-tcard]");
      if (!card || card !== cards[order[0]]) return;
      dragging = true; startX = e.clientX; dx = 0;
      card.style.transition = "none";
      try { card.setPointerCapture(e.pointerId); } catch (_) {}
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      const front = cards[order[0]];
      const cw = cards[0].offsetWidth || 320;
      const off = -spread() * cw + dx;
      front.style.transform = "translate(-50%, -50%) translateX(" + off + "px) rotate(" + (-6 + dx * 0.025) + "deg)";
    });
    function endDrag() {
      if (!dragging) return; dragging = false;
      if (dx < -110) next();
      else if (dx > 110) prev();
      else render();
      dx = 0;
    }
    wrap.addEventListener("pointerup", endDrag);
    wrap.addEventListener("pointercancel", endDrag);

    const nextBtn = $("[data-tcards-next]"), prevBtn = $("[data-tcards-prev]");
    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);

    window.addEventListener("resize", () => render(false));
    render(false);
    requestAnimationFrame(() => render());
  }

  /* ---------- Hero scroll scrubbing (Apple AirPods style) ---------- */
  function initHeroScrub() {
    const canvas = $("[data-hero-canvas]");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const hero = canvas.closest(".hero");
    const inner = $("[data-hero-inner]");
    const cue = $(".hero-scroll");

    const COUNT = 85;
    const pad = (n) => String(n).padStart(3, "0");
    const urlOf = (i) => "assets/frames/f_" + pad(i + 1) + ".webp"; // files are 1-based
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const images = new Array(COUNT);
    let current = -1, lastGood = null;

    function sizeCanvas() {
      const r = hero.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawCover(img) {
      if (!img || !img.naturalWidth) return;
      const cw = canvas.width / dpr, ch = canvas.height / dpr;
      const ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
      let dw, dh;
      if (cr > ir) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }
    function showFrame(i) {
      i = Math.max(0, Math.min(COUNT - 1, i));
      const img = images[i];
      if (img && img.complete && img.naturalWidth) {
        drawCover(img); lastGood = img; current = i;
      } else if (lastGood) {
        drawCover(lastGood); // keep last good frame while the target loads
      }
    }
    function redraw() {
      const img = (current >= 0 && images[current] && images[current].complete) ? images[current] : lastGood;
      drawCover(img);
    }

    // preload all frames
    for (let i = 0; i < COUNT; i++) {
      const im = new Image();
      im.decoding = "async";
      im.src = urlOf(i);
      im.onload = () => { if (i === 0 && current < 0) { sizeCanvas(); showFrame(0); } };
      images[i] = im;
    }

    sizeCanvas();
    showFrame(0);
    window.addEventListener("resize", () => { sizeCanvas(); redraw(); });

    function setContent(progress) {
      if (cue) cue.style.opacity = String(Math.max(0, 1 - progress * 4));
      if (!inner) return;
      if (progress < 0.65) { inner.style.opacity = ""; inner.style.transform = ""; }
      else {
        const o = Math.max(0, 1 - (progress - 0.65) / 0.3);
        inner.style.opacity = String(o);
        inner.style.transform = "translateY(" + (-(progress - 0.65) * 130) + "px)";
      }
    }

    if (window.gsap && window.ScrollTrigger) {
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "+=160%",
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          showFrame(Math.round(self.progress * (COUNT - 1)));
          setContent(self.progress);
        },
        onRefresh: () => { sizeCanvas(); redraw(); }
      });
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    // avoid browser scroll restoration desyncing the pinned hero on reload
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (_) {}
    window.scrollTo(0, 0);

    safe(initNav, "initNav");
    safe(initAnchors, "initAnchors");
    safe(initReveals, "initReveals");
    safe(initStack, "initStack");
    safe(initPricing, "initPricing");
    safe(initTestimonials, "initTestimonials");
    safe(initHeroWaves, "initHeroWaves");
    if (window.gsap && window.ScrollTrigger) {
      try { gsap.registerPlugin(ScrollTrigger); } catch (_) {}
    }
    safe(initHeroScrub, "initHeroScrub");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
