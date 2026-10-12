'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Basit, dosya tabanlı kullanıcı deposu.
 * data/store.json içinde saklar; şifreler scrypt ile hash'lenir.
 *
 * Kullanıcı alanları:
 *   username, salt, hash, totalScore, gamesPlayed, bestRound,
 *   role ('user' | 'admin'), banned (bool), mutedUntil (ms), createdAt
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { users: {} };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.users) {
          this.data = parsed;
          // Eski kayıtlar için varsayılan alanlar
          for (const u of Object.values(this.data.users)) {
            u.role = u.role || 'user';
            u.banned = !!u.banned;
            u.mutedUntil = u.mutedUntil || 0;
            u.totalScore = u.totalScore || 0;
            u.gamesPlayed = u.gamesPlayed || 0;
            u.bestRound = u.bestRound || 0;
          }
        }
      }
    } catch (err) {
      console.error('[store] Dosya okunamadı, boş depo ile devam ediliyor:', err.message);
      this.data = { users: {} };
    }
  }

  _save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath); // atomik yazma
  }

  _hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  _key(username) {
    return String(username || '').toLocaleLowerCase('tr-TR');
  }

  get(username) {
    return this.data.users[this._key(username)] || null;
  }

  createUser(username, password, role = 'user') {
    const key = this._key(username);
    if (this.data.users[key]) {
      const existing = this.data.users[key];
      if (existing.banned) return { ok: false, error: 'Bu kullanıcı adı yasaklı.' };
      return { ok: false, error: 'Bu kullanıcı adı zaten kayıtlı.' };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    this.data.users[key] = {
      username,
      salt,
      hash: this._hashPassword(password, salt),
      totalScore: 0,
      gamesPlayed: 0,
      bestRound: 0,
      role,
      banned: false,
      mutedUntil: 0,
      createdAt: new Date().toISOString(),
    };
    this._save();
    return { ok: true, user: this.data.users[key] };
  }

  verifyUser(username, password) {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'Kullanıcı adı veya şifre hatalı.' };
    if (user.banned) return { ok: false, error: 'Bu hesap yönetici tarafından yasaklanmış.' };
    const hash = this._hashPassword(password, user.salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(user.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Kullanıcı adı veya şifre hatalı.' };
    }
    return { ok: true, user };
  }

  /** Yönetim: şifre sıfırlama (şifre unutan üye için). */
  setPassword(username, newPassword) {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'Kullanıcı bulunamadı.' };
    if (String(newPassword).length < 4) return { ok: false, error: 'Yeni şifre en az 4 karakter olmalı.' };
    user.salt = crypto.randomBytes(16).toString('hex');
    user.hash = this._hashPassword(newPassword, user.salt);
    this._save();
    return { ok: true };
  }

  /** Yönetim: kullanıcı adı arama (kullanıcı adını unutan üye için). */
  findUsers(term) {
    const t = this._key(term);
    return this.listUsers().filter((u) => !t || this._key(u.username).includes(t));
  }

  listUsers() {
    return Object.values(this.data.users)
      .map((u) => ({
        username: u.username,
        role: u.role,
        banned: !!u.banned,
        mutedUntil: u.mutedUntil || 0,
        totalScore: u.totalScore || 0,
        bestRound: u.bestRound || 0,
        gamesPlayed: u.gamesPlayed || 0,
        createdAt: u.createdAt,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, 'tr'));
  }

  /** Yönetim: yasakla / yasağı kaldır. */
  setBanned(username, banned) {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'Kullanıcı bulunamadı.' };
    if (user.role === 'admin') return { ok: false, error: 'Yönetici hesapları yasaklanamaz.' };
    user.banned = !!banned;
    this._save();
    return { ok: true, banned: !!banned };
  }

  /** Yönetim: geçici susturma (ms timestamp). */
  setMuted(username, untilMs) {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'Kullanıcı bulunamadı.' };
    if (user.role === 'admin') return { ok: false, error: 'Yöneticiler susturulamaz.' };
    user.mutedUntil = untilMs || 0;
    this._save();
    return { ok: true, mutedUntil: user.mutedUntil };
  }

  isMuted(username, now = Date.now()) {
    const user = this.get(username);
    return !!(user && user.mutedUntil && user.mutedUntil > now);
  }

  addScore(username, points, wonRound) {
    const user = this.get(username);
    if (!user) return null;
    user.totalScore = (user.totalScore || 0) + points;
    user.gamesPlayed = (user.gamesPlayed || 0) + (wonRound ? 1 : 0);
    if (typeof points === 'number' && points > (user.bestRound || 0)) {
      user.bestRound = points;
    }
    this._save();
    return user;
  }

  leaderboard(limit = 10) {
    return this.listUsers()
      .filter((u) => !u.banned)
      .map((u) => ({
        username: u.username,
        totalScore: u.totalScore,
        bestRound: u.bestRound,
        gamesPlayed: u.gamesPlayed,
      }))
      .sort((a, b) => b.totalScore - a.totalScore || b.bestRound - a.bestRound)
      .slice(0, limit);
  }

  /** İlk kurulumda tek bir yönetici hesabı oluşturur. */
  ensureAdmin(username, password) {
    const hasAdmin = Object.values(this.data.users).some((u) => u.role === 'admin' && !u.banned);
    if (hasAdmin) return { created: false };
    const existing = this.get(username);
    if (existing) {
      existing.role = 'admin';
      this._save();
      return { created: true, username: existing.username, reused: true };
    }
    const res = this.createUser(username, password, 'admin');
    return res.ok ? { created: true, username } : { created: false };
  }
}

module.exports = { Store };
