import {
  store, EMOTIONS,
  TAPS_PER_COIN, DAILY_GOAL, TOPIC_CREATION_PRICE, MAX_TOPIC_LEN,
} from './store.js';

/* ============== helpers ============== */

function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amt)) | 0;
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amt)) | 0;
  const b = Math.max(0, (n & 0xff) * (1 - amt)) | 0;
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function vibrate(ms) {
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch {}
}

export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

const SHARED_CSS = `
  :host { display: block; color: #e8e8ef; font-family: inherit; }
  * { box-sizing: border-box; }
  button { font-family: inherit; color: inherit; border: 0; background: none; cursor: pointer; }
`;

/* ============== BaseElement ============== */

class BaseElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._mounted = false;
    this._raf = null;
  }
  connectedCallback() {
    if (!this._mounted) {
      this.mount();
      this._mounted = true;
    }
    this._unsub = store.subscribe(() => this.scheduleSync());
    this.sync();
  }
  disconnectedCallback() {
    if (this._unsub) this._unsub();
  }
  scheduleSync() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.sync();
    });
  }
  mount() {}
  sync() {}
  $(s) { return this.shadowRoot.querySelector(s); }
  $$(s) { return this.shadowRoot.querySelectorAll(s); }
}

/* ============== <giant-emotion-button> ============== */

