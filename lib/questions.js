'use strict';

/**
 * Genel kültür soru bankası.
 * Her soru: { q: soru metni, a: [kabul edilen cevaplar...], cat: kategori }
 * İlk cevap doğru sayılmak için yazım toleransı lib/text.js içinde sağlanır.
 */
const QUESTIONS = [
  // ---------- TARİH ----------
  { cat: 'Tarih', q: 'Türkiye Cumhuriyeti hangi yıl ilan edilmiştir?', a: ['1923'] },
  { cat: 'Tarih', q: 'İstanbul\'un Fethi hangi yılda gerçekleşmiştir?', a: ['1453'] },
  { cat: 'Tarih', q: 'Mustafa Kemal Atatürk hangi şehirde doğmuştur?', a: ['Selanik'] },
  { cat: 'Tarih', q: 'Çanakkale Deniz Savaşı hangi yıl yaşanmıştır?', a: ['1915'] },
  { cat: 'Tarih', q: 'İstiklal Marşı\'nın sözlerini kim yazmıştır?', a: ['Mehmet Akif Ersoy', 'Mehmet Akif'] },
  { cat: 'Tarih', q: 'Fatih Sultan Mehmet İstanbul\'u kaç yaşında fethetmiştir?', a: ['21', 'yirmi bir'] },
  { cat: 'Tarih', q: 'Büyük Selçuklu Devleti\'ni kuran hükümdar kimdir?', a: ['Tuğrul Bey', 'Tuğrul'] },
  { cat: 'Tarih', q: 'Nutuk\'un yazarı kimdir?', a: ['Mustafa Kemal Atatürk', 'Atatürk', 'Mustafa Kemal'] },
  { cat: 'Tarih', q: 'Truva Savaşı hangi ünlü esere konu olmuştur?', a: ['İlyada'] },
  { cat: 'Tarih', q: 'Kanuni Sultan Süleyman hangi şehirde doğmuştur?', a: ['Trabzon'] },
  { cat: 'Tarih', q: 'Misak-ı Millî kararları hangi mecliste kabul edilmiştir?', a: ['Son Osmanlı Mebusan Meclisi', 'Mebusan Meclisi', 'Mebusân Meclisi'] },
  { cat: 'Tarih', q: 'İlk Türk devletlerinden Göktürkler\'e "Bilge" unvanı verilen hükümdar kimdir?', a: ['Bilge Kağan'] },

  // ---------- COĞRAFYA ----------
  { cat: 'Coğrafya', q: 'Türkiye\'nin en uzun nehri hangisidir?', a: ['Kızılırmak'] },
  { cat: 'Coğrafya', q: 'Dünyanın en büyük okyanusu hangisidir?', a: ['Pasifik', 'Pasifik Okyanusu', 'Büyük Okyanus'] },
  { cat: 'Coğrafya', q: 'Kapadokya hangi ilimizde yer alır?', a: ['Nevşehir'] },
  { cat: 'Coğrafya', q: 'Türkiye\'nin en büyük gölü hangisidir?', a: ['Van Gölü', 'Van'] },
  { cat: 'Coğrafya', q: 'Everest Dağı hangi sıradağlarda yer alır?', a: ['Himalayalar'] },
  { cat: 'Coğrafya', q: 'Afrika\'nın en yüksek dağı hangisidir?', a: ['Kilimancjaro', 'Kilimanjaro'] },
  { cat: 'Coğrafya', q: 'Dünyanın en derin noktası olan Mariana Çukuru hangi okyanustadır?', a: ['Pasifik'] },
  { cat: 'Coğrafya', q: 'Ege Denizi\'ndeki en büyük Türk adası hangisidir?', a: ['Gökçeada'] },
  { cat: 'Coğrafya', q: 'Türkiye\'nin başkenti neresidir?', a: ['Ankara'] },
  { cat: 'Coğrafya', q: 'Hangi ülke topraklarının bir bölümü hem Avrupa hem Asya kıtasındadır?', a: ['Türkiye', 'Rusya', 'Azerbaycan'] },
  { cat: 'Coğrafya', q: 'Dünyanın en kalabalık ülkesi hangisidir?', a: ['Hindistan', 'Çin'] },
  { cat: 'Coğrafya', q: 'Nil Nehri hangi kıtadan geçer?', a: ['Afrika'] },

  // ---------- BİLİM ----------
  { cat: 'Bilim', q: 'Suyun kimyasal formülü nedir?', a: ['H2O'] },
  { cat: 'Bilim', q: 'Dünya\'nın doğal uydusu hangisidir?', a: ['Ay'] },
  { cat: 'Bilim', q: 'Sesin havadaki hızı saniyede yaklaşık kaç metredir?', a: ['340', '343', '340 metre'] },
  { cat: 'Bilim', q: 'Periyodik tabloda "Au" sembolü hangi elementi gösterir?', a: ['Altın'] },
  { cat: 'Bilim', q: 'İnsan vücudunun en büyük organı hangisidir?', a: ['Deri'] },
  { cat: 'Bilim', q: 'Işığın boşluktaki hızı saniyede yaklaşık kaç kilometredir?', a: ['300000', '300000 km', '299792', '300 bin'] },
  { cat: 'Bilim', q: 'Kalp kaç odacıklıdır?', a: ['4', 'dört'] },
  { cat: 'Bilim', q: 'Güneş Sistemi\'ndeki en büyük gezegen hangisidir?', a: ['Jüpiter'] },
  { cat: 'Bilim', q: 'Kızıl Gezegen olarak bilinen gezegen hangisidir?', a: ['Mars'] },
  { cat: 'Bilim', q: 'DNA molekülünün tam adı nedir?', a: ['Deoksiribonükleik asit', 'dezoksiribonükleik asit'] },
  { cat: 'Bilim', q: 'Vitamin C\'nin kimyasal adı nedir?', a: ['Askorbik asit'] },
  { cat: 'Bilim', q: 'Bir yılda kaç hafta vardır?', a: ['52', 'elli iki'] },
  { cat: 'Bilim', q: 'Güneş, Dünya\'ya ışığı yaklaşık kaç dakikada ulaştırır?', a: ['8', 'sekiz', '8 dakika'] },

  // ---------- SANAT & EDEBİYAT ----------
  { cat: 'Sanat & Edebiyat', q: '"Çalıkuşu" romanının yazarı kimdir?', a: ['Reşat Nuri Güntekin', 'Reşat Nuri'] },
  { cat: 'Sanat & Edebiyat', q: 'Mona Lisa tablosunu kim yapmıştır?', a: ['Leonardo da Vinci', 'Da Vinci'] },
  { cat: 'Sanat & Edebiyat', q: '"Hayvan Çiftliği" romanının yazarı kimdir?', a: ['George Orwell', 'Orwell'] },
  { cat: 'Sanat & Edebiyat', q: 'Nasreddin Hoca hangi şehirde anılır?', a: ['Akşehir'] },
  { cat: 'Sanat & Edebiyat', q: 'Dünya edebiyatının en bilinen eserlerinden "Kral Oedipus" tragedyası kime aittir?', a: ['Sofokles', 'Sophokles'] },
  { cat: 'Sanat & Edebiyat', q: 'Piyano hangi ülkede icat edilmiştir?', a: ['İtalya'] },
  { cat: 'Sanat & Edebiyat', q: 'Türk sanat müziğinin "Diva" lakaplı sanatçısı kimdir?', a: ['Bülent Ersoy'] },
  { cat: 'Sanat & Edebiyat', q: 'Dünyanın en büyük müzelerinden Louvre hangi şehirdedir?', a: ['Paris'] },
  { cat: 'Sanat & Edebiyat', q: '"Sefiller" romanının yazarı kimdir?', a: ['Victor Hugo', 'Hugo'] },
  { cat: 'Sanat & Edebiyat', q: 'Beethoven hangi mesleğiyle tanınır?', a: ['Besteci', 'Kompozitör', 'Müzisyen'] },
  { cat: 'Sanat & Edebiyat', q: 'Keloğlan masalları hangi kültürümüze aittir?', a: ['Türk', 'Anadolu', 'Türk kültürü'] },

  // ---------- SPOR ----------
  { cat: 'Spor', q: 'Futbolda bir takımın sahada kaç oyuncusu bulunur?', a: ['11', 'on bir', 'onbir'] },
  { cat: 'Spor', q: 'FIFA Dünya Kupası kaç yılda bir düzenlenir?', a: ['4', 'dört'] },
  { cat: 'Spor', q: 'Basketbolda smaç (slam dunk) kaç sayı getirir?', a: ['2', 'iki'] },
  { cat: 'Spor', q: 'Olimpiyat bayrağındaki halka sayısı kaçtır?', a: ['5', 'beş'] },
  { cat: 'Spor', q: 'Wimbledon Tenis Turnuvası hangi ülkede düzenlenir?', a: ['İngiltere', 'Birleşik Krallık', 'Britanya'] },
  { cat: 'Spor', q: 'Voleybolda bir sayı, top hangi durumda oyuna geri döner (ralli ne zaman biter)?', a: ['top yere değdiğinde', 'top yere değer', 'yere değince'] },
  { cat: 'Spor', q: 'Atletizmde 100 metre yarışına ne ad verilir (kısa adıyla)?', a: ['sprint'] },
  { cat: 'Spor', q: 'Bir maraton kaç kilometredir?', a: ['42', '42 kilometre', '42.195', '42 km'] },

  // ---------- DOĞA & HAYVANLAR ----------
  { cat: 'Doğa & Hayvanlar', q: 'Karada yaşayan en büyük hayvan hangisidir?', a: ['Afrika filleri', 'Fil', 'Afrika fili', 'Fill'] },
  { cat: 'Doğa & Hayvanlar', q: 'Kutup ayıları hangi kutupta yaşar?', a: ['Kuzey Kutbu', 'Kuzey', 'Arktik'] },
  { cat: 'Doğa & Hayvanlar', q: 'Devenin kaç hörgücü vardır?', a: ['2', 'iki'] },
  { cat: 'Doğa & Hayvanlar', q: 'Dünyanın en hızlı kara hayvanı hangisidir?', a: ['Çita', 'Gepard'] },
  { cat: 'Doğa & Hayvanlar', q: 'Arılar balı neyden üretir?', a: ['nektar', 'çiçek özü', 'bitki özü'] },
  { cat: 'Doğa & Hayvanlar', q: 'Kelebekler hangi evreden sonra kanatlanır?', a: ['kuzugöbeği', 'kuzu göbeği', 'chrysalis', 'kokon', 'kukla', 'pupa'] },
  { cat: 'Doğa & Hayvanlar', q: 'Penguenler hangi yarımkürede yaşar?', a: ['Güney', 'Güney Yarımküre', 'Antarktika'] },
  { cat: 'Doğa & Hayvanlar', q: 'Ağaçların yaprak dökümüne ne ad verilir?', a: ['dökülme', 'yaprak dökümü'] },

  // ---------- TEKNOLOJİ ----------
  { cat: 'Teknoloji', q: '"WWW" kısaltmasının tam adı nedir?', a: ['World Wide Web', 'Dünya Çapında Web', 'world wide web'] },
  { cat: 'Teknoloji', q: 'Bilgisayarın "beyni" olarak bilinen bileşen hangisidir?', a: ['İşlemci', 'CPU', 'Merkezi İşlem Birimi'] },
  { cat: 'Teknoloji', q: 'E-postada "BCC" neyin kısaltmasıdır?', a: ['Gizli Kopya', 'Blind Carbon Copy', 'Kör Kopya'] },
  { cat: 'Teknoloji', q: '1 kilobayt (ikili sistemde) kaç bayttır?', a: ['1024'] },
  { cat: 'Teknoloji', q: 'Türkçe klavyede "Q" harfinin hemen solundaki harf hangisidir?', a: ['A'] },
  { cat: 'Teknoloji', q: 'Apple\'ın ilk iPhone modeli hangi yıl tanıtılmıştır?', a: ['2007'] },
  { cat: 'Teknoloji', q: 'İnternetin temel iletişim protokollerinden TCP/IP neyin kısaltmasıdır?', a: ['Transmission Control Protocol', 'Transfer Kontrol Protokolü', 'TCP/IP'] },
  { cat: 'Teknoloji', q: 'HTML nedir?', a: ['İşaretleme Dili', 'HyperText Markup Language', 'hiper metin işaretleme dili'] },

  // ---------- KÜLTÜR & MİTOLOJİ ----------
  { cat: 'Kültür & Mitoloji', q: 'Türk kahvesi hangi ülkeden dünyaya yayılmıştır?', a: ['Türkiye', 'Osmanlı', 'Osmanlı İmparatorluğu', 'Anadolu'] },
  { cat: 'Kültür & Mitoloji', q: 'Kahve bitkisi ilk olarak hangi ülkede keşfedilmiştir?', a: ['Etiyopya', 'Habeşistan'] },
  { cat: 'Kültür & Mitoloji', q: 'Çay yaprağı ilk olarak hangi ülkede içilmeye başlanmıştır?', a: ['Çin'] },
  { cat: 'Kültür & Mitoloji', q: 'Yunan mitolojisinde deniz tanrıısı kimdir?', a: ['Poseidon'] },
  { cat: 'Kültür & Mitoloji', q: 'Hindu mitolojisinde dans ve yıkım tanrısı olarak bilinen tanrı kimdir?', a: ['Şiva', 'Shiva'] },
  { cat: 'Kültür & Mitoloji', q: 'Nord mitolojisinde Thor hangi silahla tanınır?', a: ['çekiç', 'Mjolnir', 'yoruk çekiçi'] },
  { cat: 'Kültür & Mitoloji', q: 'Ramazan Bayramı\'ndan önceki oruç ayının adı nedir?', a: ['Ramazan'] },
  { cat: 'Kültür & Mitoloji', q: 'Hıristiyanların İsa\'nın doğumu kutladığı bayram hangisidir?', a: ['Noel', 'Christmas'] },

  // ---------- SÖZLÜK & KARIŞIK ----------
  { cat: 'Karışık', q: 'Dünyanın en küçük kıtası hangisidir?', a: ['Avustralya'] },
  { cat: 'Karışık', q: 'Bir yılda kaç gün vardır (artık yıl hariç)?', a: ['365', 'üç yüz altmış beş'] },
  { cat: 'Karışık', q: 'Bir çeyrek altın kaç gramdır (yaklaşık)?', a: ['1.75', '1,75', '1.75 gram'] },
  { cat: 'Karışık', q: 'Dünyanın en küçük ülkesi hangisidir?', a: ['Vatikan'] },
  { cat: 'Karışık', q: 'Kırmızı ile sarı karıştırılırsa hangi renk elde edilir?', a: ['turuncu'] },
  { cat: 'Karışık', q: '1\'den 10\'a kadar olan sayıların toplamı kaçtır?', a: ['55', 'elli beş'] },
  { cat: 'Karışık', q: 'Ay\'ın evrelerinden biri olan ve tamamen aydınlık görülen evre hangisidir?', a: ['dolunay'] },
  { cat: 'Karışık', q: 'Gökkuşağında kaç renk vardır (klasik sayımla)?', a: ['7', 'yedi'] },
  { cat: 'Karışık', q: 'İlk Türk devletlerinden Uygurlar hangi dinin etkisinde kalmıştır?', a: ['Budizm', 'Maniheizm', 'Budizm ve Maniheizm'] },
  { cat: 'Karışık', q: 'Hicri takvime göre yeni yıl hangi olayla başlar?', a: ['Hicret', 'Mekke\'den Medine\'ye hicret'] },
  { cat: 'Karışık', q: 'Keloğlan hangi tür Türk halk masalı kahramanıdır?', a: ['akıllı çocuk', 'zeki çocuk', 'çocuk'] },
  { cat: 'Karışık', q: 'Dünyanın en uzun nehri kabul edilen nehir hangisidir?', a: ['Nil', 'Amazon', 'Nil Nehri', 'Amazon Nehri'] },
  { cat: 'Karışık', q: 'Bir insanın ortalama kaç kemik vardır?', a: ['206', 'iki yüz altı'] },
  { cat: 'Karışık', q: 'Güneş Sistemi\'nde sırasıyla kaç gezegen vardır?', a: ['8', 'sekiz'] },
  { cat: 'Karışık', q: 'Vosvos (VW Beetle) hangi ülkenin otomobilidir?', a: ['Almanya', 'Alman'] },
  { cat: 'Karışık', q: 'Dünyanın en büyük çölü (kutup çölleri hariç) hangisidir?', a: ['Sahra'] },
];

