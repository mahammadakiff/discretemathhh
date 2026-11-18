import * as S from './shamir.js';
import { initLab } from './lab.js';
import { initExtras } from './extras.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGsap = typeof window.gsap !== 'undefined';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

/* ---------- smooth scroll + nav ---------- */
let lenis = null;
function initScroll() {
  if (hasGsap) gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  const nav = $('.nav');
  const toggle = $('.nav__toggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#' ? null : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    const offset = -(nav.offsetHeight + 8);
    if (lenis) lenis.scrollTo(target, { offset });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reduced ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
    // move focus for keyboard users without jumping
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
  });
  // progress + active link
  const bar = $('#progress');
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = `${h > 0 ? (scrollY / h) * 100 : 0}%`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const links = new Map($$('.nav ul a').map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        links.forEach((a) => a.classList.remove('is-active'));
        links.get(en.target.id)?.classList.add('is-active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => io.observe(s));
}

/* ---------- reveal animations ---------- */
function initReveals() {
  if (reduced || !hasGsap) return;
  document.documentElement.classList.add('js-anim');
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });
  // hero title
  gsap.from('.hero__text > *', { opacity: 0, y: 30, duration: 0.9, ease: 'power3.out', stagger: 0.1 });
}

/* ---------- number counters ---------- */
function initCounters() {
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  $$('[data-count]').forEach((node) => {
    const target = Number(node.dataset.count);
    if (reduced || !hasGsap) { node.textContent = fmt(target); return; }
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: node, start: 'top 90%', once: true,
      onEnter: () => gsap.to(obj, { v: target, duration: target > 5000 ? 2.2 : 1.4, ease: 'power2.out', onUpdate: () => (node.textContent = fmt(obj.v)) }),
    });
  });
}