class GiantEmotionButton extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          --emo-color: #e0245e;
          --emo-dark: #a01a42;
          display: block;
          width: 280px;
          height: 280px;
          margin: 0 auto;
          position: relative;
        }
        .glow {
          position: absolute;
          inset: -24px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--emo-color)55 0%, transparent 65%);
          animation: pulse 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1);    opacity: .55; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        button {
          position: relative;
          width: 100%; height: 100%;
          border-radius: 50%;
          border: none;
          background: radial-gradient(circle at 32% 30%, var(--emo-color), var(--emo-dark));
          color: #fff;
          font-family: inherit;
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 1px;
          cursor: pointer;
          box-shadow:
            0 14px 32px var(--emo-color)55,
            inset 0 -10px 0 rgba(0,0,0,.18),
            inset 0 4px 0 rgba(255,255,255,.15);
          transition: transform .08s ease-out;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          touch-action: manipulation;
        }
        button:active { transform: scale(.92); }
        button.bounce { animation: bounce .22s ease-out; }
        @keyframes bounce {
          0%   { transform: scale(.92); }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .pop {
          position: absolute;
          pointer-events: none;
          font-weight: 800;
          font-size: 20px;
          color: #fff;
          text-shadow: 0 2px 8px rgba(0,0,0,.55);
          transform: translate(-50%, -50%);
          animation: pop .8s ease-out forwards;
          z-index: 5;
        }
        .pop.coin { font-size: 24px; }
        @keyframes pop {
          0%   { transform: translate(-50%, -50%) scale(.8);  opacity: 1; }
          100% { transform: translate(-50%, -180%) scale(1.15); opacity: 0; }
        }
      </style>
      <div class="glow"></div>
      <button part="button" aria-label="Тапнуть"></button>
    `;
    this._btn = this.$('button');
    this._btn.addEventListener('click', (e) => this.onTap(e));
  }

  sync() {
    const st = store.state;
    const emo = EMOTIONS[st.activeEmotion];
    if (!emo) return;
    this.style.setProperty('--emo-color', emo.hex);
    this.style.setProperty('--emo-dark', darken(emo.hex, 0.35));
    this._btn.textContent = st.activeEmotion;
    this._btn.setAttribute('aria-label', `Тапнуть эмоцией ${st.activeEmotion}`);
  }

  onTap(e) {
    const res = store.tap();
    // bounce
    this._btn.classList.remove('bounce');
    void this._btn.offsetWidth;
    this._btn.classList.add('bounce');
    // floating +1
    this.spawnPop(e, res.coinEarned ? '🪙 +1' : '+1', res.coinEarned);
    vibrate(res.coinEarned ? 30 : 5);
  }

  spawnPop(e, text, isCoin) {
    const rect = this._btn.getBoundingClientRect();
    const x = (e.clientX || rect.left + rect.width / 2) - rect.left;
    const y = (e.clientY || rect.top + rect.height / 2) - rect.top;
    const el = document.createElement('span');
    el.className = 'pop' + (isCoin ? ' coin' : '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this._btn.appendChild(el);
    setTimeout(() => el.remove(), 820);
  }
}

/* ============== <top-hud> ============== */

class TopHud extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          display: block;
          padding: 12px 16px;
          background: #0f0f18;
          border-bottom: 1px solid #1e1e2a;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .streak {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #fbbf24;
        }
        .streak .bar {
          width: 90px;
          height: 6px;
          background: #1e1e2a;
          border-radius: 3px;
          overflow: hidden;
        }
        .streak .bar > i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #fbbf24, #f97316);
          border-radius: 3px;
          transition: width .2s;
        }
        .streak small { font-size: 11px; color: #8a8aa3; font-weight: 500; }
        .wallet {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 800;
          color: #fbbf24;
          transition: transform .2s;
        }
        .wallet.bump { animation: bump .35s ease-out; }
        @keyframes bump {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .coin-ring {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: conic-gradient(#fbbf24 var(--p, 0%), #2a2a3a 0);
          display: grid; place-items: center;
          font-size: 16px;
        }
        .coin-ring > span {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: #0f0f18;
          display: grid; place-items: center;
          font-size: 12px;
        }
      </style>
      <div class="row">
        <div class="streak">
          <span>🔥</span>
          <div>
            <div class="bar"><i></i></div>
            <small class="label"></small>
          </div>
        </div>
        <div class="wallet">
          <div class="coin-ring"><span>🪙</span></div>
          <span class="coins">0</span>
        </div>
      </div>
    `;
    this._lastCoins = -1;
  }

  sync() {
    const st = store.state;
    const goal = Math.min(DAILY_GOAL, st.tapsToday + (st.tapsToday < DAILY_GOAL ? DAILY_GOAL - st.tapsToday : 0));
    const bar = this.$('.bar > i');
    bar.style.width = Math.min(100, (st.tapsToday / DAILY_GOAL) * 100) + '%';
    this.$('.label').textContent = `${st.tapsToday} / ${DAILY_GOAL}`;
    this.$('.coins').textContent = String(st.coins);
    this.$('.coin-ring').style.setProperty('--p', (st.tapProgress / TAPS_PER_COIN) * 100 + '%');

    const wallet = this.$('.wallet');
    if (this._lastCoins >= 0 && st.coins > this._lastCoins) {
      wallet.classList.remove('bump');
      void wallet.offsetWidth;
      wallet.classList.add('bump');
    }
    this._lastCoins = st.coins;
  }
}

/* ============== <tap-arena> ============== */

