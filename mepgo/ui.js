// 한판만 더: 맞고 로그라이크 — UI
let run = null;
let shopOffers = null;

const $ = sel => document.querySelector(sel);

// ---------- 카드 렌더링 ----------
function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card ' + card.type + (card.ssang ? ' ssang' : '') + (card.bi ? ' bi' : '');
  if (opts.selectable) el.classList.add('selectable');
  const sym = card.type === 'gwang' ? '光'
    : card.type === 'animal' ? (card.godori ? '🐦' : '열')
    : card.type === 'ribbon' ? '띠'
    : card.ssang ? '쌍' : '피';
  el.innerHTML = `
    <div class="c-month">${card.month}</div>
    <div class="c-sym">${sym}</div>
    <div class="c-name">${Hanpan.MONTH_NAMES[card.month]}</div>
    ${card.type === 'ribbon' ? `<div class="stripe ${card.color || 'plain'}"></div>` : ''}`;
  if (opts.onclick) el.onclick = opts.onclick;
  return el;
}

function cardBackEl() {
  const el = document.createElement('div');
  el.className = 'card back';
  el.textContent = '花';
  return el;
}

function groupCaptured(captured) {
  const groups = { gwang: [], animal: [], ribbon: [], pi: [] };
  for (const c of captured) groups[c.type].push(c);
  return groups;
}

function renderCapturedInto(el, captured) {
  el.innerHTML = '';
  const groups = groupCaptured(captured);
  for (const type of ['gwang', 'animal', 'ribbon', 'pi']) {
    if (!groups[type].length) continue;
    const row = document.createElement('div');
    row.className = 'cap-row';
    for (const c of groups[type]) {
      const mini = cardEl(c);
      mini.classList.add('mini');
      row.appendChild(mini);
    }
    el.appendChild(row);
  }
}

