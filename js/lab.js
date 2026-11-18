import * as S from './shamir.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (v, max = 40) => {
  const s = String(v);
  return s.length <= max ? s : `${s.slice(0, 18)}…${s.slice(-14)} (${s.length} digits)`;
};

/** parse a BigInt; also accepts forms like 2^521-1 or 2^127 - 1 */
function parseBig(str, name) {
  const t = String(str).trim().replace(/\s+/g, '');
  const m = t.match(/^(\d+)\^(\d+)([+-]\d+)?$/);
  if (m) {
    if (Number(m[2]) > 4096) throw new S.ShamirError(`${name}: exponent too large`);
    return BigInt(m[1]) ** BigInt(m[2]) + BigInt(m[3] || 0);
  }
  if (!/^-?\d+$/.test(t)) throw new S.ShamirError(`${name} must be a whole number${name === 'p' ? ' (or a form like 2^521-1)' : ''}.`);
  return BigInt(t);
}

const state = { p: 17n, n: 7, t: 5, coeffs: [...S.EXAMPLE.coeffs], shares: [], selected: new Set(), real: false };

/* ===================== tabs ===================== */
function initTabs() {
  const tabs = $$('.tabs [role=tab]');
  const activate = (tab, focus = true) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    });
    if (focus) tab.focus();
    if (tab.id === 'tab-rebuild') renderRebuildCards();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activate(t, false));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); activate(tabs[(i + k + tabs.length) % tabs.length]); }
      if (e.key === 'Home') { e.preventDefault(); activate(tabs[0]); }
      if (e.key === 'End') { e.preventDefault(); activate(tabs[tabs.length - 1]); }
    });
  });
}

/* ===================== 1. split ===================== */
function readSplitInputs() {
  const err = $('#split-error');
  err.textContent = '';
  $$('#split-form input').forEach((i) => i.removeAttribute('aria-invalid'));
  const bad = (id, msg) => { $(id).setAttribute('aria-invalid', 'true'); err.textContent = msg; return null; };
  try {
    const n = Number($('#in-n').value), t = Number($('#in-t').value);
    if (!Number.isInteger(n) || n < 2 || n > 20) return bad('#in-n', 'n must be a whole number from 2 to 20.');
    if (!Number.isInteger(t) || t < 1 || t > n) return bad('#in-t', `t must be a whole number from 1 to n = ${n}.`);
    let p;
    try { p = S.validateModulus(parseBig($('#in-p').value, 'p'), n); } catch (e) { return bad('#in-p', e.message); }
    let s;
    try { s = parseBig($('#in-s').value, 's'); } catch (e) { return bad('#in-s', e.message); }
    if (s < 0n || s >= p) return bad('#in-s', `The secret must be between 0 and p − 1 = ${short(p - 1n)}.`);
    return { p, n, t, s };
  } catch (e) { err.textContent = e.message; return null; }
}

function split({ keepRandom = true } = {}) {
  const v = readSplitInputs();
  if (!v) { $('#split-out').innerHTML = ''; return; }
  const { p, n, t, s } = v;
  let a = state.coeffs.slice(1);
  if (!keepRandom || a.length !== t - 1 || a.some((c) => c >= p) || state.p !== p) a = S.randomCoefficients(0n, t, p).slice(1);
  Object.assign(state, { p, n, t, coeffs: [s, ...a] });
  state.shares = S.makeShares(state.coeffs, n, p);
  state.selected = new Set();
  renderSplit();
}

function renderSplit(extra = '') {
  const { p, n, t, coeffs, shares } = state;
  const big = p > 10n ** 12n;
  $('#split-out').innerHTML = `
    <div class="out-block">
      <h4>Dealer's polynomial (degree at most ${t - 1}, mod ${esc(short(p, 60))})</h4>
      <div class="polybox">f(x) = ${esc(S.polyToString(coeffs, { showZero: true }))}</div>
      <p class="small muted">Secret s = f(0) = ${esc(short(coeffs[0], 80))}. Coefficients a₁…a${S.sup(t - 1)} are ${state.real || coeffs.length !== 5 || coeffs.join() !== '11,7,9,5,6' ? 'uniformly random (crypto.getRandomValues)' : 'the worked example'}.</p>
    </div>
    <div class="out-block">
      <h4>${n} shares, one per holder · any ${t} rebuild, any ${t - 1} learn nothing</h4>
      <div class="share-cards ${big ? 'share-cards--big' : ''}">
        ${shares.map((sh) => `<div class="share-card"><span class="h">Holder ${sh.x} · (x, f(x))</span><span class="v">(${sh.x}, ${esc(sh.y)})</span></div>`).join('')}
      </div>
    </div>${extra}`;
}