class TapArena extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 16px;
          gap: 16px;
        }
        .topic-chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 999px;
          background: #1a1a26;
          border: 1px solid #2a2a3a;
          font-size: 14px;
          font-weight: 700;
          color: #e8e8ef;
          transition: background .15s;
        }
        .topic-chip:active { background: #22223a; }
        .topic-chip .label { font-size: 10px; color: #8a8aa3; font-weight: 500; letter-spacing: .5px; }
        .topic-chip .rank {
          padding: 2px 8px;
          background: #e0245e33;
          color: #ff7aa1;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }
        .session {
          font-size: 15px;
          color: #8a8aa3;
          font-weight: 600;
          margin-top: 4px;
        }
        .session b { color: #fff; font-weight: 800; }
        .palette {
          margin-top: 4px;
          padding: 10px 18px;
          border-radius: 12px;
          background: #1a1a26;
          border: 1px solid #2a2a3a;
          font-size: 13px;
          font-weight: 700;
          color: #c8c8d8;
        }
        .palette:active { background: #22223a; }
      </style>
      <button class="topic-chip">
        <span class="label">ТЕМА</span>
        <span class="title">—</span>
        <span class="rank">#—</span>
        <span style="color:#8a8aa3">▾</span>
      </button>

      <giant-emotion-button></giant-emotion-button>

      <div class="session">За сессию: <b>+0</b></div>

      <button class="palette">🎨 Сменить эмоцию</button>
    `;

    this.$('.topic-chip').addEventListener('click', () => {
      store.openSheet('topic-picker');
    });
    this.$('.palette').addEventListener('click', () => {
      store.openSheet('emotion-shop');
    });
  }

  sync() {
    const st = store.state;
    const topic = store.getTopicByTitle(st.activeTopic);
    const rank = this.computeRank(topic, st.topics);
    this.$('.title').textContent = st.activeTopic;
    this.$('.rank').textContent = '#' + rank;
    this.$('.session b').textContent = '+' + st.sessionTaps;
  }

  computeRank(topic, topics) {
    if (!topic) return '—';
    const sorted = [...topics].sort((a, b) => store.totalVotes(b) - store.totalVotes(a));
    const idx = sorted.findIndex(t => t.id === topic.id);
    return idx >= 0 ? idx + 1 : '—';
  }
}

/* ============== <leaderboard-screen> ============== */

class LeaderboardScreen extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          display: block;
          padding: 16px;
        }
        .gate {
          padding: 14px 16px;
          background: #13131c;
          border: 1px solid #23232f;
          border-radius: 16px;
          margin-bottom: 14px;
        }
        .gate-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 700;
          color: #8a8aa3;
          margin-bottom: 8px;
        }
        .gate-head b { color: #fff; font-size: 13px; }
        .progress {
          height: 8px;
          background: #1e1e2a;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .progress > i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #f97316, #e0245e);
          border-radius: 4px;
          transition: width .3s;
        }
        .add-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: .3px;
          transition: opacity .15s;
        }
        .add-btn:disabled {
          background: #1e1e2a;
          color: #55556a;
          cursor: not-allowed;
        }
        .add-btn.ready {
          animation: glow 1.8s ease-in-out infinite;
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 0 0 #22c55e55; }
          50%      { box-shadow: 0 0 0 8px #22c55e00; }
        }
        .filters {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          margin-bottom: 12px;
          scrollbar-width: none;
        }
        .filters::-webkit-scrollbar { display: none; }
        .filter {
          flex: 0 0 auto;
          padding: 8px 14px;
          border-radius: 999px;
          background: #1a1a26;
          border: 1px solid #2a2a3a;
          font-size: 12px;
          font-weight: 700;
          color: #8a8aa3;
        }
        .filter.active {
          background: #fff;
          color: #0a0a0f;
          border-color: #fff;
        }
        .topic-card {
          background: #13131c;
          border: 1px solid #23232f;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 10px;
        }
        .topic-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 10px;
        }
        .topic-head .name {
          display: flex;
          gap: 10px;
          align-items: baseline;
          font-size: 17px;
          font-weight: 800;
          color: #fff;
        }
        .topic-head .name .rank {
          font-size: 13px;
          color: #55556a;
          font-weight: 700;
        }
        .topic-head .total {
          font-size: 13px;
          color: #8a8aa3;
          font-weight: 600;
        }
        .bar {
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          background: #1e1e2a;
          margin-bottom: 10px;
        }
        .bar > i {
          height: 100%;
          transition: width .3s;
        }
        .breakdown {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          font-size: 11px;
          color: #8a8aa3;
          margin-bottom: 10px;
        }
        .breakdown b { color: #c8c8d8; }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid;
          background: transparent;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .chip.owned { background: var(--chip-color, #e0245e); color: #fff; border-color: transparent; }
        .chip.locked { opacity: .55; border-style: dashed; }
        .chip small { opacity: .75; font-weight: 500; }
      </style>

      <div class="gate">
        <div class="gate-head">
          <span>Активность сегодня</span>
          <b class="gate-count">0 / 0</b>
        </div>
        <div class="progress"><i></i></div>
        <button class="add-btn">+ Добавить тему за 🪙20</button>
      </div>

      <div class="filters"></div>
      <div class="topic-list"></div>
    `;

    this.$('.add-btn').addEventListener('click', () => {
      const st = store.state;
      if (st.tapsToday < DAILY_GOAL) {
        toast(`Сделай ещё ${DAILY_GOAL - st.tapsToday} тапов сегодня`);
        return;
      }
      if (st.coins < TOPIC_CREATION_PRICE) {
        toast(`Не хватает 🪙${TOPIC_CREATION_PRICE - st.coins} — это ещё ${(TOPIC_CREATION_PRICE - st.coins) * TAPS_PER_COIN} тапов`);
        return;
      }
      store.openSheet('create-topic');
    });

    this.$('.filters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn) return;
      store.setTopicFilter(btn.dataset.filter);
    });

    this.$('.topic-list').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        this.onChipClick(chip);
        return;
      }
      const card = e.target.closest('.topic-card');
      if (card) {
        store.setActiveTopic(card.dataset.title);
        store.navigate('arena');
      }
    });
  }

  onChipClick(chip) {
    const verb = chip.dataset.verb;
    const topicTitle = chip.dataset.topic;
    if (chip.dataset.owned === 'true') {
      store.setActiveTopic(topicTitle);
      store.state.activeEmotion = verb;
      store.navigate('arena');
    } else {
      store.setActiveTopic(topicTitle);
      store.openSheet('emotion-shop');
    }
  }

  sync() {
    const st = store.state;
    if (st.activeTab !== 'leaderboard') return;

    // gate
    this.$('.gate-count').textContent = `${st.tapsToday} / ${DAILY_GOAL}`;
    this.$('.progress > i').style.width = Math.min(100, (st.tapsToday / DAILY_GOAL) * 100) + '%';
    const ready = st.tapsToday >= DAILY_GOAL && st.coins >= TOPIC_CREATION_PRICE;
    const btn = this.$('.add-btn');
    btn.disabled = !ready;
    btn.classList.toggle('ready', ready);

    // filters
    const filters = [
      { key: 'all', label: 'Все темы' },
      ...Object.keys(EMOTIONS).map(v => ({ key: v, label: `Топ «${v}»` })),
    ];
    this.$('.filters').innerHTML = filters.map(f =>
      `<button class="filter${st.topicFilter === f.key ? ' active' : ''}" data-filter="${esc(f.key)}">${esc(f.label)}</button>`
    ).join('');

    // sort topics
    const filter = st.topicFilter;
    const sorted = [...st.topics].sort((a, b) => {
      if (filter === 'all') return store.totalVotes(b) - store.totalVotes(a);
      return (b.votes[filter] || 0) - (a.votes[filter] || 0);
    });

    // list
    const html = sorted.map((topic, i) => {
      const total = store.totalVotes(topic);
      const breakdown = Object.entries(topic.votes)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

      const barHtml = breakdown.map(([verb, count]) => {
        const pct = total ? (count / total) * 100 : 0;
        const color = EMOTIONS[verb]?.hex || '#888';
        return `<i style="width:${pct}%;background:${color}"></i>`;
      }).join('');

      const breakdownHtml = breakdown.map(([verb, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `<span><b>${esc(verb)}</b> ${pct}%</span>`;
      }).join('');

      const chipsHtml = breakdown.map(([verb, count]) => {
        const owned = st.ownedEmotions.includes(verb);
        const color = EMOTIONS[verb]?.hex || '#888';
        const active = st.activeEmotion === verb && st.activeTopic === topic.title;
        return `
          <button class="chip ${owned ? 'owned' : 'locked'}"
                  data-verb="${esc(verb)}"
                  data-topic="${esc(topic.title)}"
                  data-owned="${owned}"
                  style="${owned ? `--chip-color:${color}` : `color:${color};border-color:${color}55`}">
            ${esc(verb)}
            <small>${fmt(count)}</small>
          </button>`;
      }).join('');

      return `
        <div class="topic-card" data-title="${esc(topic.title)}">
          <div class="topic-head">
            <div class="name"><span class="rank">#${i + 1}</span>${esc(topic.title)}</div>
            <div class="total">${fmt(total)} 👆</div>
          </div>
          <div class="bar">${barHtml}</div>
          <div class="breakdown">${breakdownHtml || '<span>— нет голосов —</span>'}</div>
          <div class="chips">${chipsHtml}</div>
        </div>`;
    }).join('');

    this.$('.topic-list').innerHTML = html || '<div style="color:#55556a;text-align:center;padding:40px">Тем пока нет</div>';
  }
}

