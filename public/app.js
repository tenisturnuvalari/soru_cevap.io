'use strict';

/* ==================== Durum ==================== */
const state = {
  token: localStorage.getItem('sy_token') || null,
  username: localStorage.getItem('sy_user') || null,
  role: localStorage.getItem('sy_role') || 'user',
  sound: localStorage.getItem('sy_sound') !== 'off',
  config: null,
  server: null,
  lastPhase: null,
  timerValue: 60,
  attemptsLeft: 3,
  answeredCorrect: false,
};

const $ = (id) => document.getElementById(id);

/* ==================== Ses ==================== */
let audioCtx = null;
function beep(freq = 660, dur = 0.12, type = 'sine', vol = 0.05) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.stop(audioCtx.currentTime + dur);
  } catch (_) { /* ses desteklenmiyor olabilir */ }
}
const sounds = {
  question: () => { beep(523, .1); setTimeout(() => beep(659, .1), 110); },
  reveal: () => beep(880, .07, 'triangle', .03),
  correct: () => { beep(660, .1); setTimeout(() => beep(880, .12), 110); setTimeout(() => beep(1175, .18), 240); },
  teaser: () => beep(440, .12, 'triangle', .04),
  tick: () => beep(1000, .03, 'square', .015),
  win: () => { beep(523, .12); setTimeout(() => beep(659, .12), 130); setTimeout(() => beep(784, .2), 260); },
  alert: () => { beep(740, .08); setTimeout(() => beep(740, .08), 160); },
};

