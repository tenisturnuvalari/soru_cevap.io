'use strict';
const t = require('../lib/text');

const cases = [
  ['1923', '1923', true],
  ['ankara', 'Ankara', true],
  ['ankaradır', 'Ankara', true],
  ['ankara da', 'Ankara', true],
  ['h2o', 'H2O', true],
  ['h-2-o', 'H2O', true],
  ['mehmet akif', 'Mehmet Akif Ersoy', true],
  ['mehmet âkif ersoy', 'Mehmet Akif Ersoy', true],
  ['yanlış cevap', 'Ankara', false],
  ['selanik', 'Selanik', true],
  ['42 kilometre', ['42', '42 kilometre', '42.195', '42 km'], true],
  ['42 milyon', ['42', '42 kilometre'], false], // ek açıklama yanlış olursa kabul edilmez
  ['van', ['Van Gölü', 'Van'], true],
  ['kuzey kutbu', 'Kuzey Kutbu', true],
  ['kuzeykutbu', 'Kuzey Kutbu', true],
  ['the pasifik', 'Pasifik', true],
  ['dünya çapında web', 'World Wide Web', false],
  ['340 metre', ['340', '343', '340 metre'], true],
  ['mars', 'Mars', true],
  ['marsdır', 'Mars', true],
  ['jüpiter', 'Jüpiter', true],
  ['gepard', 'Çita', false],
  ['çin', 'Çin', true],
];

let pass = 0;
let fail = 0;
for (const [user, accepted, expected] of cases) {
  const list = Array.isArray(accepted) ? accepted : [accepted];
  const got = t.isCorrect(user, list);
  const ok = got === expected;
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  user=${JSON.stringify(user)} accepted=${JSON.stringify(accepted)} expected=${expected} got=${got}`);
}

console.log('\nmask "Ankara", 2 açık :', t.maskAnswer('Ankara', 2));
console.log('mask "Kızılırmak", 3 :', t.maskAnswer('Kızılırmak', 3));
console.log('mask "Van Gölü", 1    :', t.maskAnswer('Van Gölü', 1));
console.log('mask "1024", 0 açık  :', t.maskAnswer('1024', 0));
console.log('mask "1024", 2 açık  :', t.maskAnswer('1024', 2));

const leakChecks = [
  ['1024', t.maskAnswer('1024', 0)],
  ['1923', t.maskAnswer('1923', 0)],
  ['42', t.maskAnswer('42', 0)],
];
let leaks = 0;
for (const [secret, masked] of leakChecks) {
  if (masked.includes(secret)) {
    console.error(`FAIL  cevap sızıntısı: ${secret} -> ${masked}`);
    leaks += 1;
    process.exitCode = 1;
  } else {
    console.log(`PASS  sayısal cevap gizli: ${secret} -> ${masked}`);
  }
}
console.log(`\nSonuç: ${pass} geçti, ${fail} hata`);
process.exit(fail ? 1 : 0);