function initSplit() {
  $('#btn-random').addEventListener('click', () => { state.real = false; split({ keepRandom: false }); });
  $('#btn-example').addEventListener('click', () => {
    state.real = false;
    $('#in-p').value = '17'; $('#in-n').value = '7'; $('#in-t').value = '5'; $('#in-s').value = '11';
    state.coeffs = [...S.EXAMPLE.coeffs]; state.p = 17n;
    split();
  });
  $('#btn-real').addEventListener('click', realSize);
  let timer;
  $$('#split-form input').forEach((i) => i.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.real = false; split(); }, 250);
  }));
  $('#split-form').addEventListener('submit', (e) => e.preventDefault());
  split();
}

function realSize() {
  const out = $('#split-out');
  out.innerHTML = '<p class="muted"><span class="spinner"></span> Checking 2<sup>521</sup> − 1 with Lucas–Lehmer, splitting and rebuilding…</p>';
  setTimeout(() => {
    const t0 = performance.now();
    const ll = S.lucasLehmer(521);
    const t1 = performance.now();
    const secret = S.randomBits(256);
    $('#in-p').value = '2^521-1'; $('#in-n').value = '7'; $('#in-t').value = '5'; $('#in-s').value = secret.toString();
    state.real = true;
    Object.assign(state, { p: S.P521, n: 7, t: 5, coeffs: S.randomCoefficients(secret, 5, S.P521) });
    state.shares = S.makeShares(state.coeffs, 7, S.P521);
    state.selected = new Set();
    const t2 = performance.now();
    const groups = S.combinations(state.shares, 5);
    const okCount = groups.filter((g) => S.recover(g, S.P521) === secret).length;
    const t3 = performance.now();
    $('#split-error').textContent = '';
    renderSplit(`<div class="result ${okCount === 21 && ll ? 'result--ok' : 'result--bad'}">
      Lucas–Lehmer: 2^521 − 1 is ${ll ? 'prime' : 'NOT prime'} (${(t1 - t0).toFixed(0)} ms)<br>
      Random 256-bit secret: <b>${secret.toString(16)}</b> (hex)<br>
      All 21 groups of five rebuilt it: <b>${okCount} / 21</b> (${(t3 - t2).toFixed(0)} ms, exact BigInt arithmetic)
    </div>`);
  }, 30);
}

/* ===================== 2. rebuild ===================== */
function renderRebuildCards() {
  const wrap = $('#rebuild-cards');
  const big = state.p > 10n ** 12n;
  wrap.classList.toggle('share-cards--big', big);
  wrap.innerHTML = state.shares.map((sh) => `<button type="button" class="share-card" aria-pressed="${state.selected.has(Number(sh.x))}" data-x="${sh.x}"><span class="h">Holder ${sh.x}</span><span class="v">(${sh.x}, ${esc(short(sh.y, 24))})</span></button>`).join('');
  renderRebuild();
}

