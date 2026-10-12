'use strict';

/**
 * Türkçe karakter destekli normalleştirme yardımcıları.
 * Hem cevap karşılaştırmada hem de harf maskelemede kullanılır.
 */

const TR_MAP = {
  'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
  'â': 'a', 'î': 'i', 'û': 'u', 'ê': 'e', 'à': 'a', 'é': 'e',
};

/** Sadece Türkçe harfler ve rakamlar için normalleştirme. */
function normalize(str) {
  return String(str || '')
    .toLocaleLowerCase('tr-TR')
    .split('')
    .map((ch) => TR_MAP[ch] || ch)
    .join('')
    .replace(/[^a-z0-9\s]/g, ' ') // noktalama at
    .replace(/\s+/g, ' ')
    .trim();
}

/** Boşlukları tamamen siler (kısmi eşleşme toleransı için). */
function squash(str) {
  return normalize(str).replace(/\s/g, '');
}

/** Yaygın ek/dolgu sözcüklerini kırpıp karşılaştırmayı kolaylaştırır. */
const SUFFIXES = [
  'dir', 'dır', 'dur', 'dür', 'tır', 'tir', 'tur', 'tür',
  'dirki', 'dırki',
  'durki', 'dürki',
  'dirler', 'dırler',
  'dırınız', 'diriniz',
  'dır.', // normalize zaten noktaları atar, yine de güvenli olsun
  'olan', 'idi', 'imiş', 'ise',
  'ya', 'ye', 'da', 'de', 'ta', 'te',
];

/** "Ankara'dır" -> "ankara" gibi kırpma denemeleri üretir. */
function candidates(str) {
  const base = normalize(str);
  const out = new Set([base, squash(str)]);
  for (const cand of [...out]) {
    for (const suf of SUFFIXES) {
      if (cand.length > suf.length + 2 && cand.endsWith(suf)) {
        const cut = cand.slice(0, -suf.length).trim();
        if (cut.length >= 2) {
          out.add(cut);
          out.add(cut.replace(/\s/g, ''));
        }
      }
    }
  }
  // Baştaki artıkları temizle ("the", "bir", "olan")
  for (const cand of [...out]) {
    const stripped = cand.replace(/^(the|bir|olan)\s+/, '').trim();
    if (stripped.length >= 2) out.add(stripped);
  }
  return out;
}

/** Kullanıcı cevabı, kabul edilen cevaplardan herhangi biriyle eşleşiyor mu? */
function isCorrect(userAnswer, acceptedAnswers) {
  const mine = candidates(userAnswer);
  if (mine.size === 0) return false;
  return (acceptedAnswers || []).some((acc) => {
    const theirs = candidates(acc);
    for (const t of theirs) {
      if (mine.has(t)) return true;
      // Çok kısa cevaplarda birebir, uzunlarda başlangıç eşleşmesine de izin ver
      // (örn. "mustafa kemal atatürk" yazan "mustafa kemal atatürk (atatürk)" cevabını yakalar)
      for (const m of mine) {
        if (t.length >= 6 && m.length >= 6 && (t.startsWith(m) || m.startsWith(t))) {
          return true;
        }
      }
    }
    return false;
  });
}

/**
 * Cevabın harflerini ve rakamlarını maskeleyerek verir.
 * Boşluk ve noktalama her zaman görünür kalır; karakterler soldan sırayla açılır.
 * @returns {string} örn. "■ ■ ■ K   ■ ■ ■"
 */
function maskAnswer(displayAnswer, revealedCount) {
  let revealed = 0;
  return String(displayAnswer || '')
    .split('')
    .map((ch) => {
      if (!/[a-zçğıöşüâîûê0-9]/i.test(ch)) return ch; // boşluk/noktalama görünür
      if (revealed < revealedCount) {
        revealed += 1;
        return ch;
      }
      return '■';
    })
    .join('');
}

/** Bir cevaptaki toplam karakter (harf + rakam) sayısı — maskelemede kullanılır. */
function letterCount(displayAnswer) {
  return String(displayAnswer || '')
    .split('')
    .filter((ch) => /[a-zçğıöşüâîûê0-9]/i.test(ch)).length;
}

// ---------------------------------------------------------------------
// Sohbet moderasyonu — küfür/argo filtresi
// ---------------------------------------------------------------------

const BAD_WORDS = [
  'amk', 'amq', 'aq', 'orospu', 'oruspu', 'orspu', 'siktir', 'sikik', 'yarrak', 'yarak',
  'kaltak', 'piç', 'pic', 'pezevenk', 'ibne', 'gavat', 'sikerim', 'sikeyim',
  'götveren', 'namussuz', 'şerefsiz', 'serefsiz', 'keriz', 'dangalak',
];

/** Metin küfür/argo içeriyor mu? (normalize edilmiş kaba kontrol) */
function containsProfanity(text) {
  const flat = squash(text).replace(/\s/g, '');
  if (!flat) return false;
  return BAD_WORDS.some((w) => flat.includes(w));
}

module.exports = { normalize, squash, candidates, isCorrect, maskAnswer, letterCount, containsProfanity };