/* ============== <tab-bar> ============== */

class TabBar extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          padding-bottom: env(safe-area-inset-bottom);
          background: #0f0f18;
          border-top: 1px solid #1e1e2a;
          z-index: 100;
        }
        .row { display: flex; }
        .tab {
          flex: 1;
          padding: 12px 0 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font-size: 11px;
          font-weight: 700;
          color: #55556a;
          position: relative;
          transition: color .15s;
        }
        .tab.active { color: #fff; }
        .tab .ico { font-size: 20px; }
      </style>
      <div class="row">
        <button class="tab" data-tab="arena"><span class="ico">👆</span>Тапать</button>
        <button class="tab" data-tab="leaderboard"><span class="ico">🏆</span>Рейтинг</button>
      </div>
    `;
    this.$('.row').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      store.navigate(tab.dataset.tab);
      vibrate(3);
    });
  }
  sync() {
    const active = store.state.activeTab;
    this.$$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === active));
  }
}

/* ============== <sheet-base> (abstract) ============== */

class SheetBase extends BaseElement {
  static sheetName = '';

  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          position: fixed;
          inset: 0;
          z-index: 500;
          pointer-events: none;
          display: block;
        }
        :host([open]) { pointer-events: auto; }
        .backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,.6);
          opacity: 0;
          transition: opacity .2s;
        }
        :host([open]) .backdrop { opacity: 1; }
        .sheet {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
          background: #0f0f18;
          border-radius: 20px 20px 0 0;
          border-top: 1px solid #2a2a3a;
          transform: translateY(100%);
          transition: transform .25s cubic-bezier(.22,1,.36,1);
          max-height: 85vh;
          overflow-y: auto;
        }
        :host([open]) .sheet { transform: translateY(0); }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .head h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          color: #fff;
        }
        .close {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: #1e1e2a;
          color: #8a8aa3;
          font-size: 18px;
          display: grid; place-items: center;
        }
      </style>
      <div class="backdrop"></div>
      <div class="sheet">
        <div class="head">
          <h2 class="title"></h2>
          <button class="close">✕</button>
        </div>
        <div class="content"></div>
      </div>
    `;
    this.$('.backdrop').addEventListener('click', () => store.closeSheet());
    this.$('.close').addEventListener('click', () => store.closeSheet());
  }

  sync() {
    const isOpen = store.state.openSheet === this.constructor.sheetName;
    this.toggleAttribute('open', isOpen);
    this.renderContent();
  }

  renderContent() {}
}

