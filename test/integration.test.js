'use strict';

/**
 * Canlı sunucu üzerinde socket entegrasyon testi.
 * Önce `node server.js` çalışır halde olmalı (port 3000).
 */
const { io } = require('socket.io-client');

const BASE = 'http://localhost:3000';

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

async function api(path, body, token) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connect(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'] });
}

function waitEvent(socket, name, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`'${name}' olayı gelmedi`)), timeoutMs);
    socket.once(name, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

async function main() {
  const stamp = String(Date.now()).slice(-7);

  // Üyeler ve yönetici
  const u1 = await api('/api/register', { username: `sohbetci_${stamp}`, password: '1234' });
  assert(u1.status === 200, `üye kaydı başarılı (durum=${u1.status} hata=${u1.data.error || '-'})`);
  const adm = await api('/api/login', { username: 'admin', password: 'admin1234' });
  assert(adm.status === 200, 'yönetici girişi başarılı');

  // 1) Normal mesaj gönderilir
  const s1 = connect(u1.data.token);
  await waitEvent(s1, 'connect');
  await waitEvent(s1, 'me');
  const chatOk = await new Promise((resolve) => {
    s1.emit('chat', 'merhaba dünya', resolve);
  });
  assert(chatOk.ok === true, 'normal sohbet mesajı gönderildi');

  // 2) Küfür içeren mesaj engellenir
  const chatBad = await new Promise((resolve) => {
    s1.emit('chat', 'sen bir oruspusun', resolve);
  });
  assert(chatBad.ok === false && /uygunsuz/i.test(chatBad.reason), 'küfür içeren mesaj engellendi');

  // 3) Spam koruması: hemen art arda ikinci mesaj reddedilir
  const chatSpam = await new Promise((resolve) => {
    s1.emit('chat', 'hızlı mesaj', resolve);
  });
  assert(chatSpam.ok === false && /hızlı/i.test(chatSpam.reason), 'spam koruması devrede');

  // 4) Yönetici modlog'da engellemeyi görür
  await new Promise((r) => setTimeout(r, 1300)); // rate limit süresi
  const modlog = await api('/api/admin/modlog', null, adm.data.token);
  const hasBlock = modlog.data.log.some((l) => l.action.includes('Küfür'));
  assert(hasBlock, 'küfür denemesi moderasyon kaydına düştü');

  // 5) Yönetici susturur → mesaj gönderilemez
  const mute = await api('/api/admin/mute', { username: u1.data.username, muted: true }, adm.data.token);
  assert(mute.data.ok === true, 'yönetici susturma işlemi');
  const chatMuted = await new Promise((resolve) => {
    s1.emit('chat', 'ben susturuldum', resolve);
  });
  assert(chatMuted.ok === false && /susturuldun/i.test(chatMuted.reason), 'susturulan üye mesaj yazamıyor');
  await api('/api/admin/mute', { username: u1.data.username, muted: false }, adm.data.token);

  // 6) Yönetici üyeyi atar → kicked olayı gelir
  const kickedPromise = waitEvent(s1, 'kicked', 5000);
  const kick = await api('/api/admin/kick', { username: u1.data.username }, adm.data.token);
  assert(kick.data.kicked >= 1, 'üye oyundan atıldı');
  const kicked = await kickedPromise;
  assert(/atıldın/i.test(kicked.reason), 'atılan üyeye bildirim gitti');

  s1.close();

  // 7) Yasaklı üye socket bağlanamaz
  await api('/api/admin/ban', { username: u1.data.username, banned: true }, adm.data.token);
  const s2 = connect(u1.data.token);
  const err = await waitEvent(s2, 'connect_error', 5000);
  assert(/yasak|yetki/i.test(err.message), 'yasaklı üye socket bağlantısı reddedildi');
  s2.close();
  await api('/api/admin/ban', { username: u1.data.username, banned: false }, adm.data.token);

  console.log(process.exitCode ? '\nBazı testler başarısız!' : '\nTüm entegrasyon testleri geçti ✅');
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
