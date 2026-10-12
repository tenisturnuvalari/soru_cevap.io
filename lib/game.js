'use strict';

const { pickRoundQuestions, getDailyTheme } = require('./questions');
const { isCorrect, maskAnswer, letterCount } = require('./text');

const DEFAULTS = {
  questionSeconds: 60, // her soru için süre
  questionsPerRound: 10, // bir turdaki soru sayısı
  maxAttempts: 3, // soru başına cevap hakkı
  attemptPoints: [10, 7, 4], // 1., 2., 3. denemede doğru bilinen puan
  themeMultiplier: 2, // günün teması soruları bu katsayıyla puanlanır
  resultPauseMs: 4000, // cevap sonrası kısa gösterim
  teaserSeconds: 5, // "X. soru geliyor..." bekleme süresi
  // Süre azaldıkça harf açılma adımları: [kalan saniye, açılan harf oranı]
  revealSteps: [
    [45, 0.2],
    [35, 0.35],
    [25, 0.5],
    [15, 0.65],
    [8, 0.8],
  ],
};

const TEASER_LINES = [
  'Hazırsan geriye yaslan 🍿',
  'Bilgini konuşturma zamanı geliyor 💡',
  'Kemerini bağla, zorlu soru geliyor 🎢',
  'Klavyen hazır mı? Klavyene güveniyorsan 🎮',
  'Nefes al, ver... şimdi tam zamanı 🧘',
  'Bu soruyu bileceğini düşünüyoruz 👀',
];

class Game {
  /**
   * @param {{io: import('socket.io').Server, store: import('./store').Store, config?: object}} opts
   */
  constructor({ io, store, config }) {
    this.io = io;
    this.store = store;
    this.cfg = { ...DEFAULTS, ...(config || {}) };

    this.phase = 'lobby'; // lobby | question | result | teaser | round_end
    this.roundNumber = 0;
    this.questionIndex = 0;
    this.questions = [];
    this.current = null; // { q, a, cat, display, revealedCount, letters, isTheme }
    this.timeLeft = 0;
    this.attempts = new Map(); // username -> kullanılan deneme sayısı
    this.correctUsers = new Set(); // bu soruyu doğru bilenler
    this.roundScores = new Map(); // username -> tur puanı
    this.streaks = new Map(); // username -> üst üste doğru sayısı
    this.lastResult = null;
    this.lastQuestionText = null;
    this.teaser = null; // { number, secondsLeft, line }
    this.feed = [];
    this.timer = null;
    this.phaseTimer = null;
    this.gameStarter = null;

    this.theme = getDailyTheme(); // gün başlangıcında hesaplanır, gün içinde sabit
  }

  // ------------------------------------------------------------------ state

