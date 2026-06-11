// node test.js — 점수 규칙 단위 테스트 + 전체 런 시뮬레이션
const H = require('./game.js');

let failed = 0;
function eq(actual, expected, label) {
  if (actual !== expected) {
    failed++;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// ---------- 카드 헬퍼 ----------
const deck = H.buildDeck();
const find = (pred, n) => deck.filter(pred).slice(0, n);
const gwangs = deck.filter(c => c.type === 'gwang');           // 5장 (12월 비광 포함)
const biGwang = gwangs.find(c => c.bi);
const plainGwangs = gwangs.filter(c => !c.bi);                  // 4장
const godoriCards = deck.filter(c => c.godori);                 // 2,4,8월 열끗
const hongdan = deck.filter(c => c.color === 'hong');           // 3장
const plainPi = deck.filter(c => c.type === 'pi' && !c.ssang);
const ssangPi = deck.filter(c => c.ssang);                      // 2장

// ---------- 1. 광 ----------
eq(H.computeScore(plainGwangs.slice(0, 3), [], [], 0).base, 3, '3광(비광 없음)=3');
eq(H.computeScore([...plainGwangs.slice(0, 2), biGwang], [], [], 0).base, 2, '비광 포함 3광=2');
eq(H.computeScore([...plainGwangs.slice(0, 2), biGwang], [], ['umbrella'], 0).base, 3, '비광 우산: 비광 3광=3');
eq(H.computeScore(plainGwangs, [], [], 0).base, 4, '4광=4');
eq(H.computeScore(gwangs, [], [], 0).base, 15, '5광=15');

// ---------- 2. 열끗 / 고도리 ----------
const animals5 = deck.filter(c => c.type === 'animal').slice(0, 5);
eq(H.computeScore(godoriCards, [], [], 0).base, 5, '고도리=5');
eq(H.computeScore(godoriCards, [], ['whistle'], 0).base, 10, '호루라기: 고도리=10');
// 열끗 5장 중 고도리 3장 포함 → 1점 + 고도리 5점
const fiveWithGodori = [...godoriCards, ...deck.filter(c => c.type === 'animal' && !c.godori).slice(0, 2)];
eq(H.computeScore(fiveWithGodori, [], [], 0).base, 6, '열끗5(고도리 포함)=1+5');
void animals5;

// ---------- 3. 띠 ----------
eq(H.computeScore(hongdan, [], [], 0).base, 3, '홍단=3');
eq(H.computeScore(hongdan, [], ['maple'], 0).base, 6, '단풍 부적: 홍단=6');
const ribbons5 = deck.filter(c => c.type === 'ribbon').slice(0, 5); // hong3+cho2 → 홍단3 + 5장1
eq(H.computeScore(ribbons5, [], [], 0).base, 4, '띠5장(홍단 포함)=1+3');

// ---------- 4. 피 ----------
eq(H.computeScore(plainPi.slice(0, 9), [], [], 0).base, 0, '피9=0');
eq(H.computeScore(plainPi.slice(0, 10), [], [], 0).base, 1, '피10=1');
eq(H.computeScore([...plainPi.slice(0, 9), ssangPi[0]], [], [], 0).base, 2, '피9+쌍피=11→2');
eq(H.computeScore([...plainPi.slice(0, 9), ssangPi[0]], [], ['watch'], 0).base, 4, '손목시계: 피9+쌍피(4)=13→4');

// ---------- 5. 고 보너스 / 곱빼기 ----------
const seven = [...plainGwangs.slice(0, 3), ...plainPi.slice(0, 13)]; // 3+4=7점
const oppNoBak = [plainGwangs[3], ...plainPi.slice(13, 19)]; // 광1 + 피6 → 박 없음
eq(H.computeScore(seven, oppNoBak, [], 0).final, 7, '기본 7점');
eq(H.computeScore(seven, oppNoBak, [], 1).final, 8, '1고=+1');
eq(H.computeScore(seven, oppNoBak, [], 3).final, 18, '3고=(7+2)x2');
eq(H.computeScore(seven, oppNoBak, ['double'], 1).final, 14, '곱빼기 1고=x2');
eq(H.computeScore(seven, oppNoBak, ['double'], 2).final, 28, '곱빼기 2고=x4');

// ---------- 6. 피박 / 광박 ----------
// 상대 피 5 이하 + 내 피점수 있음 → 피박 x2 / 상대 광 0 + 내 광점수 → 광박 x2
const sc = H.computeScore(seven, plainPi.slice(13, 17), [], 0); // 상대 피4 → 피박, 광0 → 광박
eq(sc.final, 28, '피박+광박 = 7x2x2');
const scNoBak = H.computeScore(seven, [...plainPi.slice(13, 19), plainGwangs[3]], [], 0); // 상대 피6 + 광1
eq(scNoBak.final, 7, '박 없음 = 7');

// ---------- 7. 전체 런 시뮬레이션 ----------
function allCards(game) {
  return [
    ...game.floor, ...game.stock,
    ...game.player.hand, ...game.player.captured,
    ...game.ai.hand, ...game.ai.captured,
  ];
}
function assertConserved(game, seed) {
  const cards = allCards(game);
  const ids = new Set(cards.map(c => c.id));
  if (cards.length !== 48 || ids.size !== 48) {
    throw new Error(`card conservation broken (seed ${seed}): ${cards.length} cards, ${ids.size} unique`);
  }
}
function greedyPick(game, hand) {
  const value = c => (c.type === 'pi' && c.ssang) ? 3 : ({ gwang: 4, animal: 2.5, ribbon: 2, pi: 1 })[c.type];
  let best = null;
  for (const c of hand) {
    const ms = game.floor.filter(f => f.month === c.month);
    let v;
    if (ms.length === 0) v = -value(c);
    else if (ms.length === 3) v = value(c) + ms.reduce((s, f) => s + value(f), 0) + 3;
    else v = value(c) + Math.max(...ms.map(value));
    if (!best || v > best.v) best = { c, v };
  }
  return best.c;
}

const roundReached = {};
let victories = 0;
const SIMS = 300;
for (let seed = 1; seed <= SIMS; seed++) {
  const run = H.newRun(seed);
  H.startRound(run);
  let guard = 0;
  while (!run.over) {
    const game = run.game;
    if (++guard > 2000) throw new Error('infinite loop, seed ' + seed);
    if (game.phase === 'player') {
      const r = H.playerPlay(run, greedyPick(game, game.player.hand).id);
      if (r.needChoice) H.playerPlay(run, game.pendingChoice.cardId, r.options[0]);
    } else if (game.phase === 'ai') {
      H.aiTurn(run);
    } else if (game.phase === 'gostop') {
      const s = H.score(run, 'player');
      if (s.final >= game.target) H.declareStop(run); else H.declareGo(run);
    } else if (game.phase === 'over') {
      assertConserved(game, seed);
      const result = H.finishRound(run);
      roundReached[run.round] = (roundReached[run.round] || 0) + (result.pass ? 1 : 0);
      if (run.over) break;
      // 상점: 살 수 있는 가장 비싼 유물 구매
      const offers = H.shopOffers(run).filter(o => o.cost <= run.gold).sort((a, b) => b.cost - a.cost);
      if (offers.length) H.buyRelic(run, offers[0].key);
      H.nextRound(run);
    }
    assertConserved(run.game, seed);
  }
  if (run.victory) victories++;
}
console.log(`\n시뮬레이션 ${SIMS}런 완료 (그리디 정책)`);
console.log('라운드별 통과 횟수:', roundReached);
console.log(`최종 승리(8라운드 클리어): ${victories}/${SIMS}`);

if (failed) { console.error(`\n${failed} test(s) FAILED`); process.exit(1); }
console.log('\n모든 단위 테스트 통과');