/* ============== <emotion-shop-sheet> ============== */

class EmotionShopSheet extends SheetBase {
  static sheetName = 'emotion-shop';

  mount() {
    super.mount();
    this.$('.title').textContent = 'Магазин эмоций';
    this.shadowRoot.querySelector('style').appendChild(document.createTextNode(`
      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      .card {
        padding: 14px;
        background: #13131c;
        border: 1px solid #23232f;
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        transition: border-color .15s, background .15s;
      }
      .card.equipped { border-color: var(--c, #e0245e); background: #1a1a26; }
      .card .verb {
        font-size: 18px;
        font-weight: 900;
        color: #fff;
        letter-spacing: .5px;
      }
      .card .status {
        font-size: 12px;
        font-weight: 700;
        color: #8a8aa3;
      }
      .card.equipped .status { color: var(--c, #e0245e); }
      .card .price { color: #fbbf24; }
      .card.locked .verb { color: #8a8aa3; }
      .card:active { transform: scale(.98); }
      .coin-hint {
        margin-top: 12px;
        text-align: center;
        font-size: 12px;
        color: #8a8aa3;
      }
    `));
  }

  renderContent() {
    const st = store.state;
    const content = this.$('.content');
    content.innerHTML = `
      <div class="grid">
        ${Object.entries(EMOTIONS).map(([verb, e]) => {
          const owned = st.ownedEmotions.includes(verb);
          const equipped = st.activeEmotion === verb;
          const cls = `card ${owned ? '' : 'locked'} ${equipped ? 'equipped' : ''}`;
          const status = equipped ? 'Надето' : owned ? 'Куплено' : `<span class="price">🪙 ${e.price}</span>`;
          return `
            <button class="${cls}" data-verb="${esc(verb)}" style="--c:${e.hex}">
              <span class="verb">${e.emoji} ${esc(verb)}</span>
              <span class="status">${status}</span>
            </button>`;
        }).join('')}
      </div>
      <div class="coin-hint">🪙 = 100 тапов</div>
    `;
    content.querySelectorAll('.card').forEach(btn => {
      btn.addEventListener('click', () => {
        const verb = btn.dataset.verb;
        const res = store.buyOrEquipEmotion(verb);
        if (res.ok) {
          vibrate(10);
          if (res.bought) toast(`Куплено: «${verb}»`);
          store.closeSheet();
        } else if (res.reason === 'funds') {
          const need = EMOTIONS[verb].price - store.state.coins;
          toast(`Нужно ещё 🪙${need} — это ещё ${need * TAPS_PER_COIN} тапов`);
        }
      });
    });
  }
}

