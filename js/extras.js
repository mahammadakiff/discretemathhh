// Video-inspired visuals: ghost words, glitch headings, ring of seven holders,
// the "two fingers meet" interlude, and the Thank You finale.
import * as S from './shamir.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGsap = typeof window.gsap !== 'undefined';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- ghost words drifting behind sections ---------- */
function initGhosts() {
  $$('section[data-ghost]').forEach((sec) => {
    const g = document.createElement('div');
    g.className = 'ghost';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = `${sec.dataset.ghost} · ${sec.dataset.ghost}`;
    sec.prepend(g);
    if (reduced || !hasGsap) return;
    gsap.fromTo(g, { xPercent: 0 }, {
      xPercent: -30, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}

/* ---------- RGB-split glitch reveal on headings ---------- */
function initGlitch() {
  if (reduced || !hasGsap) return;
  $$('.section__head h2, .ring7__title').forEach((h) => {
    gsap.fromTo(h,
      { textShadow: '8px 0 rgba(255,40,100,.75), -8px 0 rgba(45,212,191,.85)', filter: 'blur(6px)', skewX: -8 },
      { textShadow: '0px 0 rgba(255,40,100,0), 0px 0 rgba(45,212,191,0)', filter: 'blur(0px)', skewX: 0, duration: 1.1, ease: 'expo.out',
        clearProps: 'filter',
        scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
  });
}

/* ---------- ring of the seven holders ---------- */
function initRing() {
  const box = $('#ring-cards'), center = $('.ring7__center'), countEl = $('#ring-count'), stateEl = $('#ring-state');
  const P = 17n;
  const shares = S.makeShares(S.EXAMPLE.coeffs, 7, P);
  box.innerHTML = shares.map((sh) => `<button type="button" class="rcard" aria-pressed="false" data-x="${sh.x}" aria-label="Holder ${sh.x}, share (${sh.x}, ${sh.y})"><span class="rcard__h">Holder ${sh.x}</span><span class="rcard__v">(${sh.x}, ${sh.y})</span><span class="rcard__s">f(${sh.x}) mod 17</span></button>`).join('');
  const cards = $$('.rcard', box);
  const picked = new Set();
  let angle = 0, spin = 0; // degrees: angle from the buttons, spin from scrolling

  const layout = () => {
    const W = box.clientWidth, H = box.clientHeight;
    const cw = cards[0].offsetWidth, ch = cards[0].offsetHeight;
    const R = Math.min(W, H) / 2 - Math.max(cw, ch) / 2 - 4;
    cards.forEach((c, i) => {
      const a = ((angle + spin + (i * 360) / 7 - 90) * Math.PI) / 180;
      const x = W / 2 + R * Math.cos(a) - cw / 2, y = H / 2 + R * Math.sin(a) - ch / 2;
      const depth = (Math.sin(a) + 1) / 2; // 0 at the top, 1 at the bottom
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateY(${(Math.cos(a) * -18).toFixed(1)}deg) scale(${(0.88 + depth * 0.14).toFixed(3)})`;
      c.style.zIndex = String(Math.round(depth * 10));
    });
  };

  const status = () => {
    const k = picked.size;
    countEl.textContent = `${k} / 7`;
    if (k >= 5) {
      const s = S.recover(shares.filter((sh) => picked.has(Number(sh.x))), P);
      stateEl.textContent = `Unlocked: secret = ${s}`;
      center.classList.add('is-open');
    } else {
      stateEl.textContent = k === 0 ? 'Choose holders' : k === 4 ? 'Locked: all 17 secrets still possible' : `Locked: need ${5 - k} more`;
      center.classList.remove('is-open');
    }
  };

  const sync = () => cards.forEach((c) => c.setAttribute('aria-pressed', String(picked.has(Number(c.dataset.x)))));
  box.addEventListener('click', (e) => {
    const c = e.target.closest('.rcard');
    if (!c) return;
    const x = Number(c.dataset.x);
    if (picked.has(x)) picked.delete(x); else picked.add(x);
    sync();
    status();
  });
  const setAll = (xs) => { picked.clear(); xs.forEach((x) => picked.add(x)); sync(); status(); };
  $('#ring-five').addEventListener('click', () => setAll([2, 3, 5, 6, 7]));
  $('#ring-clear').addEventListener('click', () => setAll([]));

  const turn = (d) => {
    if (hasGsap && !reduced) {
      const o = { v: angle };
      gsap.to(o, { v: angle + d, duration: 0.6, ease: 'power3.out', onUpdate: () => { angle = o.v; layout(); } });
    } else { angle += d; layout(); }
  };
  $('#ring-prev').addEventListener('click', () => turn(-360 / 7));
  $('#ring-next').addEventListener('click', () => turn(360 / 7));
  addEventListener('resize', layout);
  if (!reduced && hasGsap) {
    ScrollTrigger.create({ trigger: '#ring7', start: 'top bottom', end: 'bottom top', scrub: 0.6, onUpdate: (st) => { spin = st.progress * 160; layout(); } });
  }
  layout();
  status();
}

/* ---------- interlude: two fingers meet (Creation of Adam motif) ---------- */
function initSpark() {
  const svg = $('#spark-svg'), L = $('#hand-l'), R = $('#hand-r');
  const dot = $('#spark-dot'), ring = $('#spark-ring');
  const sharesEl = $('#spark-shares'), title = $('#spark-title'), cap = $('#spark-cap');
  const setView = () => svg.setAttribute('viewBox', innerWidth < 700 ? '396 50 540 280' : '0 0 1328 360');
  setView();
  addEventListener('resize', setView);

  const texts = (k) => {
    sharesEl.textContent = `Shares present: ${k} of 5`;
    if (k >= 5) {
      title.innerHTML = 'The fifth share <span class="accent">touches.</span>';
      cap.textContent = 'Contact: five points fix the curve, and the secret appears: 11.';
    } else {
      title.innerHTML = 'Almost touching <span class="muted">is not touching.</span>';
      cap.textContent = k === 4
        ? 'Four shares come this close, yet nothing passes between them: every secret is still equally likely.'
        : 'The shares reach toward each other…';
    }
  };

  if (reduced || !hasGsap) {
    dot.setAttribute('opacity', '1');
    texts(5);
    return;
  }
  gsap.set(L, { x: -820 });
  gsap.set(R, { x: 820 });
  let last = -1;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#spark', start: 'top top', end: () => `+=${innerHeight * 1.8}`, scrub: 0.8,
      pin: '.spark__pin', anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: (st) => {
        const p = st.progress;
        const k = p >= 0.9 ? 5 : Math.min(4, Math.ceil(p / 0.18));
        if (k !== last) { last = k; texts(k); }
      },
    },
  });
  tl.to(L, { x: -14, duration: 0.7, ease: 'power2.out' }, 0)
    .to(R, { x: 14, duration: 0.7, ease: 'power2.out' }, 0)
    .to({}, { duration: 0.18 })
    .to(L, { x: 8, duration: 0.06, ease: 'power1.in' })
    .to(R, { x: -9, duration: 0.06, ease: 'power1.in' }, '<')
    .fromTo(dot, { attr: { opacity: 0, r: 10 } }, { attr: { opacity: 1, r: 90 }, duration: 0.08, ease: 'power2.out' }, '>-0.01')
    .fromTo(ring, { attr: { opacity: 0.9, r: 10 } }, { attr: { opacity: 0, r: 260 }, duration: 0.1, ease: 'power2.out' }, '<');
  texts(0);
}

/* ---------- finale: THANK / YOU part around the card ---------- */
function initThanks() {
  if (reduced || !hasGsap) return;
  const card = $('.thanks__card'), wl = $('.thanks__w--l'), wr = $('.thanks__w--r'), sub = $('.thanks__sub');
  // start: both words pulled onto the centre of the card, big; end: their natural places above and below it
  const toCenter = (w) => {
    // offsetTop ignores transforms, so this is stable while the tween runs
    return (card.offsetTop + card.offsetHeight / 2) - (w.offsetTop + w.offsetHeight / 2);
  };
  gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: '#thanks', start: 'top top', end: () => `+=${innerHeight * 1.2}`, scrub: 0.8,
      pin: '.thanks__pin', anticipatePin: 1, invalidateOnRefresh: true,
    },
  })
    .fromTo(card, { scale: 0.55, opacity: 0.25, filter: 'grayscale(1) brightness(.6)' }, { scale: 1, opacity: 1, filter: 'grayscale(0) brightness(1)', duration: 1 }, 0)
    .fromTo(wl, { y: () => toCenter(wl) - wl.offsetHeight * 0.55, scale: 1.6 }, { y: 0, scale: 1, duration: 1 }, 0)
    .fromTo(wr, { y: () => toCenter(wr) + wr.offsetHeight * 0.55, scale: 1.6 }, { y: 0, scale: 1, duration: 1 }, 0)
    .fromTo('.thanks__beam', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.4)
    .fromTo(sub, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 0.6);
}

/* ---------- Thank-you card: real GIF if provided, otherwise GIF-like motion ---------- */
function initThanksCard() {
  const card = $('.thanks__card'), img = $('img', card), cv = $('.thanks__fx', card);
  if (img.dataset.gif) { img.src = img.dataset.gif; card.classList.add('is-gif'); return; }
  if (reduced) return;
  card.classList.add('is-live');
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, raf = 0, on = false;
  const sparks = [], bursts = [];
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  for (let i = 0; i < 26; i++) sparks.push({ x: Math.random(), y: Math.random() * 0.75, r: 1 + Math.random() * 2.6, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6 });
  const burst = () => {
    const side = Math.random() < 0.5 ? 0.12 + Math.random() * 0.2 : 0.68 + Math.random() * 0.2;
    const cx = side * w, cy = (0.12 + Math.random() * 0.3) * h, n = 26, hue = [45, 185, 30, 200][Math.floor(Math.random() * 4)];
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, v = 0.8 + Math.random() * 1.4; bursts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue }); }
  };
  let t = 0, next = 30;
  const frame = () => {
    t++;
    ctx.clearRect(0, 0, w, h);
    for (const s of sparks) {
      const a = 0.25 + 0.75 * Math.max(0, Math.sin(s.ph + t * 0.04 * s.sp));
      const g = ctx.createRadialGradient(s.x * w, s.y * h, 0, s.x * w, s.y * h, s.r * 4);
      g.addColorStop(0, `rgba(255,236,200,${a})`); g.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * 4, 0, 6.283); ctx.fill();
    }
    if (--next <= 0) { burst(); next = 50 + Math.random() * 70; }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.013;
      if (p.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.fillStyle = `hsla(${p.hue},90%,70%,${p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 6.283); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  const run = (v) => { if (v && !on) { on = true; size(); raf = requestAnimationFrame(frame); } else if (!v && on) { on = false; cancelAnimationFrame(raf); } };
  new IntersectionObserver(([e]) => run(e.isIntersecting && !document.hidden)).observe(card);
  document.addEventListener('visibilitychange', () => { if (document.hidden) run(false); });
  addEventListener('resize', () => on && size());
}

export function initExtras() {
  initThanksCard();
  initGhosts();
  initRing();
  initSpark();
  initThanks();
  initGlitch();
}
