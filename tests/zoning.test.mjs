// Domain tests for the REAL shipped code (mimari-tasarim.html) via the vm harness.
// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSandbox } from './harness.mjs';

const S = loadSandbox();

function makeInp(over = {}) {
  return {
    key: 't', cephe: 20, derinlik: 30, yol: 'S', nizam: 'ayrik',
    taks: 0.3, kaks: 1.2, katAdet: 4, katH: 3, on: 5, yan: 3, arka: 3,
    kullanim: 'konut', daireTip: 'auto', oturum: 'auto', catiTipi: 'teras',
    cekmeKat: false, lat: 39.9, sunOn: false, sunAy: 6, sunSaat: 13, sunSweep: false,
    komsuYuk: 0, komsuYon: 'S', komsuMes: 10, egim: 0, egimYon: 'S', ...over,
  };
}

test('harness loaded the domain functions without a top-level error', () => {
  assert.equal(S.__topLevelError, undefined);
  for (const fn of ['compute', 'feasibility', 'parseImarNotes', 'solarPos', 'sunHours', 'clamp', 'imarNum']) {
    assert.equal(typeof S[fn], 'function', `${fn} should be a function`);
  }
});

test('compute: parcel area = cephe × derinlik', () => {
  const C = S.compute(makeInp(), null);
  assert.equal(C.parselAlan, 600);
});

test('compute: taban alanı respects TAKS (≤ TAKS × parsel)', () => {
  const C = S.compute(makeInp({ taks: 0.3 }), null);
  assert.ok(C.tabanAlan <= 0.3 * C.parselAlan + 1, `taban ${C.tabanAlan} should be ≤ ${0.3 * C.parselAlan}`);
});

test('compute: emsal kullanımı does not exceed KAKS', () => {
  const C = S.compute(makeInp({ taks: 0.3, kaks: 1.2, katAdet: 4 }), null);
  assert.ok(C.emsalKullanim <= 1.2 + 0.01, `emsal ${C.emsalKullanim} ≤ KAKS 1.2`);
});

test('compute: Hmax follows 3.0·kat + 3.5 yönetmelik formula', () => {
  const C = S.compute(makeInp({ katAdet: 5 }), null);
  assert.equal(C.hmax, 3.0 * 5 + 3.5); // 18.5
});

test('compute: more floors ⇒ more total construction (monotonic)', () => {
  const a = S.compute(makeInp({ katAdet: 3 }), null);
  const b = S.compute(makeInp({ katAdet: 6 }), null);
  assert.ok(b.toplamInsaat > a.toplamInsaat);
});

test('compute: over-floored design raises an "err" severity warning', () => {
  const C = S.compute(makeInp({ taks: 0.3, kaks: 1.2, katAdet: 9 }), null);
  const hasErr = (C.uyarilar || []).some((u) => u && u.sev === 'err');
  assert.ok(hasErr, 'expected an err-severity imar warning for 9 floors at KAKS 1.2');
});

test('compute: slope produces a kot farkı', () => {
  const C = S.compute(makeInp({ egim: 10, egimYon: 'S', derinlik: 30 }), null);
  assert.ok(Math.abs(C.kotFarki - 3) < 0.01, `kotFarki ${C.kotFarki} ≈ 3 m (10% of 30 m)`);
});

test('feasibility: revenue/profit consistent with prices', () => {
  const C = S.compute(makeInp(), null);
  const f = S.feasibility(C, { costBuild: 18000, costSale: 55000, costLand: 0, costExtra: 35, costPermit: 6, costCommon: 10 });
  assert.ok(f.satilabilir > 0 && f.satilabilir <= f.toplamYapi);
  assert.ok(f.gelir > f.insMaliyet, 'gelir should beat construction cost at these prices');
  assert.equal(Math.round(f.kar), Math.round(f.gelir - f.toplamYatirim));
  assert.ok(f.otopark >= f.toplamDaire - 1, 'parking ≈ one per dwelling for konut');
});

test('feasibility: bağımsız bölüm matches compute (single source of truth)', () => {
  const C = S.compute(makeInp(), null);
  const f = S.feasibility(C, {});
  assert.equal(f.toplamDaire, C.toplamDaire);
});

test('parseImarNotes: standard note extracts all fields', () => {
  const f = S.parseImarNotes('Ayrık nizam, TAKS: 0.30, KAKS (Emsal): 1.05, Yençok: 4 kat, ön bahçe 5 m, yan bahçe 3 m, konut alanı');
  assert.equal(f.nizam, 'ayrik');
  assert.equal(f.taks, 0.3);
  assert.equal(f.kaks, 1.05); // regression: parenthetical "(Emsal)" must not break capture
  assert.equal(f.kat, 4);
  assert.equal(f.on, 5);
  assert.equal(f.yan, 3);
  assert.equal(f.kullanim, 'konut');
});

test('parseImarNotes: percentage TAKS (%40) → 0.40', () => {
  const f = S.parseImarNotes('Emsal 2.00, %40 TAKS, 8 kat');
  assert.equal(f.taks, 0.4);
  assert.equal(f.kaks, 2);
  assert.equal(f.kat, 8);
});

test('parseImarNotes: serbest yükseklik flagged', () => {
  const f = S.parseImarNotes('Yençok: serbest, Emsal: 3.00');
  assert.equal(f.hmaxNote, 'serbest');
  assert.equal(f.kaks, 3);
});