/** Rastgele, kendinden öncekiyle aynı olmayacak şekilde soru seçen yardımcı. */
function pickQuestions(count, lastQuestion) {
  const pool = QUESTIONS.slice();
  const picked = [];
  let prev = lastQuestion;
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(idx, 1);
    if (item.q === prev && pool.length > 0) continue; // peş peşe aynı soru olmasın
    picked.push(item);
    prev = item.q;
  }
  return picked;
}

/** Bankadaki benzersiz kategori listesi (sıralı). */
function categories() {
  const seen = [];
  for (const q of QUESTIONS) {
    if (!seen.includes(q.cat)) seen.push(q.cat);
  }
  return seen;
}

/** Günün teması: her takvim günü sabit bir kategori seçer (kategoriler sırayla döner). */
function getDailyTheme() {
  const cats = categories();
  const dayIndex = Math.floor(Date.now() / 86400000); // epoch günü
  return cats[((dayIndex % cats.length) + cats.length) % cats.length];
}

/**
 * Günün temasına uygun tur soruları seçer.
 * Turdaki soruların çoğu günün temasından gelir (7/10), kalanı karışık.
 */
function pickRoundQuestions(count, lastQuestion, theme) {
  const themePool = QUESTIONS.filter((q) => q.cat === theme);
  const otherPool = QUESTIONS.filter((q) => q.cat !== theme);
  const fromTheme = Math.min(Math.max(0, count - 3), themePool.length); // en az 3 karışık soru
  const picked = [];
  let prev = lastQuestion;

  const takeRandom = (pool, n) => {
    const copy = pool.slice();
    const out = [];
    while (out.length < n && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      const [item] = copy.splice(idx, 1);
      if (item.q === prev && copy.length > 0) continue;
      out.push(item);
      prev = item.q;
    }
    return out;
  };

  picked.push(...takeRandom(themePool, fromTheme));
  picked.push(...takeRandom(otherPool, count - picked.length));

  // Sırayı karıştır (sorular hep tema ile başlamasın)
  for (let i = picked.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

module.exports = { QUESTIONS, pickQuestions, pickRoundQuestions, categories, getDailyTheme };
