'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { Store } = require('./lib/store');
const { Game } = require('./lib/game');
const { QUESTIONS } = require('./lib/questions');
const { containsProfanity } = require('./lib/text');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin1234';
const CHAT_MIN_INTERVAL_MS = 1200; // sohbet spam koruması
const CHAT_MAX_LENGTH = 200;
const MUTE_MS = 5 * 60 * 1000; // "/api/admin/mute" süresi

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const store = new Store(path.join(__dirname, 'data', 'store.json'));
const game = new Game({ io, store });

// token -> { username, createdAt }
const sessions = new Map();

// Sohbet geçmişi (son 100 mesaj) ve moderasyon kaydı (son 100 olay)
const chatHistory = [];
const modLog = [];

function issueToken(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}

function sessionFromReq(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token ? sessions.get(token) : null;
}

function requireAdmin(req, res, next) {
  const session = sessionFromReq(req);
  const user = session && store.get(session.username);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli.' });
  }
  req.adminUser = user;
  next();
}

function logMod(action, target, detail) {
  modLog.push({ action, target, detail: detail || '', at: Date.now() });
  if (modLog.length > 100) modLog.splice(0, modLog.length - 100);
}

function disconnectUser(username, reason) {
  let count = 0;
  for (const s of io.sockets.sockets.values()) {
    if (s.data.username === username) {
      s.emit('kicked', { reason });
      s.disconnect(true);
      count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------- HTTP API

app.get('/api/config', (_req, res) => {
  res.json({
    questionSeconds: game.cfg.questionSeconds,
    questionsPerRound: game.cfg.questionsPerRound,
    maxAttempts: game.cfg.maxAttempts,
    attemptPoints: game.cfg.attemptPoints,
    themeMultiplier: game.cfg.themeMultiplier,
    theme: game.theme,
    questionBankSize: QUESTIONS.length,
  });
});

app.post('/api/register', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Kullanıcı adı 2-20 karakter olmalı.' });
  }
  if (!/^[\p{L}\p{N} _-]+$/u.test(username)) {
    return res.status(400).json({ error: 'Kullanıcı adında sadece harf, rakam, boşluk, _ ve - olabilir.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalı.' });
  }
  if (containsProfanity(username)) {
    return res.status(400).json({ error: 'Kullanıcı adı uygunsuz içerik içeremez.' });
  }
  const result = store.createUser(username, password);
  if (!result.ok) return res.status(409).json({ error: result.error });
  const token = issueToken(result.user.username);
  res.json({ token, username: result.user.username, role: result.user.role });
});

app.post('/api/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const result = store.verifyUser(username, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  const token = issueToken(result.user.username);
  res.json({ token, username: result.user.username, role: result.user.role });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json({ top: store.leaderboard(10) });
});

// ---------------------------------------------------- Yönetim API (admin)

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const term = String(req.query.q || '');
  res.json({ users: store.findUsers(term), now: Date.now() });
});

app.post('/api/admin/reset-password', requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const newPassword = String((req.body && req.body.password) || '');
  const result = store.setPassword(username, newPassword);
  if (!result.ok) return res.status(400).json({ error: result.error });
  logMod('Şifre sıfırlandı', username, `Yönetici: ${req.adminUser.username}`);
  res.json({ ok: true });
});

app.post('/api/admin/ban', requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const banned = req.body && req.body.banned !== false;
  const result = store.setBanned(username, banned);
  if (!result.ok) return res.status(400).json({ error: result.error });
  let kicked = 0;
  if (banned) {
    kicked = disconnectUser(username, 'Hesabın yönetici tarafından yasaklandı.');
    // Oturum tokenlarını da geçersiz kıl
    for (const [token, s] of sessions.entries()) {
      if (s.username === username) sessions.delete(token);
    }
  }
  logMod(banned ? 'Yasaklandı' : 'Yasağı kaldırıldı', username, `Yönetici: ${req.adminUser.username}`);
  res.json({ ok: true, banned: result.banned, kicked });
});

app.post('/api/admin/kick', requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const kicked = disconnectUser(username, 'Yönetici tarafından oyundan atıldın.');
  logMod('Oyundan atıldı', username, `Yönetici: ${req.adminUser.username}`);
  res.json({ ok: true, kicked });
});

app.post('/api/admin/mute', requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const muted = req.body && req.body.muted !== false;
  const until = muted ? Date.now() + MUTE_MS : 0;
  const result = store.setMuted(username, until);
  if (!result.ok) return res.status(400).json({ error: result.error });
  logMod(muted ? 'Susturuldu (5 dk)' : 'Susturması kaldırıldı', username, `Yönetici: ${req.adminUser.username}`);
  res.json({ ok: true, mutedUntil: result.mutedUntil });
});

