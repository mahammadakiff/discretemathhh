/**
 * shamir.js: exact modular arithmetic for Shamir secret sharing.
 * Everything uses BigInt (no floating point), so the same code works for p = 17
 * and for p = 2^521 - 1. Plain ES module: used by the site and by tests/shamir.test.mjs.
 */

export class ShamirError extends Error {
  constructor(message) { super(message); this.name = 'ShamirError'; }
}

export const big = (v) => (typeof v === 'bigint' ? v : BigInt(v));

/** a mod p, always in 0..p-1 */
export function mod(a, p) {
  a = big(a); p = big(p);
  const r = a % p;
  return r < 0n ? r + p : r;
}

/** a^e mod p by repeated squaring */
export function modPow(a, e, p) {
  a = mod(a, p); e = big(e); p = big(p);
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * a) % p;
    a = (a * a) % p;
    e >>= 1n;
  }
  return r % p;
}

/**
 * Extended Euclidean algorithm with every step recorded.
 * Returns { gcd, inverse (or null), steps: [{ q, r0, r1, s0, s1 }] }
 */
export function extendedEuclid(a, p) {
  a = mod(a, p); p = big(p);
  let oldR = a, r = p, oldS = 1n, s = 0n;
  const steps = [];
  while (r !== 0n) {
    const q = oldR / r;
    steps.push({ a: oldR, b: r, q, rem: oldR - q * r });
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return { gcd: oldR, inverse: oldR === 1n ? mod(oldS, p) : null, steps };
}

/** inverse of a mod p; throws ShamirError when none exists */
export function inverse(a, p) {
  const { gcd, inverse: inv } = extendedEuclid(a, p);
  if (inv === null) {
    throw new ShamirError(`${mod(a, p)} has no inverse modulo ${p} (gcd = ${gcd}), so we cannot divide. The modulus must be prime.`);
  }
  return inv;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/** Miller-Rabin; deterministic for p < 3.3e24, overwhelmingly reliable beyond */
export function isPrime(n) {
  n = big(n);
  if (n < 2n) return false;
  for (const q of SMALL_PRIMES) {
    if (n === q) return true;
    if (n % q === 0n) return false;
  }
  let d = n - 1n, r = 0;
  while ((d & 1n) === 0n) { d >>= 1n; r++; }
  outer: for (const a of SMALL_PRIMES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < r; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Lucas-Lehmer test for the Mersenne number 2^e - 1 (e an odd prime) */
export function lucasLehmer(e) {
  const M = (1n << big(e)) - 1n;
  let s = 4n;
  for (let i = 0; i < Number(e) - 2; i++) s = (s * s - 2n) % M;
  return s === 0n;
}

export const P521 = (1n << 521n) - 1n;

/** Throws a clear error unless p is a prime larger than n (assumption A1) */
export function validateModulus(p, n = 7) {
  p = big(p);
  if (!isPrime(p)) throw new ShamirError(`p = ${p} is not prime. Every nonzero number needs an inverse mod p, which only a prime guarantees (assumption A1).`);
  if (p <= big(n)) throw new ShamirError(`p = ${p} must be larger than the number of holders n = ${n}, otherwise two holders share an x-value or someone gets x ≡ 0 (assumption A1).`);
  return p;
}

/** f(x) mod p for coefficients [c0, c1, ...] (Horner) */
export function evalPoly(coeffs, x, p) {
  p = big(p); x = big(x);
  let acc = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) acc = (acc * x + big(coeffs[i])) % p;
  return mod(acc, p);
}

/** Holder i receives (i, f(i)) for i = 1..n */
export function makeShares(coeffs, n, p) {
  const out = [];
  for (let i = 1n; i <= big(n); i++) out.push({ x: i, y: evalPoly(coeffs, i, p) });
  return out;
}

/** uniform random BigInt in [0, max) using crypto.getRandomValues (rejection sampling) */
export function randomBelow(max) {
  max = big(max);
  if (max <= 0n) throw new ShamirError('range must be positive');
  const bits = max.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const excess = BigInt(bytes * 8 - bits);
  const buf = new Uint8Array(bytes);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    let v = 0n;
    for (const b of buf) v = (v << 8n) | BigInt(b);
    v >>= excess;
    if (v < max) return v;
  }
}

export function randomBits(bits) {
  return randomBelow(1n << big(bits));
}

/** Dealer: coefficients [s, a1..a(t-1)] with uniform random a's */
export function randomCoefficients(secret, t, p) {
  const c = [mod(secret, p)];
  for (let i = 1; i < Number(t); i++) c.push(randomBelow(p));
  return c;
}

/**
 * Lagrange weights at x = 0, with every intermediate value recorded.
 * w_j = prod_{m != j} x_m / (x_m - x_j)  (mod p)
 */
export function lagrangeWeightsDetailed(xs, p) {
  p = big(p);
  xs = xs.map(big);
  const seen = new Set();
  for (const x of xs) {
    const k = mod(x, p).toString();
    if (seen.has(k)) throw new ShamirError(`Two holders have the same x-value (${x} mod ${p}). Recovery is impossible: it would divide by zero (assumption A3).`);
    seen.add(k);
  }
  return xs.map((xj, j) => {
    const others = xs.filter((_, m) => m !== j);
    const numRaw = others.reduce((a, xm) => a * xm, 1n);
    const denRaw = others.reduce((a, xm) => a * (xm - xj), 1n);
    const num = mod(numRaw, p), den = mod(denRaw, p);
    const inv = inverse(den, p);
    return { x: xj, others, numRaw, denRaw, num, den, inv, w: (num * inv) % p };
  });
}

export function lagrangeWeights(xs, p) {
  return lagrangeWeightsDetailed(xs, p).map((d) => d.w);
}

/** Rebuild f(0) from shares [{x, y}]; returns { secret, rows, sumRaw, weightSum } */
export function recoverDetailed(shares, p) {
  p = big(p);
  const det = lagrangeWeightsDetailed(shares.map((s) => s.x), p);
  const rows = det.map((d, i) => ({ ...d, y: big(shares[i].y), prod: d.w * big(shares[i].y) }));
  const sumRaw = rows.reduce((a, r) => a + r.prod, 0n);
  const weightSumRaw = rows.reduce((a, r) => a + r.w, 0n);
  return { secret: mod(sumRaw, p), rows, sumRaw, weightSumRaw, weightSum: mod(weightSumRaw, p) };
}

export function recover(shares, p) {
  return recoverDetailed(shares, p).secret;
}

/** multiply coefficient list by (x - root) mod p */
function mulLinear(poly, root, p) {
  const out = new Array(poly.length + 1).fill(0n);
  poly.forEach((c, i) => {
    out[i] = mod(out[i] - root * c, p);
    out[i + 1] = mod(out[i + 1] + c, p);
  });
  return out;
}

/** coefficients of the unique polynomial of degree < k through k points */
export function interpolate(points, p) {
  p = big(p);
  const k = points.length;
  const total = new Array(k).fill(0n);
  points.forEach(({ x: xj, y: yj }, j) => {
    let basis = [1n], den = 1n;
    points.forEach(({ x: xm }, m) => {
      if (m !== j) { basis = mulLinear(basis, big(xm), p); den = mod(den * (big(xj) - big(xm)), p); }
    });
    const scale = mod(big(yj) * inverse(den, p), p);
    for (let i = 0; i < k; i++) total[i] = mod(total[i] + scale * basis[i], p);
  });
  return total;
}

/**
 * What k < t shares say about the secret.
 * For each guess g, the number of polynomials of degree <= t-1 through (0, g) and the
 * k shares is p^(t-1-k). When k = t-1 that number is 1 and `polys` lists the unique one.
 * Listing is only done for small p (<= listLimit).
 */
export function possibleSecrets(shares, t, p, listLimit = 31n) {
  p = big(p); t = Number(t);
  const k = shares.length;
  if (k >= t) throw new ShamirError('enough shares to rebuild: use recover()');
  const free = t - 1 - k;
  const perGuess = p ** BigInt(free);
  let polys = null;
  if (p <= big(listLimit)) {
    // fill the free slots with points (x = big unused values) set to 0, giving one representative
    const used = new Set(shares.map((s) => mod(s.x, p).toString()));
    const extra = [];
    for (let x = p - 1n; extra.length < free && x > 0n; x--) {
      if (!used.has(x.toString())) extra.push({ x, y: 0n });
    }
    polys = [];
    for (let g = 0n; g < p; g++) polys.push({ g, coeffs: interpolate([{ x: 0n, y: g }, ...shares, ...extra], p) });
  }
  return { k, free, perGuess, total: perGuess * p, unique: free === 0, polys };
}

export function binom(n, k) {
  n = big(n); k = big(k);
  if (k < 0n || k > n) return 0n;
  if (k > n - k) k = n - k;
  let r = 1n;
  for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Counting model: C(n,k) for each k, R(t), U(t), safety, availability */
export function groupCounts(n, t) {
  n = Number(n); t = Number(t);
  const perK = [];
  for (let k = 0; k <= n; k++) perK.push(binom(n, k));
  const total = 1n << BigInt(n);
  const R = perK.slice(t).reduce((a, b) => a + b, 0n);
  return { n, t, perK, total, R, U: total - R, safety: t, availability: n - t };
}

/** all k-subsets of an array */
export function combinations(arr, k) {
  const out = [];
  const rec = (start, pick) => {
    if (pick.length === k) { out.push(pick.slice()); return; }
    for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); }
  };
  rec(0, []);
  return out;
}

/** A4 fails: holder `bad` adds `err` to their share; secrets rebuilt by every group of t */
export function wrongShareAnswers(shares, bad, err, t, p) {
  const tampered = shares.map((s) => (s.x === big(bad) ? { x: s.x, y: mod(s.y + big(err), p) } : s));
  return combinations(tampered, Number(t)).map((g) => ({ holders: g.map((s) => s.x), secret: recover(g, p) }));
}

/** tally of answers, sorted most common first */
export function tally(answers) {
  const m = new Map();
  for (const a of answers) m.set(a.secret.toString(), (m.get(a.secret.toString()) || 0) + 1);
  return [...m.entries()].map(([s, c]) => ({ secret: BigInt(s), count: c })).sort((a, b) => b.count - a.count);
}

/** A2 fails: every coefficient equals s, so one share gives s = y / (1 + i + ... + i^(t-1)) */
export function patternedLeak(share, t, p) {
  const x = big(share.x);
  let factor = 0n;
  for (let k = 0n; k < big(t); k++) factor += modPow(x, k, p);
  factor = mod(factor, p);
  return { factor, inv: inverse(factor, p), secret: mod(big(share.y) * inverse(factor, p), p) };
}

/**
 * A1 fails with a composite modulus m: for each group of t holders,
 * does the Lagrange formula fail, and do two different secrets fit the same shares?
 * Ambiguous iff some polynomial with nonzero constant vanishes on all the group's x-values.
 * (Brute force over m^t polynomials; intended for m = 16, t = 5.)
 */
export function compositeModulusReport(m, n = 7, t = 5) {
  const M = Number(m);
  const holders = Array.from({ length: n }, (_, i) => i + 1);
  const groups = combinations(holders, t);
  const pw = holders.map((x) => Array.from({ length: t }, (_, k) => Number(modPow(x, k, M))));
  return groups.map((g) => {
    let lagrangeFails = false;
    try { lagrangeWeights(g, M); } catch { lagrangeFails = true; }
    let ambiguous = false;
    const total = M ** t;
    const c = new Array(t).fill(0);
    for (let idx = 0; idx < total && !ambiguous; idx++) {
      let v = idx;
      for (let k = 0; k < t; k++) { c[k] = v % M; v = (v - c[k]) / M; }
      if (c[0] === 0) continue;
      let ok = true;
      for (const x of g) {
        const row = pw[x - 1];
        let s = 0;
        for (let k = 0; k < t; k++) s += c[k] * row[k];
        if (s % M !== 0) { ok = false; break; }
      }
      if (ok) ambiguous = true;
    }
    return { group: g, lagrangeFails, ambiguous };
  });
}

/** pretty polynomial, e.g. 11 + 7x + 9x² */
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
export const sup = (n) => String(n).split('').map((d) => SUP[+d]).join('');
export function polyToString(coeffs, { showZero = false } = {}) {
  const parts = [];
  coeffs.forEach((c, i) => {
    c = big(c);
    if (c === 0n && !showZero) return;
    const term = i === 0 ? `${c}` : `${c === 1n ? '' : c}x${i > 1 ? sup(i) : ''}`;
    parts.push(term);
  });
  return parts.length ? parts.join(' + ') : '0';
}

export const EXAMPLE = { p: 17n, coeffs: [11n, 7n, 9n, 5n, 6n], n: 7, t: 5 };