// ---------- 메인 렌더 ----------
function render() {
  const g = run.game;

  $('#round-label').textContent = `라운드 ${run.round} / ${run.targets.length}`;
  $('#target-label').textContent = `목표 ${g.target}점`;
  $('#gold-label').textContent = `${run.gold} G`;
  $('#seed-label').textContent = `시드 ${run.seed}`;
  $('#stock-label').textContent = `더미 ${g.stock.length}장`;

  const relicBar = $('#relic-bar');
  relicBar.innerHTML = '';
  for (const key of run.relics) {
    const r = Hanpan.RELICS.find(x => x.key === key);
    const chip = document.createElement('span');
    chip.className = 'relic-chip';
    chip.textContent = r.name;
    chip.title = r.desc;
    relicBar.appendChild(chip);
  }

  // 상대
  const aiHand = $('#ai-hand');
  aiHand.innerHTML = '';
  for (let i = 0; i < g.ai.hand.length; i++) aiHand.appendChild(cardBackEl());
  renderCapturedInto($('#ai-captured'), g.ai.captured);
  const aiScore = Hanpan.score(run, 'ai');
  $('#ai-score').textContent = `상대 ${aiScore.base}점`;

  // 바닥
  const floor = $('#floor');
  floor.innerHTML = '';
  const choosing = g.phase === 'choose';
  for (const c of g.floor) {
    const selectable = choosing && g.pendingChoice.options.includes(c.id);
    floor.appendChild(cardEl(c, {
      selectable,
      onclick: selectable ? () => {
        Hanpan.playerPlay(run, g.pendingChoice.cardId, c.id);
        advance();
      } : null,
    }));
  }
  $('#choose-hint').style.display = choosing ? 'block' : 'none';

  // 내 패
  renderCapturedInto($('#my-captured'), g.player.captured);
  const hand = $('#hand');
  hand.innerHTML = '';
  const myTurn = g.phase === 'player';
  for (const c of g.player.hand.slice().sort((a, b) => a.month - b.month || a.id - b.id)) {
    hand.appendChild(cardEl(c, {
      selectable: myTurn,
      onclick: myTurn ? () => {
        const r = Hanpan.playerPlay(run, c.id);
        if (r.needChoice) render(); else advance();
      } : null,
    }));
  }

  // 점수판
  const sc = Hanpan.score(run, 'player');
  const panel = $('#score-panel');
  const rows = sc.parts.map(p => `<div class="sc-row"><span>${p.label}</span><span>${p.pts}점</span></div>`);
  if (g.player.goCount) rows.push(`<div class="sc-row"><span>고</span><span>${g.player.goCount}회</span></div>`);
  for (const note of sc.multNotes) rows.push(`<div class="sc-row mult"><span>${note}</span><span></span></div>`);
  const ok = sc.final >= g.target;
  panel.innerHTML = `
    ${rows.join('') || '<div class="sc-row dim"><span>아직 족보 없음</span><span></span></div>'}
    <div class="sc-final ${ok ? 'ok' : ''}">${sc.final}점 / 목표 ${g.target}점</div>`;

  // 로그
  const log = $('#log');
  log.innerHTML = run.game.log.slice(-60).map(l => `<div>${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;

  $('#turn-label').textContent =
    g.phase === 'player' ? '내 차례 — 낼 카드를 고르세요'
    : g.phase === 'choose' ? '가져올 바닥 카드를 고르세요'
    : g.phase === 'ai' ? '상대 차례…'
    : g.phase === 'gostop' ? '고? 스톱?'
    : '라운드 종료';
}

// ---------- 진행 ----------
function advance() {
  render();
  const g = run.game;
  if (g.phase === 'ai') {
    setTimeout(() => { Hanpan.aiTurn(run); advance(); }, 650);
  } else if (g.phase === 'gostop') {
    showGoStop();
  } else if (g.phase === 'over') {
    const res = Hanpan.finishRound(run);
    render();
    showResult(res);
  }
}

// ---------- 오버레이 ----------
function overlay(html) {
  $('#overlay-content').innerHTML = html;
  $('#overlay').style.display = 'flex';
}
function hideOverlay() { $('#overlay').style.display = 'none'; }

function showGoStop() {
  const g = run.game;
  const sc = Hanpan.score(run, 'player');
  const stopOk = sc.final >= g.target;
  overlay(`
    <h2>${sc.base}점!</h2>
    <p>현재 최종 점수 <b>${sc.final}점</b> / 목표 <b>${g.target}점</b></p>
    <p class="dim">고: 계속해서 점수를 불린다 (상대가 먼저 7점을 내면 그대로 정산)<br>
       스톱: 지금 점수로 라운드를 끝낸다${stopOk ? '' : ' — <b class="bad">목표 미달이라 탈락!</b>'}</p>
    <div class="btn-row">
      <button id="btn-go">고!</button>
      <button id="btn-stop" class="${stopOk ? 'good' : 'danger'}">스톱</button>
    </div>`);
  $('#btn-go').onclick = () => { hideOverlay(); Hanpan.declareGo(run); advance(); };
  $('#btn-stop').onclick = () => { hideOverlay(); Hanpan.declareStop(run); advance(); };
}

function showResult(res) {
  const reasonText = { 'player-stop': '스톱 선언', 'ai-stop': '상대가 7점 스톱', 'exhausted': '나가리 (패 소진)' }[res.reason];
  const detail = res.score.parts.map(p => `<div class="sc-row"><span>${p.label}</span><span>${p.pts}점</span></div>`).join('');
  const mults = res.score.multNotes.map(n => `<div class="sc-row mult"><span>${n}</span><span></span></div>`).join('');
  if (res.pass && run.victory) {
    overlay(`
      <h2>🎓 졸업!</h2>
      <p>8라운드를 모두 클리어했습니다. 시드 ${run.seed}, 유물 ${run.relics.length}개.</p>
      <div class="btn-row"><button id="btn-new">새 런 시작</button></div>`);
    $('#btn-new').onclick = () => showStart();
  } else if (res.pass) {
    overlay(`
      <h2>라운드 ${run.round} 통과!</h2>
      <p class="dim">${reasonText}</p>
      ${detail}${mults}
      <div class="sc-final ok">${res.final}점 / 목표 ${res.target}점 → +${res.goldGained} G</div>
      <div class="btn-row"><button id="btn-shop">상점으로</button></div>`);
    $('#btn-shop').onclick = () => { shopOffers = Hanpan.shopOffers(run); showShop(); };
  } else {
    overlay(`
      <h2>💀 학사경고</h2>
      <p class="dim">${reasonText} — 라운드 ${run.round}에서 탈락</p>
      ${detail}${mults}
      <div class="sc-final bad">${res.final}점 / 목표 ${res.target}점</div>
      <div class="btn-row">
        <button id="btn-retry">같은 시드 재도전</button>
        <button id="btn-new">새 시드</button>
      </div>`);
    $('#btn-retry').onclick = () => { startRun(run.seed); };
    $('#btn-new').onclick = () => showStart();
  }
}

function showShop() {
  const items = shopOffers.map(r => {
    const afford = run.gold >= r.cost;
    return `
      <div class="shop-item">
        <div><b>${r.name}</b> <span class="cost">${r.cost} G</span></div>
        <div class="dim">${r.desc}</div>
        <button data-key="${r.key}" ${afford ? '' : 'disabled'}>구매</button>
      </div>`;
  }).join('') || '<p class="dim">살 수 있는 유물이 없습니다</p>';
  overlay(`
    <h2>유물 상점</h2>
    <p>보유 골드: <b>${run.gold} G</b></p>
    ${items}
    <div class="btn-row"><button id="btn-next">다음 라운드 (목표 ${run.targets[run.round]}점)</button></div>`);
  for (const btn of document.querySelectorAll('.shop-item button')) {
    btn.onclick = () => {
      if (Hanpan.buyRelic(run, btn.dataset.key)) {
        shopOffers = shopOffers.filter(r => r.key !== btn.dataset.key);
        showShop();
      }
    };
  }
  $('#btn-next').onclick = () => { hideOverlay(); Hanpan.nextRound(run); render(); };
}

function showStart() {
  const defaultSeed = Math.floor(Math.random() * 900000) + 100000;
  overlay(`
    <h2>한판만 더 <span class="dim" style="font-size:.55em">맞고 로그라이크</span></h2>
    <p class="dim" style="text-align:left">
      매 라운드 AI와 맞고 한 판. 족보 점수가 그대로 스코어 — <b>목표 점수를 넘기면 통과</b>, 못 넘기면 학사경고.<br><br>
      · 7점이 되면 고/스톱 선택. 고를 외칠수록 점수가 불어난다 (3고부터 ×2)<br>
      · 상대가 먼저 7점을 내면 그 시점 점수로 정산된다<br>
      · 라운드를 통과하면 점수만큼 골드 획득 → 상점에서 룰을 부수는 유물 구매<br>
      · 8라운드(목표 22점)를 넘기면 졸업
    </p>
    <div class="btn-row">
      <input id="seed-input" type="number" value="${defaultSeed}" />
      <button id="btn-start" class="good">시작</button>
    </div>`);
  $('#btn-start').onclick = () => startRun(parseInt($('#seed-input').value, 10) || defaultSeed);
}

function startRun(seed) {
  run = Hanpan.newRun(seed);
  Hanpan.startRound(run);
  hideOverlay();
  render();
}

showStart();
