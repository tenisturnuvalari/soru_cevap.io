# 🎲 Zeka Turnuvası

Gerçek zamanlı, üyelik sistemli, süreli genel kültür soru-cevap yarışması.

## Özellikler

- **Üyelik sistemi:** Kayıt / giriş, şifreler `scrypt` ile hash'lenir, puanlar kalıcıdır
- **SoruBotu:** Bot her turda 10 genel kültür sorusu sorar (bankada 96+ soru)
- **60 saniye süre:** Her soru için geri sayım; süre azaldıkça cevabın harfleri **ve rakamları** soldan sırayla açılır
- **3 cevap hakkı:** 1. denemede doğru → **+10**, 2. deneme → **+7**, 3. deneme → **+4** puan; ilk bilen oyunun kazananı olur ve bot duyurur
- **Günün teması:** Her takvim günü farklı bir kategori (Tarih, Bilim, Spor…) — o türden sorular **2 kat puan** verir
- **Sorular arası teaser:** Cevap sonrası ekrana *"3. soru geliyor! Hazırsan geriye yaslan 🍿"* gibi mesajlar düşer (5 sn)
- **Sohbet:** Oyun içi canlı sohbet (soruların altında); küfür/argo otomatik engellenir, kayıt tutulur
- **Yönetim paneli:** Şifre sıfırlama (şifre unutan üye), kullanıcı adı arama (adını unutan üye), üyeyi oyundan atma, 5 dk susturma, kalıcı yasaklama, moderasyon kaydı
- **Sıralamalar:** Tur içi puan tablosu + kalıcı genel sıralama
- **Yazım toleransı:** Türkçe karakterler, ekler ("Ankara" / "Ankara'dır"), büyük-küçük harf farkları sorun değil

## Kurulum ve Çalıştırma

```bash
npm install
npm start
```

Tarayıcıda **http://localhost:3000** adresini açın. Birden fazla sekme/kişi açarak gerçek zamanlı oyunu test edebilirsiniz.

### Yönetici hesabı

İlk açılışta otomatik oluşturulur:

- Kullanıcı adı: `admin` (veya `ADMIN_USERNAME`)
- Şifre: `admin1234` (veya `ADMIN_PASSWORD`)

```bash
# Farklı yönetici belirlemek için:
ADMIN_USERNAME=patron ADMIN_PASSWORD=gizli123 npm start
```

Yönetici, sağ üstteki 🛠️ butonundan yönetim paneline girer.

## Oyun Akışı

1. Oyuncular giriş yapar, lobiye düşer
2. Herhangi bir oyuncu **"Oyuna Başla"** der → tur başlar
3. SoruBotu soruyu yayınlar, süre başlar; herkesin **3 cevap hakkı** vardır
4. Doğru bilen puanı kapar (deneme sayısına göre 10/7/4, tema sorularında 2 kat)
5. Cevap gösterilir → 5 sn teaser → yeni soru
6. 10 soru sonunda **podium** açıklanır, puanlar kalıcı olarak kaydedilir

## GitHub'a Yayınlama Adımları

1. **GitHub'da boş bir repository oluştur** (web: github.com → New repository) — *Create repository without README* seçeneğini işaretle
2. **Depoyu bağla ve yükle** (bu klasörde):

```bash
git init -b main
git add .
git commit -m "Zeka Turnuvası: canlı genel kültür yarışması"
git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git
git push -u origin main
```

3. Sonraki güncellemelerde sadece:

```bash
git add .
git commit -m "değişiklik açıklaması"
git push
```

> `data/` klasörü (üye bilgileri ve puanlar) `.gitignore` sayesinde repoya girmez; `node_modules/` de girmez.

## Teknik Yapı

| Dosya | Görev |
|---|---|
| `server.js` | Express + Socket.IO sunucusu, kimlik doğrulama, sohbet, yönetim API'si |
| `lib/game.js` | Oyun motoru: süre, 3 cevap hakkı, puanlama, teaser, günün teması |
| `lib/questions.js` | Soru bankası + günlük tema seçimi |
| `lib/text.js` | Türkçe cevap normalleştirme, maskeleme, küfür filtresi |
| `lib/store.js` | JSON dosya tabanlı kullanıcı deposu (`data/store.json`) |
| `public/` | Tarayıcı arayüzü (HTML + CSS + JS, framework yok) |
| `test/` | Birim + entegrasyon testleri (`node test/text.test.js` gibi) |

## Ayarlar

`lib/game.js` içindeki `DEFAULTS` ile oyun süresi, tur uzunluğu, puan tablosu ve harf açma zamanları değiştirilebilir.
Port için: `PORT=8080 npm start`