/* ============== <topic-picker-sheet> ============== */

class TopicPickerSheet extends SheetBase {
  static sheetName = 'topic-picker';

  mount() {
    super.mount();
    this.$('.title').textContent = 'Выбор темы';
    this.shadowRoot.querySelector('style').appendChild(document.createTextNode(`
      .list { display: flex; flex-direction: column; gap: 8px; }
      .item {
        padding: 14px 16px;
        background: #13131c;
        border: 1px solid #23232f;
        border-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        text-align: left;
      }
      .item.active { border-color: #e0245e; background: #1a1a26; }
      .item .meta { font-size: 12px; color: #8a8aa3; font-weight: 500; }
    `));
  }

  renderContent() {
    const st = store.state;
    const sorted = [...st.topics].sort((a, b) => store.totalVotes(b) - store.totalVotes(a));
    this.$('.content').innerHTML = `
      <div class="list">
        ${sorted.map((t, i) => `
          <button class="item ${t.title === st.activeTopic ? 'active' : ''}" data-title="${esc(t.title)}">
            <span>#${i + 1} ${esc(t.title)}</span>
            <span class="meta">${fmt(store.totalVotes(t))} тапов</span>
          </button>
        `).join('')}
      </div>
    `;
    this.$('.content').querySelectorAll('.item').forEach(btn => {
      btn.addEventListener('click', () => {
        store.setActiveTopic(btn.dataset.title);
        store.closeSheet();
        vibrate(5);
      });
    });
  }
}

/* ============== <create-topic-sheet> ============== */

class CreateTopicSheet extends SheetBase {
  static sheetName = 'create-topic';

  mount() {
    super.mount();
    this.$('.title').textContent = 'Новая тема';
    this.shadowRoot.querySelector('style').appendChild(document.createTextNode(`
      .field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 14px;
      }
      .field label {
        font-size: 12px;
        color: #8a8aa3;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .5px;
      }
      input {
        width: 100%;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid #2a2a3a;
        background: #13131c;
        color: #fff;
        font-size: 16px;
        font-family: inherit;
        outline: none;
        transition: border-color .15s;
      }
      input:focus { border-color: #22c55e; }
      .meta {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #8a8aa3;
      }
      .hint {
        font-size: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #1a1a26;
        color: #8a8aa3;
        margin-bottom: 14px;
        line-height: 1.4;
      }
      .hint.error { background: #2a1016; color: #ff8fa3; }
      .submit {
        width: 100%;
        padding: 14px;
        border-radius: 12px;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: #fff;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: .3px;
        transition: opacity .15s;
      }
      .submit:disabled { opacity: .4; cursor: not-allowed; }
    `));
  }