function renderRebuild() {
  const out = $('#rebuild-out');
  const { p, t } = state;
  const sel = state.shares.filter((s) => state.selected.has(Number(s.x)));
  const k = sel.length;
  if (k === 0) { out.innerHTML = `<p class="muted">Selected 0 shares. Pick at least ${t} to rebuild.</p>`; return; }
  try {
    if (k >= t) {
      const d = S.recoverDetailed(sel, p);
      const ok = d.secret === state.coeffs[0];
      const big = p > 10n ** 6n;
      out.innerHTML = `
        <p>Selected <b class="num">${k}</b> shares (≥ t = ${t}): Lagrange interpolation at x = 0, all arithmetic mod ${esc(short(p))}.</p>
        <div class="table-scroll"><table class="calc-table">
          <thead><tr><th>x<sub>j</sub></th><th>Numerator Π x<sub>m</sub></th><th>Denominator Π (x<sub>m</sub> − x<sub>j</sub>)</th><th>Inverse (ext. Euclid)</th><th>Weight w<sub>j</sub></th><th>y<sub>j</sub></th><th>w<sub>j</sub>·y<sub>j</sub></th></tr></thead>
          <tbody>${d.rows.map((r) => `<tr>
            <td>${r.x}</td>
            <td class="wrap">${r.others.join('·')} = ${r.numRaw} ≡ ${esc(short(r.num))}</td>
            <td class="wrap">${r.others.map((m) => { const v = m - r.x; return v < 0n ? `(${v})` : `${v}`; }).join('·')} = ${r.denRaw} ≡ ${esc(short(r.den))}</td>
            <td class="wrap">${esc(short(r.inv))}${big ? '' : ` (${r.den}·${r.inv} ≡ 1)`}</td>
            <td class="wrap"><b>${esc(short(r.w))}</b></td>
            <td class="wrap">${esc(short(r.y))}</td>
            <td class="wrap">${esc(short(r.prod))}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Sum</th><td></td><td></td><td></td><td class="wrap">${esc(short(d.weightSumRaw))} ≡ ${d.weightSum}</td><td></td><td class="wrap">${esc(short(d.sumRaw))}</td></tr></tfoot>
        </table></div>
        <div class="result ${ok ? 'result--ok' : 'result--bad'}">
          ${big ? '' : `${d.rows.map((r) => `${r.w}·${r.y}`).join(' + ')} = ${d.sumRaw} = ${d.sumRaw / p}·${p} + ${d.secret} ≡ `}<b>s = ${esc(short(d.secret, 90))}</b>
          ${ok ? '✓ matches the dealer\'s secret' : '✗ does not match'} · the weights sum to ${d.weightSum} (they always sum to 1)
        </div>`;
    } else {
      const r = S.possibleSecrets(sel, t, p);
      const head = `<p>Selected <b class="num">${k}</b> share${k === 1 ? '' : 's'}, fewer than t = ${t}. <b>Every secret 0…${esc(short(p - 1n))} is still possible.</b></p>`;
      const count = r.free === 0
        ? `For each guess g exactly <b>one</b> polynomial of degree ≤ ${t - 1} fits (0, g) and the ${k} shares.`
        : `For each guess g exactly p<sup>${r.free}</sup> = <b>${esc(short(r.perGuess))}</b> polynomials fit, ${esc(short(r.total))} = p<sup>${t - k}</sup> in total, the same count for every guess.`;
      let list = '';
      if (r.polys) {
        list = `<p class="small muted">${r.free === 0 ? 'The unique polynomial for each guess' : 'One of the polynomials for each guess'} (the real secret is hidden among them):</p>
          <div class="guess-grid">${r.polys.map(({ g, coeffs }) => `<div${g === state.coeffs[0] ? ' style="color:var(--amber)"' : ''}>g = ${g}: ${esc(S.polyToString(coeffs))}${coeffs[t - 1] === 0n ? '  (a' + S.sup(t - 1) + ' = 0)' : ''}</div>`).join('')}</div>`;
      } else {
        list = `<p class="small muted">p is too large to list all ${esc(short(p))} guesses, but the count above holds for each one: by Bayes' theorem the shares change no guess's probability.</p>`;
      }
      out.innerHTML = `${head}<div class="result">${count}</div>${list}`;
    }
  } catch (e) {
    out.innerHTML = `<div class="result result--bad">${esc(e.message)}</div>`;
  }
}

function initRebuild() {
  $('#rebuild-cards').addEventListener('click', (e) => {
    const b = e.target.closest('.share-card');
    if (!b) return;
    const x = Number(b.dataset.x);
    state.selected.has(x) ? state.selected.delete(x) : state.selected.add(x);
    b.setAttribute('aria-pressed', String(state.selected.has(x)));
    renderRebuild();
  });
  $('#pick-all').addEventListener('click', () => { state.shares.forEach((s) => state.selected.add(Number(s.x))); renderRebuildCards(); });
  $('#pick-none').addEventListener('click', () => { state.selected.clear(); renderRebuildCards(); });
}

/* ===================== 3. group counter ===================== */
function renderCount() {
  const err = $('#count-error'), out = $('#count-out');
  const n = Number($('#c-n').value), t = Number($('#c-t').value);
  err.textContent = '';
  if (!Number.isInteger(n) || n < 1 || n > 40) { err.textContent = 'n must be a whole number from 1 to 40.'; out.innerHTML = ''; return; }
  if (!Number.isInteger(t) || t < 1 || t > n) { err.textContent = `t must be a whole number from 1 to n = ${n}.`; out.innerHTML = ''; return; }
  const c = S.groupCounts(n, t);
  const max = c.perK.reduce((a, b) => (b > a ? b : a), 0n);
  const pct = (v) => Number((v * 1000n) / (max || 1n)) / 10;
  out.innerHTML = `
    <div class="kv" style="margin-top:16px">
      <div><span class="kv__k">Total groups 2<sup>${n}</sup></span><span class="kv__v">${c.total.toLocaleString('en-US')}</span></div>
      <div><span class="kv__k">Can rebuild R(${t})</span><span class="kv__v good">${c.R.toLocaleString('en-US')}</span></div>
      <div><span class="kv__k">Cannot U(${t})</span><span class="kv__v bad">${c.U.toLocaleString('en-US')}</span></div>
      <div><span class="kv__k">Safety / availability</span><span class="kv__v">${c.safety} / ${c.availability}</span></div>
    </div>
    <p class="small">R(${t}) = ${c.perK.slice(t).map((_, i) => `C(${n},${t + i})`).join(' + ')}${n - t < 6 ? ` = ${c.perK.slice(t).join(' + ')}` : ''} = <b class="num">${c.R}</b>. Complement view: groups missing at most ${n - t} holders.</p>
    <div class="minibars" role="img" aria-label="Groups of each size; teal bars can rebuild">${c.perK.map((v, k) => `<div class="bar ${k >= t ? 'is-r' : ''}" title="C(${n},${k}) = ${v}">${n <= 16 ? `<span class="bar__v">${v}</span>` : ''}<div class="bar__fill" style="height:${Math.max(pct(v), v > 0n ? 1 : 0)}%"></div></div>`).join('')}</div>
    <div class="minibars-k">${c.perK.map((_, k) => `<span>${n <= 20 || k % 5 === 0 ? k : ''}</span>`).join('')}</div>
    <div class="table-scroll" style="margin-top:12px"><table class="calc-table">
      <thead><tr><th>k (group size)</th><th>C(${n}, k)</th><th>Can rebuild?</th></tr></thead>
      <tbody>${c.perK.map((v, k) => `<tr><td>${k}</td><td>${v.toLocaleString('en-US')}</td><td class="${k >= t ? 'good' : 'bad'}">${k >= t ? 'yes' : 'no'}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

function initCount() {
  $$('#c-n, #c-t').forEach((i) => i.addEventListener('input', renderCount));
  renderCount();
}

/* ===================== 4. inverse finder ===================== */
function renderInverse() {
  const out = $('#inv-out');
  let a, p;
  try { a = parseBig($('#i-a').value, 'a'); p = parseBig($('#i-p').value, 'p'); } catch (e) { out.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (p < 2n) { out.innerHTML = '<p class="error">The modulus must be at least 2.</p>'; return; }
  const am = S.mod(a, p);
  if (am === 0n) { out.innerHTML = `<div class="result result--bad">${esc(short(a))} ≡ 0 (mod ${esc(short(p))}): zero never has an inverse.</div>`; return; }
  const r = S.extendedEuclid(am, p);
  const prime = S.isPrime(p);
  const steps = r.steps.slice(0, 60);
  let res;
  if (r.inverse === null) {
    res = `<div class="result result--bad">gcd(${esc(short(am))}, ${esc(short(p))}) = ${r.gcd} ≠ 1, so <b>${esc(short(am))} has no inverse mod ${esc(short(p))}</b>. ${prime ? '' : 'This is why the modulus must be prime.'}</div>`;
  } else {
    const fermat = prime ? S.modPow(am, p - 2n, p) : null;
    res = `<div class="result result--ok">${esc(short(am))}<sup>−1</sup> ≡ <b>${esc(short(r.inverse, 90))}</b> (mod ${esc(short(p))})<br>
      Check: ${esc(short(am))} · ${esc(short(r.inverse))} = ${esc(short(am * r.inverse))} ≡ ${(am * r.inverse) % p} ✓<br>
      ${prime ? `Fermat: a<sup>p−2</sup> = ${esc(short(am))}<sup>${esc(short(p - 2n))}</sup> ≡ ${esc(short(fermat))} ${fermat === r.inverse ? '✓ agrees' : '✗'}` : 'Fermat\'s check a^(p−2) needs a prime modulus, so it is skipped here.'}</div>`;
  }
  out.innerHTML = `
    <div class="out-block"><h4>Extended Euclidean algorithm: divide, keep the remainder, repeat</h4>
    <div class="table-scroll"><table class="calc-table"><thead><tr><th>#</th><th>a = q · b + r</th></tr></thead>
    <tbody>${steps.map((s, i) => `<tr><td>${i + 1}</td><td class="wrap">${esc(short(s.a))} = ${esc(short(s.q))} · ${esc(short(s.b))} + ${esc(short(s.rem))}</td></tr>`).join('')}${r.steps.length > steps.length ? `<tr><td></td><td>… ${r.steps.length - steps.length} more steps</td></tr>` : ''}</tbody></table></div>
    <p class="small muted">The last nonzero remainder is the gcd. Working the equations backwards writes 1 = u·a + v·p, and u is the inverse.</p></div>
    ${res}`;
}

function initInverse() {
  $$('#i-a, #i-p').forEach((i) => i.addEventListener('input', renderInverse));
  renderInverse();
}

/* ===================== 5. break an assumption ===================== */
const P = 17n, F = S.EXAMPLE.coeffs;
const EX_SHARES = S.makeShares(F, 7, P);
let mod16Cache = null;

const scenarios = {
  mod16() {
    const out = $('#break-out');
    const run = () => {
      mod16Cache ||= S.compositeModulusReport(16);
      const fails = mod16Cache.filter((r) => r.lagrangeFails).length;
      const amb = mod16Cache.filter((r) => r.ambiguous);
      let msg = '';
      try { S.lagrangeWeights([1, 2, 3, 4, 5], 16); } catch (e) { msg = e.message; }
      out.innerHTML = `
        <div class="result result--bad">Modulus 16 is not prime: <b>recovery fails for ${fails} of 21</b> groups of five.<br>Holders 1–5: ${esc(msg)}</div>
        <p style="margin-top:12px">Worse, for <b class="num">${amb.length}</b> groups the shares fit two different secrets, so even trying every polynomial cannot tell which secret is right:</p>
        <p class="mono small">${amb.map((r) => `{${r.group.join(',')}}`).join('  ')}</p>
        <p class="small muted">Modulo 16, the number 2 has no inverse: 2b is always even and never ≡ 1. With a prime p every nonzero number has one.</p>`;
    };
    if (mod16Cache) run();
    else { out.innerHTML = '<p class="muted"><span class="spinner"></span> Brute force over 16⁵ polynomials for each of 21 groups…</p>'; setTimeout(run, 30); }
  },
  p7() {
    const sh = S.makeShares(F, 7, 7n);
    let msg = '';
    try { S.validateModulus(7, 7); } catch (e) { msg = e.message; }
    $('#break-out').innerHTML = `
      <p>Same polynomial, but mod 7. Holder 7 receives x = 7 ≡ 0, and f(0) is the secret.</p>
      <div class="share-cards">${sh.map((s) => `<div class="share-card" ${s.x === 7n ? 'style="border-color:var(--red)"' : ''}><span class="h">Holder ${s.x}${s.x === 7n ? ' · x ≡ 0' : ''}</span><span class="v">(${s.x}, ${s.y})</span></div>`).join('')}</div>
      <div class="result result--bad" style="margin-top:12px">Holder 7's share is ${sh[6].y} = 11 mod 7: <b>a single holder knows the secret</b>.<br>${esc(msg)}</div>`;
  },
  pattern() {
    $('#break-controls').innerHTML = `<div class="radio-row"><span class="small">Holder who peeks:</span><select id="pat-h">${[1, 2, 3, 4, 5, 6, 7].map((i) => `<option ${i === 3 ? 'selected' : ''}>${i}</option>`).join('')}</select></div>`;
    const draw = () => {
      const i = BigInt($('#pat-h').value);
      const coeffs = [11n, 11n, 11n, 11n, 11n];
      const y = S.evalPoly(coeffs, i, P);
      const r = S.patternedLeak({ x: i, y }, 5, P);
      $('#break-out').innerHTML = `
        <p>A lazy dealer sets every coefficient equal to s: f(x) = 11 + 11x + 11x² + 11x³ + 11x⁴ (mod 17).</p>
        <div class="result result--bad">Holder ${i} alone sees y = ${y}. Since f(${i}) = s(1 + ${i} + ${i}² + ${i}³ + ${i}⁴), they compute<br>
        factor = 1 + ${i} + ${i}² + ${i}³ + ${i}⁴ ≡ ${r.factor}, inverse ${r.inv}, s = ${y} · ${r.inv} ≡ <b>${r.secret}</b>.<br><b>One share reveals the secret</b>, because the coefficients were not random (A2).</div>`;
    };
    $('#pat-h').addEventListener('change', draw);
    draw();
  },
  noa4() {
    const polys = S.possibleSecrets(EX_SHARES.slice(0, 4), 5, P).polys;
    const out = polys.filter((x) => x.coeffs[4] === 0n);
    $('#break-out').innerHTML = `
      <p>Holders 1–4 know (1, 4), (2, 10), (3, 3), (4, 16). Honest dealer: each of the 17 guesses fits exactly one polynomial, so each has chance 1/17.</p>
      <div class="guess-grid">${polys.map(({ g, coeffs }) => `<div style="${coeffs[4] === 0n ? 'color:var(--red);text-decoration:line-through' : ''}">g = ${g}: ${esc(S.polyToString(coeffs))}</div>`).join('')}</div>
      <div class="result result--bad" style="margin-top:12px">If the dealer never allows a₄ = 0, the polynomial for <b>g = ${out.map((x) => x.g).join(', ')}</b> is impossible. Four holders cross it out: the other 16 secrets now have chance <b>1/16</b> each instead of 1/17. That is a small leak, but no longer perfect secrecy.</div>`;
  },
  wrong() {
    $('#break-controls').innerHTML = `
      <div class="radio-row" role="radiogroup" aria-label="Holders present"><span class="small">Holders present:</span>
        ${[5, 6, 7].map((k) => `<label><input type="radio" name="present" value="${k}" ${k === 5 ? 'checked' : ''}> ${k}</label>`).join('')}</div>
      <div class="radio-row"><label style="border:0;padding:0">Liar: holder <select id="liar"></select></label>
        <label style="border:0;padding:0">adds error <select id="err">${Array.from({ length: 16 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label></div>`;
    const fillLiar = () => {
      const k = Number($('input[name=present]:checked').value);
      const prev = Number($('#liar').value) || 1;
      $('#liar').innerHTML = Array.from({ length: k }, (_, i) => `<option ${i + 1 === Math.min(prev, k) ? 'selected' : ''}>${i + 1}</option>`).join('');
    };
    const draw = () => {
      const k = Number($('input[name=present]:checked').value);
      const liar = BigInt($('#liar').value), err = BigInt($('#err').value);
      const ans = S.wrongShareAnswers(EX_SHARES.slice(0, k), liar, err, 5, P);
      const tl = S.tally(ans);
      const verdict = k === 5
        ? `<div class="result result--bad">Only one group of five: it computes <b>s = ${ans[0].secret}</b> instead of 11, and <b>nobody notices</b>.</div>`
        : k === 6
          ? `<div class="result result--ok">The ${ans.length} groups of five <b>disagree</b> (${tl.length} different answers), so <b>the cheat is detected</b> at the ceremony.</div>`
          : `<div class="result result--ok">The true secret <b>11 is the most common answer (${tl[0].count} of 21 groups)</b>: the groups that leave out holder ${liar}. No wrong answer appears more than ${tl[1]?.count ?? 0} times.</div>`;
      $('#break-out').innerHTML = `
        <p>Holder ${liar} hands in y + ${err} instead of their real share. Every group of five among the ${k} present computes a secret:</p>
        <div class="guess-grid" style="max-height:220px">${ans.map((a) => `<div style="${a.secret === 11n ? 'color:var(--good)' : 'color:var(--red)'}">{${a.holders.join(',')}} → ${a.secret}</div>`).join('')}</div>
        ${verdict}`;
    };
    $$('input[name=present]').forEach((r) => r.addEventListener('change', () => { fillLiar(); draw(); }));
    fillLiar();
    $('#liar').addEventListener('change', draw);
    $('#err').addEventListener('change', draw);
    draw();
  },
};

function initBreak() {
  $$('.break-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.break-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#break-controls').innerHTML = '';
    scenarios[b.dataset.break]();
  }));
  $('#break-out').innerHTML = '<p class="muted">Choose an assumption to break.</p>';
}

export function initLab() {
  initTabs();
  initSplit();
  initRebuild();
  initCount();
  initInverse();
  initBreak();
}
