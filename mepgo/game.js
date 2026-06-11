// 한판만 더: 맞고 로그라이크 — 코어 로직 (브라우저 + Node 공용)
// 간략화한 2인 맞고 규칙: 뻑/따닥/쪽/싹쓸이/피박/광박/고스톱 구현, 폭탄/흔들기/총통은 생략
const Hanpan = (() => {
  // mulberry32 시드 RNG — 같은 시드면 같은 패 배열
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MONTH_NAMES = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국화', '단풍', '오동', '비'];

  const DECK_SPEC = {
    1:  [['gwang'], ['ribbon', { color: 'hong' }], ['pi'], ['pi']],
    2:  [['animal', { godori: true }], ['ribbon', { color: 'hong' }], ['pi'], ['pi']],
    3:  [['gwang'], ['ribbon', { color: 'hong' }], ['pi'], ['pi']],
    4:  [['animal', { godori: true }], ['ribbon', { color: 'cho' }], ['pi'], ['pi']],
    5:  [['animal'], ['ribbon', { color: 'cho' }], ['pi'], ['pi']],
    6:  [['animal'], ['ribbon', { color: 'cheong' }], ['pi'], ['pi']],
    7:  [['animal'], ['ribbon', { color: 'cho' }], ['pi'], ['pi']],
    8:  [['gwang'], ['animal', { godori: true }], ['pi'], ['pi']],
    9:  [['animal'], ['ribbon', { color: 'cheong' }], ['pi'], ['pi']],
    10: [['animal'], ['ribbon', { color: 'cheong' }], ['pi'], ['pi']],
    11: [['gwang'], ['pi', { ssang: true }], ['pi'], ['pi']],
    12: [['gwang', { bi: true }], ['animal'], ['ribbon', {}], ['pi', { ssang: true }]],
  };

  function buildDeck() {
    const deck = [];
    let id = 0;
    for (const m of Object.keys(DECK_SPEC)) {
      for (const [type, tags] of DECK_SPEC[m]) {
        deck.push({ id: id++, month: +m, type, ...(tags || {}) });
      }
    }
    return deck;
  }

  const RELICS = [
    { key: 'watch',     name: '사장님 손목시계', cost: 9,  desc: '쌍피가 4피로 계산된다' },
    { key: 'umbrella',  name: '비광 우산',       cost: 6,  desc: '비광이 끼어도 3광이 3점' },
    { key: 'double',    name: '곱빼기',          cost: 12, desc: '고 1회마다 최종 점수 ×2 (기본 고 보너스 대체)' },
    { key: 'maple',     name: '단풍 부적',       cost: 8,  desc: '띠 점수가 2배' },
    { key: 'whistle',   name: '새 호루라기',     cost: 7,  desc: '고도리가 10점' },
    { key: 'gaepyeong', name: '개평',            cost: 6,  desc: '매 라운드 피 2장을 갖고 시작' },
  ];

  const TARGETS = [3, 5, 7, 9, 12, 15, 18, 22];

  // ---------- 점수 계산 ----------
  function piVal(card, relics) {
    if (card.type !== 'pi') return 0;
    if (card.ssang) return relics.includes('watch') ? 4 : 2;
    return 1;
  }

  function computeScore(mine, opp, relics, goCount) {
    const parts = [];
    const gwangs = mine.filter(c => c.type === 'gwang');
    const hasBi = gwangs.some(c => c.bi);
    let gwangPts = 0;
    if (gwangs.length === 5) gwangPts = 15;
    else if (gwangs.length === 4) gwangPts = 4;
    else if (gwangs.length === 3) gwangPts = (hasBi && !relics.includes('umbrella')) ? 2 : 3;
    if (gwangPts) parts.push({ label: `광 ${gwangs.length}장`, pts: gwangPts });

    const animals = mine.filter(c => c.type === 'animal');
    if (animals.length >= 5) parts.push({ label: `열끗 ${animals.length}장`, pts: animals.length - 4 });
    const godoriMonths = new Set(animals.filter(c => c.godori).map(c => c.month));
    if (godoriMonths.size === 3) parts.push({ label: '고도리', pts: relics.includes('whistle') ? 10 : 5 });

    const ribbons = mine.filter(c => c.type === 'ribbon');
    let ribbonPts = 0;
    if (ribbons.length >= 5) ribbonPts += ribbons.length - 4;
    for (const color of ['hong', 'cheong', 'cho']) {
      if (ribbons.filter(c => c.color === color).length === 3) ribbonPts += 3;
    }
    if (relics.includes('maple')) ribbonPts *= 2;
    if (ribbonPts) parts.push({ label: `띠 ${ribbons.length}장`, pts: ribbonPts });

    const piValue = mine.reduce((s, c) => s + piVal(c, relics), 0);
    if (piValue >= 10) parts.push({ label: `피 ${piValue}`, pts: piValue - 9 });

    let base = parts.reduce((s, p) => s + p.pts, 0);

    // 고 보너스 / 배수
    let mult = 1;
    const multNotes = [];
    if (goCount > 0) {
      if (relics.includes('double')) {
        mult *= Math.pow(2, goCount);
        multNotes.push(`곱빼기 ${goCount}고 ×${Math.pow(2, goCount)}`);
      } else {
        const add = Math.min(goCount, 2);
        base += add;
        if (add) multNotes.push(`고 +${add}`);
        if (goCount > 2) { mult *= Math.pow(2, goCount - 2); multNotes.push(`${goCount}고 ×${Math.pow(2, goCount - 2)}`); }
      }
    }
    // 피박 / 광박 (상대 패 기준 — 상대 계산엔 유물 미적용)
    const oppPiValue = opp.reduce((s, c) => s + piVal(c, []), 0);
    if (piValue >= 10 && oppPiValue <= 5) { mult *= 2; multNotes.push('피박 ×2'); }
    if (gwangPts > 0 && opp.filter(c => c.type === 'gwang').length === 0) { mult *= 2; multNotes.push('광박 ×2'); }

    return { parts, base, mult, multNotes, final: base * mult, piValue, oppPiValue };
  }

  // ---------- 런 / 라운드 ----------
  function newRun(seed) {
    return {
      seed, rng: makeRng(seed),
      round: 1, gold: 0, relics: [], targets: TARGETS,
      game: null, lastResult: null, over: false, victory: false,
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startRound(run) {
    let deck, floor;
    do { // 바닥에 같은 달 3장 이상이면 다시 섞는다
      deck = shuffle(buildDeck(), run.rng);
      floor = deck.slice(0, 8);
    } while ([...new Set(floor.map(c => c.month))].some(m => floor.filter(c => c.month === m).length >= 3));

    const game = {
      floor: deck.slice(0, 8),
      player: { hand: deck.slice(8, 18), captured: [], goCount: 0, lastGoBase: 0 },
      ai:     { hand: deck.slice(18, 28), captured: [], goCount: 0, lastGoBase: 0 },
      stock: deck.slice(28),
      phase: 'player', // player | choose | gostop | ai | over
      pendingChoice: null,
      over: null,
      target: run.targets[run.round - 1],
      log: [],
    };
    if (run.relics.includes('gaepyeong')) {
      for (let i = 0; i < 2; i++) {
        const idx = game.stock.findIndex(c => c.type === 'pi' && !c.ssang);
        if (idx >= 0) game.player.captured.push(game.stock.splice(idx, 1)[0]);
      }
      game.log.push('개평: 피 2장을 받고 시작');
    }
    run.game = game;
    return game;
  }

  // ---------- 턴 처리 ----------
  const CARD_VALUE = { gwang: 4, animal: 2.5, ribbon: 2, pi: 1 };
  function cardValue(c) { return c.type === 'pi' && c.ssang ? 3 : CARD_VALUE[c.type]; }
  function cardName(c) {
    const t = c.type === 'gwang' ? (c.bi ? '비광' : '광')
      : c.type === 'animal' ? '열끗'
      : c.type === 'ribbon' ? '띠'
      : c.ssang ? '쌍피' : '피';
    return `${c.month}월 ${MONTH_NAMES[c.month]} ${t}`;
  }

  function stealPi(game, actor, why, events) {
    const opp = actor === 'player' ? game.ai : game.player;
    const me = actor === 'player' ? game.player : game.ai;
    let idx = opp.captured.findIndex(c => c.type === 'pi' && !c.ssang);
    if (idx < 0) idx = opp.captured.findIndex(c => c.type === 'pi');
    if (idx >= 0) {
      const c = opp.captured.splice(idx, 1)[0];
      me.captured.push(c);
      events.push(`${why}! 상대 피 1장을 가져온다 (${cardName(c)})`);
    } else {
      events.push(`${why}! (상대에게 가져올 피가 없다)`);
    }
  }

  // actor의 한 턴: 손패 카드 내기 → 더미 뒤집기 → 획득 정산
  // 바닥에 같은 달이 2장이고 선택이 필요한 경우(플레이어) {needChoice} 반환
  function resolveTurn(game, actor, cardId, choiceId) {
    const me = actor === 'player' ? game.player : game.ai;
    const who = actor === 'player' ? '나' : '상대';
    const events = [];
    const handIdx = me.hand.findIndex(c => c.id === cardId);
    if (handIdx < 0) throw new Error('hand card not found: ' + cardId);
    const played = me.hand[handIdx];
    const matches = game.floor.filter(c => c.month === played.month);

    let chosen = null;
    if (matches.length === 2) {
      if (choiceId != null) {
        chosen = matches.find(c => c.id === choiceId);
        if (!chosen) throw new Error('invalid choice');
      } else if (actor === 'ai') {
        chosen = matches.slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
      } else {
        return { needChoice: true, options: matches.map(c => c.id) };
      }
    } else if (matches.length === 1) {
      chosen = matches[0];
    }

    me.hand.splice(handIdx, 1);
    const gained = [];
    let pending = null; // {played, floorCard} — 뻑 가능성 때문에 보류
    let playedToFloor = false;

    if (matches.length === 0) {
      game.floor.push(played);
      playedToFloor = true;
      events.push(`${who}: ${cardName(played)} — 바닥에 깔림`);
    } else if (matches.length === 3) {
      game.floor = game.floor.filter(c => c.month !== played.month);
      gained.push(played, ...matches);
      events.push(`${who}: ${cardName(played)} — 같은 달 3장을 쓸어담음`);
      stealPi(game, actor, '뻑 잡기', events);
    } else {
      game.floor = game.floor.filter(c => c.id !== chosen.id);
      pending = { played, floorCard: chosen };
      events.push(`${who}: ${cardName(played)} → ${cardName(chosen)} 짝`);
    }

    // 더미 뒤집기
    const flip = game.stock.length ? game.stock.pop() : null;
    if (flip) {
      events.push(`${who} 더미: ${cardName(flip)}`);
      if (pending && flip.month === pending.played.month) {
        const remain = game.floor.filter(c => c.month === flip.month);
        if (remain.length > 0) { // 따닥: 4장 전부 획득
          game.floor = game.floor.filter(c => c.month !== flip.month);
          gained.push(pending.played, pending.floorCard, flip, ...remain);
          events.push('따닥! 같은 달 4장 전부 획득');
          stealPi(game, actor, '따닥', events);
        } else { // 뻑: 3장 모두 바닥에
          game.floor.push(pending.played, pending.floorCard, flip);
          events.push('뻑! 3장이 바닥에 묶인다');
        }
        pending = null;
      } else {
        if (pending) { gained.push(pending.played, pending.floorCard); pending = null; }
        const fMatches = game.floor.filter(c => c.month === flip.month);
        if (fMatches.length === 0) {
          game.floor.push(flip);
        } else if (fMatches.length === 3) {
          game.floor = game.floor.filter(c => c.month !== flip.month);
          gained.push(flip, ...fMatches);
          events.push('더미로 뻑 무더기를 쓸어담음');
          stealPi(game, actor, '뻑 잡기', events);
        } else {
          const pick = fMatches.length === 2
            ? fMatches.slice().sort((a, b) => cardValue(b) - cardValue(a))[0]
            : fMatches[0];
          game.floor = game.floor.filter(c => c.id !== pick.id);
          gained.push(flip, pick);
          if (playedToFloor && pick.id === played.id) {
            events.push('쪽!');
            stealPi(game, actor, '쪽', events);
          }
        }
      }
    } else if (pending) {
      gained.push(pending.played, pending.floorCard);
      pending = null;
    }

    if (gained.length) {
      me.captured.push(...gained);
      events.push(`${who} 획득: ${gained.map(cardName).join(', ')}`);
      if (game.floor.length === 0) stealPi(game, actor, '싹쓸이', events);
    }
    game.log.push(...events);
    return { events };
  }

  function afterTurn(run, actor) {
    const game = run.game;
    const me = actor === 'player' ? game.player : game.ai;
    const opp = actor === 'player' ? game.ai : game.player;
    const relics = actor === 'player' ? run.relics : [];
    const sc = computeScore(me.captured, opp.captured, relics, me.goCount);
    if (sc.base >= 7 && sc.base > me.lastGoBase) {
      if (actor === 'player') { game.phase = 'gostop'; return; }
      // AI는 7점이 되면 무조건 스톱 (프로토타입 단순화)
      game.phase = 'over';
      game.over = { reason: 'ai-stop' };
      game.log.push('상대가 7점으로 스톱을 선언했다!');
      return;
    }
    if (game.player.hand.length === 0 && game.ai.hand.length === 0) {
      game.phase = 'over';
      game.over = { reason: 'exhausted' };
      game.log.push('패가 다 떨어졌다 (나가리) — 현재 점수로 정산');
      return;
    }
    game.phase = actor === 'player' ? 'ai' : 'player';
  }

  // ---------- 공개 API ----------
  function playerPlay(run, cardId, choiceId) {
    const game = run.game;
    if (game.phase !== 'player' && game.phase !== 'choose') throw new Error('not player phase: ' + game.phase);
    const r = resolveTurn(game, 'player', cardId, choiceId);
    if (r.needChoice) {
      game.phase = 'choose';
      game.pendingChoice = { cardId, options: r.options };
      return r;
    }
    game.pendingChoice = null;
    afterTurn(run, 'player');
    return r;
  }

  function declareGo(run) {
    const game = run.game;
    if (game.phase !== 'gostop') throw new Error('not gostop phase');
    const sc = computeScore(game.player.captured, game.ai.captured, run.relics, game.player.goCount);
    game.player.lastGoBase = sc.base;
    game.player.goCount++;
    game.log.push(`고! (${game.player.goCount}고)`);
    if (game.player.hand.length === 0 && game.ai.hand.length === 0) {
      game.phase = 'over';
      game.over = { reason: 'exhausted' };
    } else {
      game.phase = 'ai';
    }
  }

  function declareStop(run) {
    const game = run.game;
    if (game.phase !== 'gostop') throw new Error('not gostop phase');
    game.phase = 'over';
    game.over = { reason: 'player-stop' };
    game.log.push('스톱!');
  }

  function aiTurn(run) {
    const game = run.game;
    if (game.phase !== 'ai') throw new Error('not ai phase');
    const ai = game.ai;
    // 그리디: (내는 카드 가치 + 가져올 카드 가치) 최대. 짝 없으면 가장 싼 카드 버림
    let best = null;
    for (const c of ai.hand) {
      const ms = game.floor.filter(f => f.month === c.month);
      let v;
      if (ms.length === 0) v = -cardValue(c);
      else if (ms.length === 3) v = cardValue(c) + ms.reduce((s, f) => s + cardValue(f), 0) + 3;
      else v = cardValue(c) + Math.max(...ms.map(cardValue));
      if (!best || v > best.v) best = { c, v };
    }
    const r = resolveTurn(game, 'ai', best.c.id, null);
    afterTurn(run, 'ai');
    return r;
  }

  function finishRound(run) {
    const game = run.game;
    if (game.phase !== 'over') throw new Error('round not over');
    const sc = computeScore(game.player.captured, game.ai.captured, run.relics, game.player.goCount);
    const pass = sc.final >= game.target;
    const goldGained = pass ? sc.final : 0;
    if (pass) run.gold += goldGained;
    run.lastResult = { pass, final: sc.final, target: game.target, goldGained, reason: game.over.reason, score: sc };
    if (!pass) run.over = true;
    else if (run.round >= run.targets.length) { run.over = true; run.victory = true; }
    return run.lastResult;
  }

  function shopOffers(run) {
    const pool = RELICS.filter(r => !run.relics.includes(r.key));
    const offers = [];
    const copy = pool.slice();
    while (offers.length < 3 && copy.length) {
      offers.push(copy.splice(Math.floor(run.rng() * copy.length), 1)[0]);
    }
    return offers;
  }

  function buyRelic(run, key) {
    const relic = RELICS.find(r => r.key === key);
    if (!relic || run.relics.includes(key) || run.gold < relic.cost) return false;
    run.gold -= relic.cost;
    run.relics.push(key);
    return true;
  }

  function nextRound(run) {
    if (run.over) throw new Error('run is over');
    run.round++;
    return startRound(run);
  }

  function score(run, who) {
    const game = run.game;
    const me = who === 'player' ? game.player : game.ai;
    const opp = who === 'player' ? game.ai : game.player;
    return computeScore(me.captured, opp.captured, who === 'player' ? run.relics : [], me.goCount);
  }

  return {
    MONTH_NAMES, RELICS, TARGETS, buildDeck, computeScore, cardName,
    newRun, startRound, nextRound, playerPlay, declareGo, declareStop, aiTurn,
    finishRound, shopOffers, buyRelic, score,
  };
})();

if (typeof module !== 'undefined') module.exports = Hanpan;