  renderContent() {
    const st = store.state;
    const content = this.$('.content');
    if (content.querySelector('input')) return;

    content.innerHTML = `
      <div class="field">
        <label>Слово или фраза</label>
        <input type="text" maxlength="${MAX_TOPIC_LEN}" placeholder="Например: Понедельник" autocomplete="off">
        <div class="meta">
          <span>до ${MAX_TOPIC_LEN} символов</span>
          <span class="counter">0 / ${MAX_TOPIC_LEN}</span>
        </div>
      </div>
      <div class="hint">
        Стоимость: 🪙${TOPIC_CREATION_PRICE}. Доступно только при дневной норме ${DAILY_GOAL} тапов.
        Сейчас: ${st.tapsToday}/${DAILY_GOAL} тапов · 🪙${st.coins}.
      </div>
      <button class="submit" disabled>Создать тему</button>
    `;

    const input = content.querySelector('input');
    const counter = content.querySelector('.counter');
    const submit = content.querySelector('.submit');
    const hint = content.querySelector('.hint');

    const update = () => {
      counter.textContent = `${input.value.length} / ${MAX_TOPIC_LEN}`;
      submit.disabled = input.value.trim().length < 2;
    };
    input.addEventListener('input', update);

    submit.addEventListener('click', () => {
      const res = store.createTopic(input.value);
      if (res.ok) {
        toast(`Тема «${input.value.trim()}» добавлена!`);
        input.value = '';
        store.closeSheet();
        store.navigate('arena');
        return;
      }
      const msgs = {
        short: 'Минимум 2 символа',
        long: `Не больше ${MAX_TOPIC_LEN} символов`,
        duplicate: 'Такая тема уже есть в рейтинге',
        daily: `Нужно ${DAILY_GOAL} тапов сегодня`,
        funds: `Не хватает 🪙${TOPIC_CREATION_PRICE - store.state.coins}`,
      };
      hint.textContent = msgs[res.reason] || 'Не удалось создать тему';
      hint.classList.add('error');
    });

    setTimeout(() => input.focus(), 100);
  }
}

/* ============== <tap-app> ============== */

class TapApp extends BaseElement {
  mount() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CSS}
        :host {
          display: block;
          min-height: 100dvh;
          padding-bottom: calc(70px + env(safe-area-inset-bottom));
          background: #0a0a0f;
        }
        main { padding-top: 0; }
        [hidden] { display: none !important; }
      </style>
      <top-hud></top-hud>
      <main>
        <tap-arena></tap-arena>
        <leaderboard-screen hidden></leaderboard-screen>
      </main>
      <tab-bar></tab-bar>
      <emotion-shop-sheet></emotion-shop-sheet>
      <topic-picker-sheet></topic-picker-sheet>
      <create-topic-sheet></create-topic-sheet>
    `;
  }

  sync() {
    const st = store.state;
    this.$('tap-arena').hidden = st.activeTab !== 'arena';
    this.$('leaderboard-screen').hidden = st.activeTab !== 'leaderboard';
  }
}

/* ============== register ============== */

export function defineComponents() {
  if (customElements.get('giant-emotion-button')) return;
  customElements.define('giant-emotion-button', GiantEmotionButton);
  customElements.define('top-hud', TopHud);
  customElements.define('tap-arena', TapArena);
  customElements.define('leaderboard-screen', LeaderboardScreen);
  customElements.define('tab-bar', TabBar);
  customElements.define('emotion-shop-sheet', EmotionShopSheet);
  customElements.define('topic-picker-sheet', TopicPickerSheet);
  customElements.define('create-topic-sheet', CreateTopicSheet);
  customElements.define('tap-app', TapApp);
}