'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Game } = require('../lib/game');
const { Store } = require('../lib/store');

// Sahte io nesnesi — sadece emit çağrılarını yakalar
function mockIo() {
  const events = [];
  return {
    events,
    emit(name, payload) { events.push({ name, payload }); },
    on() {},
  };
}

function tempStore() {
  const file = path.join(os.tmpdir(), `sy-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return { store: new Store(file), file };
}

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // ------------------------------------------------ 3 cevap hakkı & puan
  {
    const { store, file } = tempStore();
    const io = mockIo();
    const game = new Game({
      io,
      store,
      config: { questionsPerRound: 2, questionSeconds: 30, resultPauseMs: 100, teaserSeconds: 1, revealSteps: [] },
    });
    game.start('test');
    store.createUser('ali', 'sifre1');
    store.createUser('veli', 'sifre1');
    store.createUser('ayse', 'sifre1');
    store.createUser('mert', 'sifre1');

    assert(game.phase === 'question', 'tur başlayınca soru fazına geçildi');
    assert(game.current.isTheme === (game.current.cat === game.theme), 'tema bayrağı kategoriyle uyumlu');

    // 3 yanlış cevap hakkı
    let r = game.answer('ali', 'yanlis1');
    assert(r.ok === false && r.attemptsLeft === 2, '1. yanlış sonrası 2 hak kaldı');
    r = game.answer('ali', 'yanlis2');
    assert(r.ok === false && r.attemptsLeft === 1, '2. yanlış sonrası 1 hak kaldı');
    r = game.answer('ali', 'yanlis3');
    assert(r.ok === false && !('attemptsLeft' in r), '3. yanlış sonrası kilit mesajı döndü');
    r = game.answer('ali', 'yanlis4');
    assert(r.ok === false && /kalmadı/i.test(r.reason), 'hakkı biten oyuncu reddedildi');

    // 2. denemede doğru → 7 puan (tema değilse)
    const answer = game.current.display;
    const isTheme = game.current.isTheme;
    const expected = isTheme ? 14 : 7;
    r = game.answer('veli', 'yanlis_a');
    assert(r.ok === false && r.attemptsLeft === 2, 'veli 1. hatada hak kaybetti');
    r = game.answer('veli', answer);
    assert(r.ok === true && r.points === expected, `2. denemede doğru → ${expected} puan (tema=${isTheme})`);
    assert(game.roundScores.get('veli') === expected, 'tur puanı işlendi');
    const stored = store.get('veli');
    assert(stored.totalScore === expected, 'puan kalıcı depoya yazıldı');

    // Aynı oyuncu tekrar cevap veremez
    r = game.answer('veli', answer);
    assert(r.ok === false, 'bilen oyuncu tekrar cevap veremez');
    assert(game.phase === 'result', 'doğru cevap sonrası sonuç fazına geçildi');

    // Teaser akışı: result → teaser → question
    await sleep(150);
    assert(game.phase === 'teaser', 'sonuç sonrası teaser başladı');
    assert(game.teaser && game.teaser.number === 2, 'teaser 2. soruyu duyurdu');
    await sleep(1200);
    assert(game.phase === 'question' && game.questionIndex === 2, 'teaser sonrası 2. soru başladı');

    game.dispose();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // ------------------------------------------------ 1. deneme doğru → 10 puan
  {
    const { store, file } = tempStore();
    const io = mockIo();
    const game = new Game({
      io,
      store,
      config: { questionsPerRound: 1, questionSeconds: 30, resultPauseMs: 50, teaserSeconds: 1, revealSteps: [], themeMultiplier: 1 },
    });
    game.start('test');
    store.createUser('ayse', 'sifre1');
    const r = game.answer('ayse', game.current.display);
    assert(r.ok === true && r.points === 10, '1. denemede doğru → 10 puan');

    // Süre dolunca kimse bilemez
    game.timeLeft = 1;
    game._tick();
    await sleep(80);
    assert(game.phase === 'teaser' || game.phase === 'round_end', 'süre dolunca soru kapandı');

    game.dispose();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // ------------------------------------------------ Günün teması soru seçimi
  {
    const { store, file } = tempStore();
    const io = mockIo();
    const game = new Game({
      io,
      store,
      config: { questionsPerRound: 10, questionSeconds: 30, resultPauseMs: 50, teaserSeconds: 1 },
    });
    game.start('test');
    store.createUser('mert', 'sifre1');
    const themeCount = game.questions.filter((q) => q.cat === game.theme).length;
    assert(game.questions.length === 9, '10 soruluk turda ilk soru çekildi, 9 soru havuzda kaldı');
    assert(themeCount >= 4, `havuzda yeterli tema sorusu var (${themeCount} tane)`);
    // current + tüketilen sorular toplamı 10 olmalı (current 1 tane)
    assert(game.questionIndex === 1, 'ilk soru sırasıyla başladı');

    // Tema sorusu puanı: current tema ise 1. deneme 20 puan
    game.current.isTheme = true;
    const r = game.answer('mert', game.current.display);
    assert(r.points === 20, 'tema sorusunda 1. deneme 20 puan (10 x 2)');

    game.dispose();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  console.log(process.exitCode ? '\nBazı testler başarısız!' : '\nTüm testler geçti ✅');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