app.get('/api/admin/modlog', requireAdmin, (_req, res) => {
  res.json({ log: modLog.slice(-50).reverse() });
});

// ----------------------------------------------------------- SOCKET.IO

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const session = token && sessions.get(token);
  if (!session) return next(new Error('yetki_yok'));
  const user = store.get(session.username);
  if (!user || user.banned) return next(new Error('yasak'));
  socket.data.username = user.username;
  socket.data.role = user.role;
  socket.data.lastChatAt = 0;
  next();
});

function onlineUsers() {
  const map = new Map();
  for (const s of io.sockets.sockets.values()) {
    const u = s.data.username;
    if (!u) continue;
    if (!map.has(u)) map.set(u, { username: u, role: s.data.role, sockets: 0 });
    map.get(u).sockets += 1;
  }
  return [...map.values()].map((u) => ({ username: u.username, role: u.role }));
}

function broadcastOnline() {
  io.emit('online', onlineUsers());
}

function broadcastChat() {
  io.emit('chat', chatHistory.slice(-50));
}

io.on('connection', (socket) => {
  const username = socket.data.username;
  broadcastOnline();

  socket.emit('state', game.snapshot());
  socket.emit('online', onlineUsers());
  socket.emit('leaderboard', { top: store.leaderboard(10) });
  socket.emit('chat', chatHistory.slice(-50));
  socket.emit('me', { username, role: socket.data.role, ...game.myState(username) });

  socket.on('start_game', () => {
    if (game.start(username)) {
      io.emit('leaderboard', { top: store.leaderboard(10) });
    }
  });

  socket.on('stop_game', () => {
    game.stop(username);
  });

  socket.on('answer', (text, cb) => {
    const result = game.answer(username, String(text || ''));
    // Cevap hakkı bilgisini sadece ilgili oyuncuya gönder
    socket.emit('my', game.myState(username));
    if (typeof cb === 'function') cb(result);
  });

  socket.on('chat', (text, cb) => {
    const msg = String(text || '').slice(0, CHAT_MAX_LENGTH).trim();
    if (!msg) return typeof cb === 'function' && cb({ ok: false, reason: 'Boş mesaj gönderilemez.' });

    if (store.isMuted(username)) {
      return typeof cb === 'function' && cb({ ok: false, reason: 'Sohbetten susturuldun, bir süre mesaj yazamazsın.' });
    }
    if (containsProfanity(msg)) {
      logMod('Küfür/argo engellendi', username, `Mesaj: ${msg.slice(0, 60)}`);
      // Yöneticiye canlı uyarı gönder
      for (const s of io.sockets.sockets.values()) {
        if (s.data.role === 'admin') {
          s.emit('mod_alert', { username, text: msg.slice(0, 60), at: Date.now() });
        }
      }
      return typeof cb === 'function' && cb({
        ok: false,
        reason: 'Mesajın uygunsuz içerik içerdiği için gönderilmedi. Tekrar ederse yöneticiler yasaklayabilir!',
      });
    }
    const now = Date.now();
    if (now - (socket.data.lastChatAt || 0) < CHAT_MIN_INTERVAL_MS) {
      return typeof cb === 'function' && cb({ ok: false, reason: 'Çok hızlı yazıyorsun, biraz yavaşla 🐢' });
    }

    socket.data.lastChatAt = now;
    chatHistory.push({ username, text: msg, at: now });
    if (chatHistory.length > 100) chatHistory.splice(0, chatHistory.length - 100);
    broadcastChat();
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('disconnect', () => {
    broadcastOnline();
  });
});

game.io = io;

// İlk açılışta yönetici hesabını oluştur
const adminSeed = store.ensureAdmin(ADMIN_USER, ADMIN_PASS);
if (adminSeed.created) {
  console.log(`👑 Yönetici hesabı oluşturuldu: kullanıcı="${adminSeed.username}" şifre="${ADMIN_PASS}"`);
  console.log('   (Değiştirmek için: ADMIN_USERNAME / ADMIN_PASSWORD ortam değişkenlerini kullanın)');
}

server.listen(PORT, () => {
  console.log(`🎲 Soru Yarışması çalışıyor: http://localhost:${PORT}`);
  console.log(`   Soru bankası: ${QUESTIONS.length} soru | Günün teması: 🌟 ${game.theme}`);
});

process.on('SIGINT', () => {
  game.dispose();
  server.close(() => process.exit(0));
});
