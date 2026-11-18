// Run with: node --test tests/   (Node 18+; no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/shamir.js';

const P = 17n;
const F = [11n, 7n, 9n, 5n, 6n];
const shares = S.makeShares(F, 7, P);
const nums = (a) => a.map(Number);

test('shares of f = [11,7,9,5,6] mod 17 are [4,10,3,16,5,2,13]', () => {
  assert.deepEqual(nums(shares.map((s) => s.y)), [4, 10, 3, 16, 5, 2, 13]);
});

test('weights for x = [2,3,5,6,7] are [2,8,4,8,13] and sum to 35 ≡ 1', () => {
  assert.deepEqual(nums(S.lagrangeWeights([2, 3, 5, 6, 7], P)), [2, 8, 4, 8, 13]);
  const d = S.recoverDetailed([2, 3, 5, 6, 7].map((x) => shares[x - 1]), P);
  assert.equal(d.weightSumRaw, 35n);
  assert.equal(d.weightSum, 1n);
});

test('holders 2,3,5,6,7 recover 11 via 249 ≡ 11', () => {
  const d = S.recoverDetailed([2, 3, 5, 6, 7].map((x) => shares[x - 1]), P);
  assert.equal(d.sumRaw, 249n);
  assert.equal(d.secret, 11n);
});

test('every one of the 21 groups of five (and all 29 groups of 5+) recovers 11', () => {
  const fives = S.combinations(shares, 5);
  assert.equal(fives.length, 21);
  for (const g of fives) assert.equal(S.recover(g, P), 11n);
  const all = [5, 6, 7].flatMap((k) => S.combinations(shares, k));
  assert.equal(all.length, 29);
  for (const g of all) assert.equal(S.recover(g, P), 11n);
});

test('holders 1–4: each guess 0..16 gives exactly one polynomial, guess 3 has a4 = 0', () => {
  const r = S.possibleSecrets(shares.slice(0, 4), 5, P);
  assert.equal(r.perGuess, 1n);
  assert.equal(r.polys.length, 17);
  assert.equal(new Set(r.polys.map((x) => x.coeffs.join(','))).size, 17);
  const h0 = [0n, 3n, 5n, 11n, 2n], L0 = [1n, 5n, 5n, 1n, 5n];
  for (const { g, coeffs } of r.polys) {
    assert.equal(coeffs[0], g);
    assert.deepEqual(coeffs, h0.map((a, i) => S.mod(a + g * L0[i], P)));
    for (const s of shares.slice(0, 4)) assert.equal(S.evalPoly(coeffs, s.x, P), s.y);
  }
  assert.deepEqual(r.polys[11].coeffs, F);
  assert.deepEqual(nums(r.polys[3].coeffs), [3, 1, 3, 14, 0]);
  assert.deepEqual(r.polys.filter((x) => x.coeffs[4] === 0n).map((x) => Number(x.g)), [3]);
});

test('fewer shares: every guess fits p^(4-k) polynomials', () => {
  assert.equal(S.possibleSecrets(shares.slice(0, 2), 5, P).perGuess, 289n);
  assert.equal(S.possibleSecrets([], 5, P).perGuess, 17n ** 4n);
});

test('inverse of 9 mod 17 is 2; Fermat agrees for all a', () => {
  assert.equal(S.inverse(9, P), 2n);
  for (let a = 1n; a < P; a++) assert.equal(S.inverse(a, P), S.modPow(a, P - 2n, P));
});

test('R(5) = 29, U(5) = 99 for n = 7, and the t-table', () => {
  const c = S.groupCounts(7, 5);
  assert.equal(c.R, 29n); assert.equal(c.U, 99n); assert.equal(c.total, 128n);
  const tbl = [3, 4, 5, 6, 7].map((t) => Number(S.groupCounts(7, t).R));
  assert.deepEqual(tbl, [99, 64, 29, 8, 1]);
  for (let t = 1; t <= 7; t++) assert.equal(S.groupCounts(7, t).R, S.groupCounts(7, 8 - t).U);
});

test('non-prime modulus 16 is rejected with a clear message', () => {
  assert.throws(() => S.validateModulus(16), S.ShamirError);
  assert.throws(() => S.lagrangeWeights([1, 2, 3, 4, 5], 16), /no inverse modulo 16/);
  assert.throws(() => S.validateModulus(7, 7), /larger than/);
});

test('mod 16: Lagrange fails for all 21 groups of five, 7 ambiguous', () => {
  const rep = S.compositeModulusReport(16);
  assert.equal(rep.filter((r) => r.lagrangeFails).length, 21);
  assert.equal(rep.filter((r) => r.ambiguous).length, 7);
});

test('wrong share: 5 → wrong unnoticed, 6 → disagree, 7 → true secret 6 of 21', () => {
  for (let e = 1n; e < P; e++) {
    for (let j = 1n; j <= 5n; j++) assert.notEqual(S.wrongShareAnswers(shares.slice(0, 5), j, e, 5, P)[0].secret, 11n);
    for (let j = 1n; j <= 6n; j++) assert.ok(S.tally(S.wrongShareAnswers(shares.slice(0, 6), j, e, 5, P)).length > 1);
    for (let j = 1n; j <= 7n; j++) {
      const t = S.tally(S.wrongShareAnswers(shares, j, e, 5, P));
      assert.equal(t[0].secret, 11n); assert.equal(t[0].count, 6); assert.ok(t[1].count <= 3);
    }
  }
});

test('patterned dealer and p = 7 leaks', () => {
  for (let s = 0n; s < P; s++) for (let i = 1n; i <= 7n; i++) {
    const c = [s, s, s, s, s];
    assert.equal(S.patternedLeak({ x: i, y: S.evalPoly(c, i, P) }, 5, P).secret, s);
  }
  assert.equal(S.evalPoly(F, 7, 7), S.mod(11, 7)); // x = 7 ≡ 0 mod 7 gives f(0)
  assert.throws(() => S.lagrangeWeights([3, 3, 4], P), /same x-value/);
});

test('real size: 2^521 - 1 is prime and a 256-bit secret is rebuilt', () => {
  assert.ok(S.lucasLehmer(521));
  assert.ok(S.isPrime(S.P521));
  const s = S.randomBits(256);
  const c = S.randomCoefficients(s, 5, S.P521);
  const sh = S.makeShares(c, 7, S.P521);
  for (const g of S.combinations(sh, 5)) assert.equal(S.recover(g, S.P521), s);
});