/* ==================== Giriş / Kayıt ==================== */
let mode = 'login';
function setMode(m) {
  mode = m;
  $('tabLogin').classList.toggle('active', m === 'login');
  $('tabRegister').classList.toggle('active', m === 'register');
  $('authSubmit').textContent = m === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  $('authError').textContent = '';
}
$('tabLogin').onclick = () => setMode('login');
$('tabRegister').onclick = () => setMode('register');

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('username').value.trim();
  const password = $('password').value;
  $('authError').textContent = '';
  try {
    const res = await fetch(`/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
    state.token = data.token;
    state.username = data.username;
    state.role = data.role || 'user';
    localStorage.setItem('sy_token', data.token);
    localStorage.setItem('sy_user', data.username);
    localStorage.setItem('sy_role', state.role);
    enterGame();
  } catch (err) {
    $('authError').textContent = err.message;
  }
});

$('logoutBtn').onclick = () => {
  localStorage.removeItem('sy_token');
  localStorage.removeItem('sy_user');
  localStorage.removeItem('sy_role');
  location.reload();
};

$('soundToggle').onclick = () => {
  state.sound = !state.sound;
  localStorage.setItem('sy_sound', state.sound ? 'on' : 'off');
  $('soundToggle').textContent = state.sound ? '🔊' : '🔇';
};

/* ==================== Socket ==================== */
let socket = null;

function connectSocket() {
  socket = io({ auth: { token: state.token } });

  socket.on('connect_error', (err) => {
    if (String(err.message).includes('yetki') || String(err.message).includes('yasak')) {
      alert('Oturumun geçersiz veya hesabın yasaklı. Yeniden giriş yapmalısın.');
      localStorage.removeItem('sy_token');
      localStorage.removeItem('sy_user');
      localStorage.removeItem('sy_role');
      location.reload();
    }
  });

  socket.on('state', (srv) => onState(srv));

  socket.on('timer', ({ timeLeft, phase }) => {
    state.timerValue = timeLeft;
    if (phase === 'teaser') {
      $('teaserCount').textContent = timeLeft;
    } else {
      renderTimer();
    }
    if (timeLeft <= 10 && timeLeft > 0 && phase === 'question') sounds.tick();
  });

  socket.on('reveal', ({ mask, revealedCount, letters }) => {
    renderMask(mask, revealedCount, letters);
    $('answerHint').textContent = `İpucu: karakterler açılıyor! (${revealedCount}/${letters})`;
    $('answerHint').className = 'hint';
    sounds.reveal();
  });

  socket.on('my', (me) => {
    state.attemptsLeft = me.attemptsLeft;
    state.answeredCorrect = me.answeredCorrect;
    renderAttempts();
  });

  socket.on('me', (me) => {
    state.role = me.role || state.role;
    state.attemptsLeft = me.attemptsLeft ?? state.attemptsLeft;
    state.answeredCorrect = !!me.answeredCorrect;
    $('adminBtn').classList.toggle('hidden', state.role !== 'admin');
    renderAttempts();
  });

  socket.on('online', (users) => {
    $('onlineCount').textContent = users.length;
    $('onlineList').innerHTML = users
      .map((u) => `<li>${u.role === 'admin' ? '👑' : '⚪'} ${escapeHtml(u.username)}${u.username === state.username ? ' (sen)' : ''}</li>`)
      .join('');
  });

  socket.on('leaderboard', ({ top }) => renderGlobalBoard(top));

  socket.on('round_end', ({ board }) => {
    sounds.win();
    showRoundModal(board);
  });

  socket.on('chat', (msgs) => renderChat(msgs));

  socket.on('kicked', ({ reason }) => {
    alert(reason || 'Oyundan atıldın.');
    socket.disconnect();
  });

  socket.on('mod_alert', ({ username, text }) => {
    if (state.role !== 'admin') return;
    sounds.alert();
    toast(`⚠️ ${username} uygunsuz mesaj yazdı: "${text}"`);
    if (!$('adminModal').classList.contains('hidden')) loadAdminUsers();
  });
};

/* ==================== Durum yönetimi ==================== */
function onState(srv) {
  const prevPhase = state.lastPhase;
  state.server = srv;
  state.lastPhase = srv.phase;

  if (srv.phase !== prevPhase) {
    if (srv.phase === 'question') sounds.question();
    if (srv.phase === 'teaser') sounds.teaser();
    if (srv.phase === 'round_end' && prevPhase === 'result') sounds.win();
  }

  $('lobbyPanel').classList.toggle('hidden', srv.phase !== 'lobby');
  $('questionPanel').classList.toggle('hidden', srv.phase !== 'question');
  $('teaserPanel').classList.toggle('hidden', srv.phase !== 'teaser');
  $('roundPanel').classList.toggle('hidden', srv.phase !== 'round_end');
  $('startBtn').classList.toggle('hidden', srv.phase !== 'lobby');
  $('stopBtn').classList.toggle('hidden', srv.phase === 'lobby');

  // Günün teması
  $('themeName').textContent = srv.theme;
  $('themeMul').textContent = `· ${srv.themeMultiplier}x puan`;

  if (srv.phase === 'lobby') {
    $('lobbyStatus').textContent = 'Oyunun başlaması bekleniyor… Bir oyuncu başlattığında herkes aynı anda görür.';
  }

  // Teaser
  if (srv.phase === 'teaser' && srv.teaser) {
    $('teaserNum').textContent = `${srv.teaser.number}. soru geliyor!`;
    $('teaserLine').textContent = srv.teaser.line;
    $('teaserCount').textContent = srv.teaser.secondsLeft;
  }

  // Tur sonu
  if (srv.phase === 'round_end') {
    renderPodium($('podium'), srv.roundScores);
  }

  // Soru
  if (srv.phase === 'question' && srv.question) {
    if (prevPhase !== 'question') {
      state.attemptsLeft = srv.maxAttempts;
      state.answeredCorrect = false;
    }
    $('qCounter').textContent = `SORU ${srv.questionIndex}/${srv.questionsPerRound}`;
    $('qCat').textContent = srv.question.cat;
    $('qThemeMul').classList.toggle('hidden', !srv.question.isTheme);
    $('questionText').textContent = srv.question.text;
    renderMask(srv.question.mask, srv.question.revealedCount, srv.question.letters);
    state.timerValue = srv.question.timeLeft;
    renderTimer();
    renderAttempts();
    $('answerHint').textContent = '';
    $('answerHint').className = 'hint';
    const input = $('answerInput');
    if (document.activeElement !== input) input.value = '';
    updateAnswerEnabled();
  }

  // Sonuç gösterimi
  if (srv.lastResult && srv.phase === 'result') {
    const r = srv.lastResult;
    $('questionText').textContent = r.question;
    $('qCat').textContent = r.cat;
    $('qThemeMul').classList.toggle('hidden', !r.isTheme);
    renderMask(r.answer.split('').join(''), 999, 999);
    $('qCounter').textContent = r.winner ? `🏆 ${r.winner} +${r.points}` : '⏱️ SÜRE DOLDU';
  }

  renderRoundBoard(srv.roundScores);
  renderFeed(srv.feed);

  $('startBtn').disabled = false;
  $('startBtn').textContent = '▶️ Oyuna Başla';
}

/* ==================== Render ==================== */
function renderTimer() {
  const total = (state.config && state.config.questionSeconds) || 60;
  const t = Math.max(0, state.timerValue);
  const bar = $('timerBar');
  bar.style.width = (t / total) * 100 + '%';
  bar.classList.toggle('warn', t <= 30 && t > 10);
  bar.classList.toggle('danger', t <= 10);
  $('timerText').innerHTML = `<b>${t}</b> sn`;
}

function renderAttempts() {
  const el = $('qAttempts');
  if (!el) return;
  const left = state.attemptsLeft;
  el.textContent = state.answeredCorrect
    ? '✅ BİLDİN'
    : left > 0 ? `🎯 ${left} HAKKIN VAR` : '⛔ HAKKIN BİTTİ';
  el.classList.toggle('low', left === 1 && !state.answeredCorrect);
  el.classList.toggle('none', left <= 0 && !state.answeredCorrect);
  updateAnswerEnabled();
}

function updateAnswerEnabled() {
  const input = $('answerInput');
  const btn = $('answerForm').querySelector('button');
  const disabled = state.attemptsLeft <= 0 || state.answeredCorrect || state.lastPhase !== 'question';
  input.disabled = disabled;
  btn.disabled = disabled;
  input.placeholder = state.answeredCorrect
    ? 'Bildin! Sıradaki soruyu bekle…'
    : state.attemptsLeft <= 0
      ? 'Cevap hakkın kalmadı…'
      : 'Cevabını yaz ve Enter\'a bas…';
}

/** Wordle tarzı karolar: her karakter bir karo, boşluklar boşluk bırakır. */
function renderMask(maskStr) {
  const el = $('mask');
  if (!maskStr) { el.innerHTML = ''; return; }
  el.innerHTML = maskStr
    .split('')
    .map((ch) => {
      if (ch === ' ') return '<span class="tile gap"></span>';
      if (ch === '■') return '<span class="tile closed"></span>';
      return `<span class="tile">${escapeHtml(ch)}</span>`;
    })
    .join('');
}

function renderRoundBoard(board) {
  const ul = $('roundBoard');
  if (!board || !board.length) {
    ul.innerHTML = '<li class="muted">Henüz puan yok</li>';
    return;
  }
  ul.innerHTML = board
    .map(
      (r, i) =>
        `<li class="${r.username === state.username ? 'me' : ''}"><span>${i + 1}. ${escapeHtml(r.username)}</span><span class="pts">${r.score}</span></li>`
    )
    .join('');
}

function renderGlobalBoard(top) {
  const ul = $('globalBoard');
  if (!top || !top.length) {
    ul.innerHTML = '<li class="muted">İlk sıralamada sen ol!</li>';
    return;
  }
  ul.innerHTML = top
    .map(
      (r, i) =>
        `<li class="${r.username === state.username ? 'me' : ''}"><span>${i + 1}. ${escapeHtml(r.username)}</span><span class="pts">${r.totalScore}</span></li>`
    )
    .join('');
  const mine = top.find((r) => r.username === state.username);
  if (mine) $('meScore').textContent = mine.totalScore;
}

function renderFeed(feed) {
  const el = $('feed');
  if (!feed) return;
  el.innerHTML = feed.map((m) => `<div class="msg ${m.kind}">${escapeHtml(m.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

/* ---------------- Sohbet ---------------- */
const adminNames = new Set();
function renderChat(msgs) {
  const el = $('chatList');
  if (!msgs) return;
  el.innerHTML = msgs
    .map((m) => {
      const mine = m.username === state.username;
      const cls = mine ? 'me' : '';
      const t = new Date(m.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return `<div class="chat-msg"><span class="who ${cls}">${escapeHtml(m.username)}</span><span class="time">${t}</span><div>${escapeHtml(m.text)}</div></div>`;
    })
    .join('');
  el.scrollTop = el.scrollHeight;
}

$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat', text, (res) => {
    const hint = $('chatHint');
    if (res && res.ok) {
      hint.textContent = '';
    } else {
      hint.textContent = '⚠️ ' + (res && res.reason ? res.reason : 'Mesaj gönderilemedi.');
      hint.className = 'hint bad';
      setTimeout(() => { hint.textContent = ''; }, 4000);
    }
  });
  input.value = '';
});

$('chatToggle').onclick = () => {
  const strip = $('chatStrip');
  strip.classList.toggle('collapsed');
  $('chatToggle').textContent = strip.classList.contains('collapsed') ? '▴' : '▾';
};

/* ---------------- Podium & Modal ---------------- */
function renderPodium(el, board) {
  if (!board || !board.length) {
    el.innerHTML = '<p class="muted">Kimse puan toplayamadı.</p>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const heights = [110, 80, 56];
  const top3 = board.slice(0, 3);
  const order = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i);
  el.innerHTML = order
    .map((idx) => {
      const r = top3[idx];
      if (!r) return '';
      return `<div class="step">
        <div class="medal">${medals[idx] || '🎖️'}</div>
        <div class="name">${escapeHtml(r.username)}</div>
        <div class="score">${r.score} puan</div>
        <div class="bar" style="height:${heights[idx]}px;width:70px">${idx + 1}</div>
      </div>`;
    })
    .join('');
}

function showRoundModal(board) {
  renderPodium($('modalBoard'), board);
  $('modal').classList.remove('hidden');
}
$('modalClose').onclick = () => $('modal').classList.add('hidden');

/* ==================== Yönetim paneli ==================== */
$('adminBtn').onclick = () => {
  $('adminModal').classList.remove('hidden');
  loadAdminUsers();
  loadModLog();
};
$('adminClose').onclick = () => $('adminModal').classList.add('hidden');
$('adminSearchBtn').onclick = () => loadAdminUsers();
$('adminSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadAdminUsers(); });

async function adminApi(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
  return data;
}

async function loadAdminUsers() {
  try {
    const q = encodeURIComponent($('adminSearch').value.trim());
    const data = await adminApi(`/api/admin/users?q=${q}`);
    renderAdminTable(data.users, data.now);
  } catch (err) {
    toast('⚠️ ' + err.message);
  }
}

async function loadModLog() {
  try {
    const data = await adminApi('/api/admin/modlog');
    const el = $('modLog');
    if (!data.log || !data.log.length) {
      el.innerHTML = '<p class="muted">Kayıt yok.</p>';
      return;
    }
    el.innerHTML = data.log
      .map((l) => {
        const t = new Date(l.at).toLocaleString('tr-TR');
        return `<div class="msg"><b>${escapeHtml(l.action)}</b> — ${escapeHtml(l.target)} <span class="time">(${t})</span><div class="muted">${escapeHtml(l.detail || '')}</div></div>`;
      })
      .join('');
  } catch (err) {
    toast('⚠️ ' + err.message);
  }
}

function renderAdminTable(users, now) {
  const tbody = $('adminTable').querySelector('tbody');
  tbody.innerHTML = users
    .map((u) => {
      const muted = u.mutedUntil > now;
      const status = u.banned
        ? '<span class="st-banned">🚫 Yasaklı</span>'
        : muted
          ? '<span class="st-muted">🔇 Susturuldu</span>'
          : '<span class="st-ok">● Aktif</span>';
      const isAdmin = u.role === 'admin';
      const actions = isAdmin
        ? '<span class="muted">—</span>'
        : `<div class="row-actions">
            <button class="mini-btn" data-act="reset" data-u="${escapeHtml(u.username)}">🔑 Şifre Sıfırla</button>
            <button class="mini-btn danger" data-act="kick" data-u="${escapeHtml(u.username)}">🚪 At</button>
            ${muted
              ? `<button class="mini-btn ok" data-act="unmute" data-u="${escapeHtml(u.username)}">🔊 Susturmayı Kaldır</button>`
              : `<button class="mini-btn" data-act="mute" data-u="${escapeHtml(u.username)}">🔇 Sustur (5dk)</button>`}
            ${u.banned
              ? `<button class="mini-btn ok" data-act="unban" data-u="${escapeHtml(u.username)}">✅ Yasağı Kaldır</button>`
              : `<button class="mini-btn danger" data-act="ban" data-u="${escapeHtml(u.username)}">☠️ Yasakla</button>`}
          </div>`;
      return `<tr>
        <td>${escapeHtml(u.username)}${isAdmin ? ' 👑' : ''}</td>
        <td>${u.totalScore}</td>
        <td>${status}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');
}

$('adminTable').addEventListener('click', async (e) => {
  const btn = e.target.closest('.mini-btn');
  if (!btn) return;
  const act = btn.dataset.act;
  const u = btn.dataset.u;
  try {
    if (act === 'reset') {
      const newPass = prompt(`"${u}" için yeni şifre gir (en az 4 karakter):`);
      if (!newPass) return;
      await adminApi('/api/admin/reset-password', { username: u, password: newPass });
      toast(`🔑 ${u} şifresi sıfırlandı.`);
    } else if (act === 'kick') {
      if (!confirm(`"${u}" oyundan atılsın mı?`)) return;
      const r = await adminApi('/api/admin/kick', { username: u });
      toast(`🚪 ${u} oyundan atıldı (${r.kicked} oturum).`);
    } else if (act === 'mute') {
      await adminApi('/api/admin/mute', { username: u, muted: true });
      toast(`🔇 ${u} 5 dakika susturuldu.`);
    } else if (act === 'unmute') {
      await adminApi('/api/admin/mute', { username: u, muted: false });
      toast(`🔊 ${u} susturması kaldırıldı.`);
    } else if (act === 'ban') {
      if (!confirm(`"${u}" kalıcı olarak yasaklansın mı? Çıkış yapması sağlanır.`)) return;
      const r = await adminApi('/api/admin/ban', { username: u, banned: true });
      toast(`☠️ ${u} yasaklandı (${r.kicked} oturum kapatıldı).`);
    } else if (act === 'unban') {
      await adminApi('/api/admin/ban', { username: u, banned: false });
      toast(`✅ ${u} yasağı kaldırıldı.`);
    }
    loadAdminUsers();
    loadModLog();
  } catch (err) {
    toast('⚠️ ' + err.message);
  }
});

/* ---------------- Bildirim (toast) ---------------- */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toastBox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastBox';
    el.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#141d33;border:1px solid #1f2b47;color:#fff;padding:11px 18px;border-radius:12px;z-index:99;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

/* ==================== Eylemler ==================== */
$('startBtn').onclick = () => {
  $('startBtn').disabled = true;
  $('startBtn').textContent = '⏳ Başlatılıyor…';
  socket.emit('start_game');
};
$('stopBtn').onclick = () => socket.emit('stop_game');
$('againBtn').onclick = () => socket.emit('start_game');

$('answerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('answerInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('answer', text, (res) => {
    const hint = $('answerHint');
    if (res && res.ok) {
      hint.textContent = `✅ Doğru! +${res.points} puan 🎉`;
      hint.className = 'hint ok';
      state.attemptsLeft = res.attemptsLeft ?? state.attemptsLeft;
      state.answeredCorrect = true;
      sounds.correct();
    } else {
      hint.textContent = '❌ ' + (res && res.reason ? res.reason : 'Yanlış cevap');
      hint.className = 'hint bad';
      if (res && typeof res.attemptsLeft === 'number') state.attemptsLeft = res.attemptsLeft;
      beep(200, .12, 'sawtooth', .02);
    }
    renderAttempts();
  });
  input.value = '';
});

/* ==================== Yardımcılar ==================== */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==================== Başlangıç ==================== */
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
    $('cfgSeconds').textContent = state.config.questionSeconds;
    $('cfgRound').textContent = state.config.questionsPerRound;
    $('cfgAttempts').textContent = state.config.maxAttempts;
    $('cfgPoints').textContent = state.config.attemptPoints.join('/');
    $('cfgBank').textContent = state.config.questionBankSize;
    $('themeName').textContent = state.config.theme;
    $('themeMul').textContent = `· ${state.config.themeMultiplier}x puan`;
    state.timerValue = state.config.questionSeconds;
    state.attemptsLeft = state.config.maxAttempts;
  } catch (_) { /* varsayılanlar kullanılır */ }
}

async function enterGame() {
  $('meName').textContent = state.username;
  $('meAvatar').textContent = (state.username || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  $('soundToggle').textContent = state.sound ? '🔊' : '🔇';
  $('adminBtn').classList.toggle('hidden', state.role !== 'admin');
  $('authScreen').classList.remove('active');
  $('gameScreen').classList.add('active');
  await loadConfig();
  connectSocket();
}

if (state.token && state.username) {
  enterGame();
}
