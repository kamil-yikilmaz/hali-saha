# Halı Saha — Güvenli oylama sürümü

Bu dal eski tarayıcı içi şifre doğrulamasını kaldırır. E-posta ile Firebase Authentication, yönetici TOTP doğrulaması, App Check ve yetkili sunucu API'si kullanır. GitHub Pages yalnızca derlenen arayüzü sunar.

**Kurulum tamamlanmadan birleştirip yayımlamayın.** Mevcut Firebase kurallarını tek başına değiştirmek eski uygulamayı durdurur. Bu depoya kod eklenmesi canlı kuralları değiştirmez.

## Korunan işlevler

- 1–10 puan ve en fazla 500 karakter yorum; kişisel kesinleştirme.
- Genel kapanış, oyuncu kilidini açma ve verdiği oyları sıfırlama.
- Genel/mevki listeleri, yönetici oy dökümü, yorumlar, JSON/CSV dışa aktarma.
- Mevki ve oyuncu yönetimi, açık/koyu tema.

## Bilinçli değişiklikler

- Kullanıcı adıyla giriş yerine doğrulanmış e-posta; eski şifreler taşınmaz.
- Yönetici hesabını arayüz oluşturmaz. Kullanıcılar Authentication'da oluşturulur, UID ile uygulamaya eklenir.
- Yönetici rolünü yalnızca güvenilir operatör atar. Yönetici ayrıca oyuncu değildir.
- Kadro/mevki ilk oyla sabitlenir. Pasifleştirme yeni oylamada yapılır; geçmiş oyları yanlışlıkla silmez.
- Kök JSON içe aktarma ve otomatik demo geçişi kaldırıldı.
- Oturum bellekte tutulur; sayfa yenilenince giriş gerekir. Yönetici oturumu en fazla 1 saat; değişiklikler için son 10 dakika içinde giriş gerekir. Bu bir hareketsizlik sayacı değildir.
- Oy kartları açık bir **Kaydet** düğmesi kullanır. Kesinleştirmede yalnızca kaydedilmiş oylar geçerlidir.
- En fazla 100 üye ve son 500 işlem kaydı; bu küçük grup için tek transaction sınırı kullanılır. Büyük ölçek için yeniden tasarım gerekir.

## Geliştirme

Node.js 22.12+ kullanın.

```sh
npm ci
npm --prefix functions ci
cp .env.example .env.local
npm run check
```

`.env.local` yalnızca Firebase web uygulaması yapılandırması ve App Check site anahtarını içerir. Servis hesabı özel anahtarı veya database secret yazmayın. Testler ağsız iş kuralı testleridir; gerçek kimlik doğrulama, MFA, App Check ve eşzamanlı RTDB transaction entegrasyonu ayrıca test edilmelidir.

Firebase kurulum, veri geçişi ve GitHub yayını için [SECURITY-SETUP.md](SECURITY-SETUP.md) dosyasını izleyin.
