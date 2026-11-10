export const TAPS_PER_COIN = 100;
export const DAILY_GOAL = 500;
export const TOPIC_CREATION_PRICE = 20;
export const MAX_TOPIC_LEN = 18;

export const EMOTIONS = {
  'ДОСТАЛО': { hex: '#e0245e', price: 0,  emoji: '🔥' },
  'БЕСИТ':   { hex: '#f97316', price: 10, emoji: '⚡' },
  'ХОЧУ':    { hex: '#3b82f6', price: 10, emoji: '✨' },
  'ОБОЖАЮ':  { hex: '#ec4899', price: 25, emoji: '❤️' },
  'СПАСИТЕ': { hex: '#8b5cf6', price: 25, emoji: '💨' },
  'КРИНЖ':   { hex: '#14b8a6', price: 25, emoji: '〰️' },
};

const STORAGE_KEY = 'sliker.state.v1';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState() {
  return {
    coins: 0,
    tapProgress: 0,
    tapsToday: 0,
    lastResetDate: today(),
    streak: 0,
    activeTopic: 'Учёба',
    activeEmotion: 'ДОСТАЛО',
    ownedEmotions: ['ДОСТАЛО'],
    activeTab: 'arena',
    openSheet: null,
    topicFilter: 'all',
    sessionTaps: 0,
    topics: [
      { id: 't1', title: 'Учёба',       votes: { 'ДОСТАЛО': 10147, 'БЕСИТ': 5535, 'ОБОЖАЮ': 2768 } },
      { id: 't2', title: 'Работа',      votes: { 'ДОСТАЛО': 8420,  'БЕСИТ': 7210, 'ХОЧУ': 1200 } },
      { id: 't3', title: 'Понедельник', votes: { 'ДОСТАЛО': 6200,  'БЕСИТ': 4800, 'СПАСИТЕ': 2100 } },
      { id: 't4', title: 'Пятница',     votes: { 'ОБОЖАЮ': 5100,   'ХОЧУ': 3800,  'ДОСТАЛО': 900 } },
    ],
  };
}

class Store {
  constructor() {
    this.state = this._load();
    this.listeners = new Set();
    this.checkDailyReset();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultState(), ...parsed };
      }
    } catch {}
    return defaultState();
  }

  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch {}
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this._save();
    for (const fn of this.listeners) fn(this.state);
  }

  checkDailyReset() {
    const t = today();
    if (this.state.lastResetDate !== t) {
      if (this.state.tapsToday >= DAILY_GOAL) {
        this.state.streak += 1;
      } else {
        this.state.streak = 0;
      }
      this.state.tapsToday = 0;
      this.state.sessionTaps = 0;
      this.state.lastResetDate = t;
      this._save();
      return true;
    }
    return false;
  }

  tap() {
    this.checkDailyReset();
    const { activeTopic, activeEmotion } = this.state;
    const topic = this.state.topics.find(t => t.title === activeTopic);
    if (!topic) return { coinEarned: false };
    topic.votes[activeEmotion] = (topic.votes[activeEmotion] || 0) + 1;
    this.state.tapsToday += 1;
    this.state.sessionTaps += 1;
    this.state.tapProgress += 1;
    let coinEarned = false;
    if (this.state.tapProgress >= TAPS_PER_COIN) {
      this.state.tapProgress -= TAPS_PER_COIN;
      this.state.coins += 1;
      coinEarned = true;
    }
    this._emit();
    return { coinEarned };
  }

  buyOrEquipEmotion(verb) {
    const e = EMOTIONS[verb];
    if (!e) return { ok: false, reason: 'unknown' };
    if (this.state.ownedEmotions.includes(verb)) {
      this.state.activeEmotion = verb;
      this._emit();
      return { ok: true, equipped: true };
    }
    if (this.state.coins < e.price) {
      return { ok: false, reason: 'funds' };
    }
    this.state.coins -= e.price;
    this.state.ownedEmotions.push(verb);
    this.state.activeEmotion = verb;
    this._emit();
    return { ok: true, bought: true };
  }

  setActiveTopic(title) {
    if (!this.state.topics.some(t => t.title === title)) return false;
    this.state.activeTopic = title;
    this._emit();
    return true;
  }

  navigate(tab) {
    this.state.activeTab = tab;
    this._emit();
  }

  openSheet(name) {
    this.state.openSheet = name;
    this._emit();
  }

  closeSheet() {
    this.state.openSheet = null;
    this._emit();
  }

  setTopicFilter(filter) {
    this.state.topicFilter = filter;
    this._emit();
  }

  canCreateTopic() {
    return this.state.tapsToday >= DAILY_GOAL
        && this.state.coins >= TOPIC_CREATION_PRICE;
  }

  createTopic(rawTitle) {
    const title = (rawTitle || '').trim();
    if (title.length < 2) return { ok: false, reason: 'short' };
    if (title.length > MAX_TOPIC_LEN) return { ok: false, reason: 'long' };
    if (this.state.topics.some(t => t.title.toLowerCase() === title.toLowerCase())) {
      return { ok: false, reason: 'duplicate' };
    }
    if (!this.canCreateTopic()) {
      if (this.state.tapsToday < DAILY_GOAL) return { ok: false, reason: 'daily' };
      return { ok: false, reason: 'funds' };
    }
    this.state.topics.push({ id: 't' + Date.now(), title, votes: {} });
    this.state.coins -= TOPIC_CREATION_PRICE;
    this.state.activeTopic = title;
    this._emit();
    return { ok: true };
  }

  getTopicByTitle(title) {
    return this.state.topics.find(t => t.title === title);
  }

  totalVotes(topic) {
    return Object.values(topic.votes).reduce((a, b) => a + b, 0);
  }
}

export const store = new Store();