/* ---------- background network canvas ---------- */
function initBackground() {
  const c = $('#bg');
  const ctx = c.getContext('2d');
  let w, h, dpr, pts = [], running = false, raf = 0, visible = true;
  const N = () => Math.min(70, Math.floor((w * h) / 22000));
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.clientWidth; h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = Array.from({ length: N() }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25 }));
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const max = 140;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < max) {
          ctx.strokeStyle = `rgba(45,212,191,${(1 - d / max) * 0.25})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(94,234,212,0.45)';
      ctx.beginPath(); ctx.arc(a.x, a.y, 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  function step() {
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    draw();
    raf = requestAnimationFrame(step);
  }
  const update = () => {
    const should = visible && !document.hidden && !reduced;
    if (should && !running) { running = true; raf = requestAnimationFrame(step); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  };
  addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', update);
  // animate only while the top of the page is on screen; elsewhere it is a still backdrop
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }).observe($('#hero'));
  resize();
  update();
}

/* ---------- hero: 7 holders around a lock ---------- */
function initHero() {
  const nodesG = $('#hero-nodes'), linksG = $('#hero-links');
  const lock = $('#hero-lock'), secret = $('#hero-secret'), caption = $('#hero-caption'), shackle = $('#hero-shackle');
  const R = 118;
  const nodes = [], links = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
    const x = R * Math.cos(a), y = R * Math.sin(a);
    links.push(el('line', { x1: 0, y1: 0, x2: x, y2: y, class: 'hlink' }, linksG));
    const g = el('g', { class: 'hnode', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, nodesG);
    el('circle', { r: 20 }, g);
    const t = el('text', { 'text-anchor': 'middle', y: 5 }, g);
    t.textContent = `H${i + 1}`;
    nodes.push(g);
  }
  const set = (ids, open) => {
    nodes.forEach((n, i) => n.classList.toggle('is-on', ids.includes(i)));
    links.forEach((l, i) => l.classList.toggle('is-on', ids.includes(i)));
    lock.classList.toggle('is-open', open);
    shackle.setAttribute('d', open ? 'M-14 -6 V-22 a14 14 0 0 1 28 0 V-14' : 'M-14 -6 V-18 a14 14 0 0 1 28 0 V-6');
  };
  if (reduced || !hasGsap) {
    set([0, 2, 3, 5, 6], true);
    secret.textContent = '11';
    caption.textContent = '5 of 7 holders met: the secret 11 is rebuilt';
    return;
  }
  const shuffle = () => [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
  let order = shuffle();
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, onRepeat: () => { order = shuffle(); } });
  tl.call(() => { set([], false); secret.textContent = '?'; caption.textContent = 'Holders meeting: 0 of 7'; });
  for (let k = 1; k <= 5; k++) {
    tl.call(() => {
      set(order.slice(0, k), false);
      caption.textContent = k < 5 ? `Holders meeting: ${k} of 7, still locked` : '';
      if (k === 4) caption.textContent = '4 of 7: every secret 0–16 is still equally likely';
      if (k < 5) gsap.to(secret, { duration: 0.6, scrambleText: { text: '?', chars: '0123456789', speed: 0.6 } });
    }, null, `+=${k === 5 ? 1.6 : 0.7}`);
  }
  tl.call(() => {
    set(order.slice(0, 5), true);
    caption.textContent = '5 of 7: unlocked, the secret is 11';
    gsap.to(secret, { duration: 0.9, scrambleText: { text: '11', chars: '0123456789', speed: 0.5 } });
    gsap.fromTo(lock, { scale: 1 }, { scale: 1.12, yoyo: true, repeat: 1, duration: 0.25, transformOrigin: '50% 50%' });
  }, null, '+=0.1');
  tl.to({}, { duration: 2.6 });
  // pause the loop when the hero is off screen
  new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause())).observe($('#hero-svg'));
}

/* ---------- idea: lines through points ---------- */
function initIdea() {
  const svg = $('#idea-svg'), text = $('#idea-text');
  const W = 400, H = 320, X0 = -1, X1 = 6, Y0 = -3, Y1 = 9;
  const sx = (x) => ((x - X0) / (X1 - X0)) * W;
  const sy = (y) => H - ((y - Y0) / (Y1 - Y0)) * H;
  const ix = (px) => X0 + (px / W) * (X1 - X0);
  const iy = (py) => Y0 + ((H - py) / H) * (Y1 - Y0);
  let mode = 1;
  const P = [{ x: 2, y: 4 }, { x: 4, y: 7 }];
  const grid = el('g', {}, svg);
  for (let x = X0; x <= X1; x++) el('line', { x1: sx(x), y1: 0, x2: sx(x), y2: H, class: 'gridline' }, grid);
  for (let y = Y0; y <= Y1; y++) el('line', { x1: 0, y1: sy(y), x2: W, y2: sy(y), class: 'gridline' }, grid);
  el('line', { x1: 0, y1: sy(0), x2: W, y2: sy(0), class: 'axis' }, grid);
  el('line', { x1: sx(0), y1: 0, x2: sx(0), y2: H, class: 'yaxis' }, grid);
  const lbl = el('text', { x: sx(0) + 6, y: 14, class: 'svg-label svg-label--amber' }, grid); lbl.textContent = 'x = 0: the secret';
  const fan = el('g', {}, svg);
  const main = el('line', { class: 'mainline' }, svg);
  const icept = el('circle', { r: 6, class: 'icept' }, svg);
  const iLabel = el('text', { class: 'svg-label svg-label--amber' }, svg);
  const handles = P.map((p, i) => {
    const g = el('g', { tabindex: 0, role: 'slider', 'aria-label': `Point ${i + 1}`, 'aria-valuetext': '' }, svg);
    el('circle', { r: 18, class: 'pt-hit' }, g);
    el('circle', { r: 8, class: 'pt' }, g);
    return g;
  });
  const lineAt = (p, slope) => ({ x1: sx(X0), y1: sy(p.y + slope * (X0 - p.x)), x2: sx(X1), y2: sy(p.y + slope * (X1 - p.x)) });
  let sweep = { a: 0 };
  function render() {
    fan.innerHTML = '';
    handles.forEach((h, i) => {
      h.style.display = i < mode ? '' : 'none';
      h.setAttribute('transform', `translate(${sx(P[i].x)} ${sy(P[i].y)})`);
      h.setAttribute('aria-valuetext', `x ${P[i].x.toFixed(1)}, y ${P[i].y.toFixed(1)}`);
    });
    if (mode === 1) {
      const p = P[0];
      for (let k = -6; k <= 6; k++) {
        const slope = k * 0.6;
        const l = lineAt(p, slope);
        el('line', { ...l, class: 'fanline' }, fan);
        el('circle', { cx: sx(0), cy: sy(p.y - slope * p.x), r: 2.5, class: 'icept', opacity: 0.6 }, fan);
      }
      const slope = Math.tan(sweep.a);
      Object.entries(lineAt(p, slope)).forEach(([k, v]) => main.setAttribute(k, v));
      const b = p.y - slope * p.x;
      icept.setAttribute('cx', sx(0)); icept.setAttribute('cy', sy(b));
      iLabel.setAttribute('x', sx(0) + 10); iLabel.setAttribute('y', sy(b) + 4); iLabel.textContent = `${b.toFixed(1)}?`;
      text.textContent = 'One share: a line through it can cross x = 0 at ANY height. The secret could be anything.';
    } else {
      const [a, c] = P;
      if (Math.abs(c.x - a.x) < 0.05) { text.textContent = 'Move the points apart: they need different x-values.'; return; }
      const slope = (c.y - a.y) / (c.x - a.x);
      Object.entries(lineAt(a, slope)).forEach(([k, v]) => main.setAttribute(k, v));
      const b = a.y - slope * a.x;
      icept.setAttribute('cx', sx(0)); icept.setAttribute('cy', sy(b));
      iLabel.setAttribute('x', sx(0) + 10); iLabel.setAttribute('y', sy(b) + 4); iLabel.textContent = `secret = ${b.toFixed(2)}`;
      text.textContent = `Two shares: exactly one line, so exactly one secret: ${b.toFixed(2)}.`;
    }
  }
  let tween = null;
  const startSweep = () => {
    if (reduced || !hasGsap || mode !== 1) { sweep.a = 0.35; render(); return; }
    tween = gsap.fromTo(sweep, { a: -1.2 }, { a: 1.2, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: render });
  };
  $$('.seg__btn').forEach((b) => b.addEventListener('click', () => {
    mode = Number(b.dataset.points);
    $$('.seg__btn').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    tween?.kill(); tween = null;
    if (mode === 1) startSweep(); else render();
  }));
  // dragging
  let drag = -1;
  const toLocal = (e) => {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  handles.forEach((h, i) => {
    h.addEventListener('pointerdown', (e) => { drag = i; h.setPointerCapture(e.pointerId); tween?.pause(); });
    h.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, 0.2], ArrowDown: [0, -0.2] }[e.key];
      if (!d) return;
      e.preventDefault();
      P[i].x = Math.min(5.5, Math.max(0.3, P[i].x + d[0]));
      P[i].y = Math.min(8.5, Math.max(-2.5, P[i].y + d[1]));
      render();
    });
  });
  svg.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const q = toLocal(e);
    P[drag].x = Math.min(5.5, Math.max(0.3, ix(q.x)));
    P[drag].y = Math.min(8.5, Math.max(-2.5, iy(q.y)));
    render();
  });
  const end = () => { if (drag >= 0) { drag = -1; tween?.resume(); } };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  render();
  // lazy-start the sweep when visible
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !tween && mode === 1) startSweep();
    else if (!e.isIntersecting && tween) tween.pause();
    else if (e.isIntersecting && tween) tween.resume();
  }).observe(svg);
}

/* ---------- counting: dots + threshold slider ---------- */
function initCounting() {
  const dots = $('#dots');
  const sizes = [];
  for (let k = 0; k <= 7; k++) for (let i = 0; i < Number(S.binom(7, k)); i++) sizes.push(k);
  dots.innerHTML = sizes.map((k) => `<i data-k="${k}"></i>`).join('');
  const cells = $$('i', dots);
  const light = () => cells.forEach((c, i) => setTimeout(() => c.classList.toggle('on', Number(c.dataset.k) >= 5), reduced ? 0 : i * 8));
  if (reduced || !hasGsap) light();
  else ScrollTrigger.create({ trigger: dots, start: 'top 85%', once: true, onEnter: light });

  const slider = $('#t-slider'), bars = $('#t-bars');
  const perK = Array.from({ length: 8 }, (_, k) => Number(S.binom(7, k)));
  bars.innerHTML = perK.map((v, k) => `<div class="bar" data-k="${k}"><span class="bar__v">${v}</span><div class="bar__fill" style="height:${(v / 35) * 100}%"></div><span class="bar__k">k=${k}</span></div>`).join('');
  const notes = {
    3: 'The policy uses 3-of-7 for the Crypto Officers, who are needed at every ceremony, so availability comes first.',
    4: 'The balanced middle: 64 groups on each side, half of 128. But any four holders could collude.',
    5: 'The SMK design: survives two missing holders, and five are needed to steal it. 29 groups rebuild, 99 cannot.',
    6: 'Only one spare holder: one absence plus one lost card makes the backup unusable.',
    7: 'All seven needed: losing a single share destroys the backup for ever.',
  };
  const update = () => {
    const t = Number(slider.value);
    const c = S.groupCounts(7, t);
    $('#t-val').textContent = `t = ${t}`;
    $('#t-safety').textContent = t;
    $('#t-avail').textContent = 7 - t;
    $('#t-r').textContent = c.R;
    $('#t-u').textContent = c.U;
    slider.setAttribute('aria-valuetext', `t = ${t}: ${c.R} groups can rebuild, ${c.U} cannot`);
    $$('.bar', bars).forEach((b) => b.classList.toggle('is-r', Number(b.dataset.k) >= t));
    $('#t-note').textContent = notes[t];
  };
  slider.addEventListener('input', update);
  update();
}

/* ---------- worked example stepper ---------- */
function initExample() {
  const table = $('#ex-table');
  const rows = [...$$('tbody tr', table), $('tfoot tr', table)];
  const result = $('#ex-result'), status = $('#ex-status'), next = $('#ex-next');
  const labels = [
    'Holder 2: weight 2, contributes 2·10 = 20',
    'Holder 3: weight 8, contributes 8·3 = 24',
    'Holder 5: weight 4, contributes 4·5 = 20',
    'Holder 6: weight 8, contributes 8·2 = 16',
    'Holder 7: weight 13, contributes 13·13 = 169',
    'Sum: weights 35 ≡ 1, products 249',
    'Result: 249 = 14·17 + 11 ≡ 11, the secret',
  ];
  let step = 0;
  const total = rows.length + 1;
  const render = () => {
    table.classList.add('is-stepping');
    rows.forEach((r, i) => { r.classList.toggle('shown', i < step); r.classList.toggle('current', i === step - 1); });
    result.classList.toggle('hidden', step < total);
    status.textContent = step === 0 ? `Press “Next step” (${total} steps)` : `Step ${step} of ${total}: ${labels[step - 1]}`;
    next.disabled = step >= total;
    if (step === total && hasGsap && !reduced) {
      gsap.fromTo('#ex-result .big', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' });
    }
  };
  next.addEventListener('click', () => { if (step < total) { step++; render(); } });
  $('#ex-reset').addEventListener('click', () => { step = 0; render(); next.disabled = false; next.focus(); });
  render();
}

/* ---------- four holders: 17 curves ---------- */
function initFan() {
  const svg = $('#fan-svg'), list = $('#poly-list'), slider = $('#g-slider');
  const P = 17n;
  const shares = S.makeShares(S.EXAMPLE.coeffs, 7, P).slice(0, 4);
  const polys = S.possibleSecrets(shares, 5, P).polys;
  const W = 520, H = 360, m = { l: 40, r: 16, t: 16, b: 34 };
  const XS = 7;
  const sx = (x) => m.l + (x / XS) * (W - m.l - m.r);
  const sy = (y) => H - m.b - (y / 16) * (H - m.t - m.b);
  for (let y = 0; y <= 16; y += 4) {
    el('line', { x1: m.l, x2: W - m.r, y1: sy(y), y2: sy(y), class: 'gridline' }, svg);
    el('text', { x: m.l - 8, y: sy(y) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg).textContent = y;
  }
  for (let x = 0; x <= XS; x++) {
    el('line', { x1: sx(x), x2: sx(x), y1: m.t, y2: H - m.b, class: 'gridline' }, svg);
    el('text', { x: sx(x), y: H - m.b + 18, 'text-anchor': 'middle', class: x === 0 ? 'svg-label svg-label--amber' : 'svg-label' }, svg).textContent = x === 0 ? 'x=0' : x;
  }
  el('rect', { x: sx(0.75), y: m.t, width: sx(4.25) - sx(0.75), height: H - m.t - m.b, fill: 'rgba(45,212,191,0.05)', rx: 8 }, svg);
  const curves = polys.map(({ g, coeffs }) => {
    const pts = [];
    for (let x = 0; x <= XS; x++) pts.push(`${sx(x).toFixed(1)},${sy(Number(S.evalPoly(coeffs, x, P))).toFixed(1)}`);
    const cls = `fan-curve${g === 3n ? ' is-3' : ''}`;
    return el('polyline', { points: pts.join(' '), class: cls, 'data-g': g }, svg);
  });
  polys.forEach(({ g }) => el('circle', { cx: sx(0), cy: sy(Number(g)), r: 3, class: 'fan-dot' }, svg));
  shares.forEach((s) => el('circle', { cx: sx(Number(s.x)), cy: sy(Number(s.y)), r: 6, class: 'fan-share' }, svg));
  const selDot = el('circle', { r: 7, fill: 'var(--amber)', cx: sx(0) }, svg);
  list.innerHTML = polys.map(({ g, coeffs }) => {
    const cls = g === 11n ? 'is-11' : g === 3n ? 'is-3' : '';
    const note = g === 11n ? '  ← real f' : g === 3n ? '  ← a₄ = 0' : '';
    return `<button role="listitem" class="${cls}" data-g="${g}"><span class="g">g = ${g}</span><span>${S.polyToString(coeffs)}${note}</span></button>`;
  }).join('');
  const select = (g) => {
    slider.value = g;
    $('#g-val').textContent = `g = ${g}`;
    curves.forEach((c) => c.classList.toggle('is-sel', Number(c.dataset.g) === g));
    const sel = curves[g]; sel.parentNode.appendChild(sel); svg.appendChild(selDot);
    selDot.setAttribute('cy', sy(g));
    $$('button', list).forEach((b) => b.classList.toggle('is-sel', Number(b.dataset.g) === g));
    slider.setAttribute('aria-valuetext', `guess ${g}: ${S.polyToString(polys[g].coeffs)}`);
  };
  // keep the shares drawn on top of curves
  const sharesOnTop = () => $$('.fan-share', svg).forEach((c) => svg.appendChild(c));
  slider.addEventListener('input', () => { select(Number(slider.value)); sharesOnTop(); });
  list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { select(Number(b.dataset.g)); sharesOnTop(); } });
  select(11); sharesOnTop();
  if (!reduced && hasGsap) {
    curves.forEach((c) => { const len = c.getTotalLength(); c.style.strokeDasharray = len; c.style.strokeDashoffset = len; });
    ScrollTrigger.create({ trigger: svg, start: 'top 80%', once: true, onEnter: () => gsap.to(curves, { strokeDashoffset: 0, duration: 1.4, stagger: 0.05, ease: 'power2.out', onComplete() { this.targets().forEach((c) => { c.style.strokeDasharray = ''; }); } }) });
  }
}

/* ---------- KaTeX ---------- */
function initTex() {
  if (!window.katex) return;
  $$('[data-tex]').forEach((n) => {
    try { katex.render(n.dataset.tex, n, { displayMode: n.classList.contains('tex'), throwOnError: false }); } catch { /* keep fallback text */ }
  });
}

function boot() {
  initScroll();
  initBackground();
  initHero();
  initIdea();
  initCounting();
  initExample();
  initFan();
  initTex();
  initLab();
  initExtras();
  initCounters();
  initReveals();
  if (hasGsap) ScrollTrigger.refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