  /** Herkese gönderilen genel durum. */
  snapshot() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      questionIndex: this.questionIndex,
      questionsPerRound: this.cfg.questionsPerRound,
      questionSeconds: this.cfg.questionSeconds,
      maxAttempts: this.cfg.maxAttempts,
      attemptPoints: this.cfg.attemptPoints,
      theme: this.theme,
      themeMultiplier: this.cfg.themeMultiplier,
      roundScores: this.roundLeaderboard(),
      question:
        this.phase === 'question' && this.current
          ? {
              text: this.current.q,
              cat: this.current.cat,
              isTheme: !!this.current.isTheme,
              points: this.pointsForAttempt(0, this.current.isTheme),
              mask: maskAnswer(this.current.display, this.current.revealedCount),
              letters: this.current.letters,
              revealedCount: this.current.revealedCount,
              timeLeft: this.timeLeft,
            }
          : null,
      teaser: this.phase === 'teaser' ? this.teaser : null,
      lastResult: this.lastResult,
      feed: this.feed.slice(-30),
    };
  }

  /** Sadece bir oyuncuya özel durum (cevap hakkı gibi). */
  myState(username) {
    const used = this.attempts.get(username) || 0;
    return {
      attemptsLeft: Math.max(0, this.cfg.maxAttempts - used),
      answeredCorrect: this.correctUsers.has(username),
    };
  }

  roundLeaderboard() {
    return [...this.roundScores.entries()]
      .map(([username, score]) => ({ username, score }))
      .sort((a, b) => b.score - a.score);
  }

  broadcast() {
    this.io.emit('state', this.snapshot());
  }

  /** 0. deneme = ilk cevap hakkı; tema soruları katlı puan. */
  pointsForAttempt(attemptIndex, isTheme) {
    const base = this.cfg.attemptPoints[attemptIndex] ?? 0;
    return isTheme ? base * this.cfg.themeMultiplier : base;
  }

  // ------------------------------------------------------------------ akış

  start(byUser) {
    if (this.phase !== 'lobby' && this.phase !== 'round_end') return false;
    this._clearTimers();
    this.roundNumber += 1;
    this.questionIndex = 0;
    this.roundScores = new Map();
    this.streaks = new Map();
    this.theme = getDailyTheme();
    this.questions = pickRoundQuestions(this.cfg.questionsPerRound, this.lastQuestionText, this.theme);
    this.gameStarter = byUser;
    this._pushFeed(
      'bot',
      `Yeni tur başlıyor! ${this.cfg.questionsPerRound} soru, ${this.cfg.maxAttempts} cevap hakkın var. ` +
        `🌟 Günün teması "${this.theme}" — bu türden sorular ${this.cfg.themeMultiplier} kat puan!`
    );
    this._askNext();
    return true;
  }

  stop(byUser) {
    if (this.phase === 'lobby') return false;
    this._clearTimers();
    this.phase = 'lobby';
    this.current = null;
    this.teaser = null;
    this._pushFeed('bot', `Oyun ${byUser ? byUser + ' tarafından' : ''} durduruldu. Yeni tura hazırız!`);
    this.broadcast();
    return true;
  }

  answer(username, text) {
    if (this.phase !== 'question' || !this.current) {
      return { ok: false, reason: 'Şu an soru yok, birazdan tekrar dene!' };
    }
    if (this.correctUsers.has(username)) {
      return { ok: false, reason: 'Bu soruyu zaten bildin, sıradakini bekle!' };
    }
    const used = this.attempts.get(username) || 0;
    if (used >= this.cfg.maxAttempts) {
      return { ok: false, reason: 'Cevap hakkın kalmadı! ⛔ Bu soruyu pas geçiyorsun.' };
    }

    if (!isCorrect(text, this.current.a)) {
      const nextUsed = used + 1;
      this.attempts.set(username, nextUsed);
      const left = this.cfg.maxAttempts - nextUsed;
      if (left <= 0) {
        return { ok: false, reason: 'Son cevap hakkın da bitti! ⛔ Bu soru kapandı.' };
      }
      return { ok: false, reason: `Yanlış cevap! ❌ ${left} hakkın kaldı.`, attemptsLeft: left };
    }

    // 🏆 Doğru cevap
    const attemptIndex = used; // 0 = ilk deneme
    this.attempts.set(username, used + 1);
    this.correctUsers.add(username);

    const isTheme = !!this.current.isTheme;
    const points = this.pointsForAttempt(attemptIndex, isTheme);
    this.roundScores.set(username, (this.roundScores.get(username) || 0) + points);
    this.store.addScore(username, points, false); // kalıcı toplam puan

    const streak = (this.streaks.get(username) || 0) + 1;
    this.streaks.set(username, streak);

    const attemptLabel = `${attemptIndex + 1}. denemede`;
    const themeLabel = isTheme ? ` 🌟 ${this.cfg.themeMultiplier}x tema!` : '';
    this._pushFeed(
      'result',
      `🏆 Doğru cevap! ${username} +${points} puan (${attemptLabel}${themeLabel})${streak > 1 ? ` 🔥 ${streak} soru üst üste` : ''}`
    );
    this._pushFeed(
      'bot',
      `🤖 SoruBotu: Doğru cevap "${this.current.display}" — ${username} ${attemptLabel} bildi, +${points} puan!`
    );

    this._endQuestion(username, points);
    return { ok: true, points, attemptsLeft: this.cfg.maxAttempts - (used + 1) };
  }

  // ------------------------------------------------------------------ iç akış

  _askNext() {
    this.questionIndex += 1;
    if (this.questionIndex > this.cfg.questionsPerRound || !this.questions.length) {
      return this._endRound();
    }
    this.current = this.questions.shift();
    this.lastQuestionText = this.current.q;
    this.current.display = this.current.a[0];
    this.current.letters = letterCount(this.current.display);
    this.current.revealedCount = 0;
    this.current.isTheme = this.current.cat === this.theme;
    this.attempts = new Map();
    this.correctUsers = new Set();
    this.timeLeft = this.cfg.questionSeconds;
    this.phase = 'question';
    this.teaser = null;
    this.broadcast();
    this.timer = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    if (this.phase !== 'question') return;
    this.timeLeft -= 1;

    if (this.current) {
      for (const [at, ratio] of this.cfg.revealSteps) {
        if (this.timeLeft === at) {
          this.current.revealedCount = Math.min(
            this.current.letters,
            Math.round(this.current.letters * ratio)
          );
          this.io.emit('reveal', {
            mask: maskAnswer(this.current.display, this.current.revealedCount),
            revealedCount: this.current.revealedCount,
            letters: this.current.letters,
            timeLeft: this.timeLeft,
          });
        }
      }
    }

    this.io.emit('timer', { timeLeft: this.timeLeft, phase: this.phase });

    if (this.timeLeft <= 0) {
      this._endQuestion(null, 0);
    }
  }

  _endQuestion(winner, points) {
    if (this.phase !== 'question') return;
    this._clearTimers();
    this.phase = 'result';

    this.lastResult = {
      winner: winner || null,
      points: points || 0,
      answer: this.current ? this.current.display : '',
      question: this.current ? this.current.q : '',
      cat: this.current ? this.current.cat : '',
      isTheme: !!(this.current && this.current.isTheme),
    };

    if (!winner) {
      this._pushFeed('bot', `🤖 SoruBotu: Süre doldu! Doğru cevap "${this.current.display}" idi. Kimse bilemedi 😅`);
    }

    this.broadcast();

    this.phaseTimer = setTimeout(() => this._startTeaser(), this.cfg.resultPauseMs);
  }

  /** Sorular arası "X. soru geliyor" bekleme ekranı. */
  _startTeaser() {
    if (this.phase === 'round_end' || this.phase === 'lobby') return;
    const nextNumber = this.questionIndex + 1;
    if (nextNumber > this.cfg.questionsPerRound || this.questions.length === 0) {
      return this._endRound();
    }
    this.phase = 'teaser';
    this.teaser = {
      number: nextNumber,
      secondsLeft: this.cfg.teaserSeconds,
      line: TEASER_LINES[Math.floor(Math.random() * TEASER_LINES.length)],
    };
    this.broadcast();

    this.timer = setInterval(() => {
      if (this.phase !== 'teaser' || !this.teaser) return;
      this.teaser.secondsLeft -= 1;
      this.io.emit('timer', { timeLeft: this.teaser.secondsLeft, phase: 'teaser' });
      if (this.teaser.secondsLeft <= 0) {
        this._clearTimers();
        this._askNext();
      }
    }, 1000);
  }

  _endRound() {
    this._clearTimers();
    this.phase = 'round_end';
    this.current = null;
    this.teaser = null;

    const board = this.roundLeaderboard();
    if (board.length > 0) {
      const winner = board[0];
      this.store.addScore(winner.username, 0, true); // tur sayısını güncelle
      this._pushFeed('bot', `🤖 SoruBotu: Tur bitti! Birinci: ${winner.username} (${winner.score} puan) 👏`);
    } else {
      this._pushFeed('bot', '🤖 SoruBotu: Tur bitti, kimse puan toplayamadı.');
    }

    this.io.emit('round_end', {
      roundNumber: this.roundNumber,
      board,
      totalLeaderboard: this.store.leaderboard(10),
    });
    this.broadcast();
  }

  _clearTimers() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }

  _pushFeed(kind, text) {
    this.feed.push({ kind, text, at: Date.now() });
    if (this.feed.length > 60) this.feed = this.feed.slice(-60);
  }

  dispose() {
    this._clearTimers();
  }
}

module.exports = { Game, DEFAULTS };