test('parseImarNotes: Hmax in metres infers floor count', () => {
  const f = S.parseImarNotes('Bina yüksekliği: 24.50 m, ayrık nizam');
  assert.ok(f.hmaxM >= 24 && f.hmaxM <= 25);
  assert.ok(f.kat >= 6 && f.kat <= 8, `inferred kat ${f.kat} from 24.5 m`);
});

test('solarPos: summer noon sun is high in the south (N hemisphere)', () => {
  const sp = S.solarPos(39.9, 6, 12); // Ankara, June, solar noon
  assert.ok(sp.altDeg > 60, `noon altitude ${sp.altDeg} should be high`);
  assert.ok(Math.abs(sp.azDeg - 180) < 30, `azimuth ${sp.azDeg} near south`);
});

test('solarPos: night returns negative altitude', () => {
  const sp = S.solarPos(39.9, 12, 0); // midnight, winter
  assert.ok(sp.altDeg < 0, `midnight altitude ${sp.altDeg} should be below horizon`);
});

test('yonetmelik: yan setback grows after 4 floors (3 + 0.5/extra floor)', () => {
  assert.equal(S.yonetmelik({ katAdet: 4, kullanim: 'konut' }).minYan, 3);
  assert.equal(S.yonetmelik({ katAdet: 8, kullanim: 'konut' }).minYan, 5); // 3 + (8-4)*0.5
  assert.ok(S.yonetmelik({ katAdet: 8 }).minArka >= S.yonetmelik({ katAdet: 8 }).minYan);
});

test('yonetmelik: elevator required at 4+ floors, two when tall/dense', () => {
  assert.equal(S.yonetmelik({ katAdet: 3 }).asansorGerek, false);
  assert.equal(S.yonetmelik({ katAdet: 4 }).asansorAdet, 1);
  assert.equal(S.yonetmelik({ katAdet: 9 }).asansorAdet, 2);
  assert.equal(S.yonetmelik({ katAdet: 5, toplamDaire: 40 }).asansorAdet, 2);
});

test('yonetmelik: high-rise (>21.5 m) needs a second fire escape', () => {
  assert.equal(S.yonetmelik({ katAdet: 6, yukseklik: 25 }).yuksekYapi, true);
  assert.equal(S.yonetmelik({ katAdet: 6, yukseklik: 25 }).ikinciKacis, true);
  assert.equal(S.yonetmelik({ katAdet: 4, yukseklik: 15 }).yuksekYapi, false);
});

test('yonetmelik: parking ratio scales with avg dwelling size', () => {
  assert.equal(S.yonetmelik({ kullanim: 'konut', toplamDaire: 10, ortDaireAlan: 70 }).otoparkPer, 1);
  assert.equal(S.yonetmelik({ kullanim: 'konut', toplamDaire: 10, ortDaireAlan: 120 }).otoparkPer, 1.5);
  assert.equal(S.yonetmelik({ kullanim: 'konut', toplamDaire: 10, ortDaireAlan: 200 }).otoparkPer, 2);
  // office: ~1 space / 50 m²
  assert.equal(S.yonetmelik({ kullanim: 'ofis', emsalAlan: 1000 }).otopark, 20);
});

test('yonetmelik: shelter required above 12 dwellings', () => {
  assert.equal(S.yonetmelik({ toplamDaire: 12 }).siginakGerek, false);
  assert.equal(S.yonetmelik({ toplamDaire: 13 }).siginakGerek, true);
});

test('feasibility: parking uses the yönetmelik ratio (large flats ⇒ ≥1.5/flat)', () => {
  const C = S.compute(makeInp({ taks: 0.35, kaks: 1.6, katAdet: 5, daireTip: '3+1' }), null);
  const f = S.feasibility(C, {});
  if (f.toplamDaire > 0 && f.ortDaire > 150) {
    assert.ok(f.otopark >= Math.ceil(f.toplamDaire * 1.5) - 1, `otopark ${f.otopark} should reflect ≥1.5/flat for ${f.ortDaire.toFixed(0)} m² flats`);
  }
  assert.ok([1, 1.5, 2, null].includes(f.otoparkPer));
});

test('cekirdek: core grows with elevator count and includes a stair', () => {
  const c0 = S.cekirdek({ katAdet: 3, asansorAdet: 0 });
  const c1 = S.cekirdek({ katAdet: 5, asansorAdet: 1 });
  const c2 = S.cekirdek({ katAdet: 10, asansorAdet: 2 });
  assert.ok(c0.merdivenW > 0 && c0.merdivenD > 0, 'always has a stair');
  assert.ok(c1.coreW > c0.coreW, 'one elevator widens the core');
  assert.ok(c2.coreW > c1.coreW, 'two elevators wider still');
  assert.ok(c2.saft, 'tall building has a light/vent shaft');
  assert.ok(c2.alan > c0.alan);
});

test('genFloor: multi-storey konut produces a real core with spec', () => {
  const C = S.compute(makeInp({ katAdet: 6, kullanim: 'konut' }), null);
  const F = S.genFloor(C, null);
  assert.ok(F.core && F.core.spec, 'core present for 6-storey konut');
  assert.ok(F.core.spec.asansorAdet >= 1, 'elevator required at 6 storeys');
});

test('sunHours: a tall close neighbour reduces façade sun hours', () => {
  const open = S.sunHours(39.9, 12, 'S', { h: 0, yon: 'S', mes: 10 });
  const blocked = S.sunHours(39.9, 12, 'S', { h: 40, yon: 'S', mes: 4 });
  assert.ok(blocked.blocked > 0, 'neighbour should block some hours');
  assert.ok(blocked.facade <= open.facade, 'façade hours should not increase with a blocking neighbour');
});
