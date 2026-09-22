# Halı Saha — Güvenli Supabase sürümü

Oyuncu değerlendirmesi, mevki sıralaması, anonim alınan yorumlar ve dengeli takım oluşturma.

- Supabase Auth ile giriş; yönetici için TOTP zorunlu.
- Tablolara doğrudan tarayıcı erişimi yok; kimlik ve iş kuralları PostgreSQL sunucu API'sinde denetlenir.
- Şifre özeti istemciye gönderilmez. Genel proje anahtarı erişim yetkisi değildir.
- Yeni oylama önceki dönemi özel arşivde korur.
- Eski kullanıcı adı/parola girişi kaldırılmıştır. Hesaplar doğrulanmış Auth kullanıcısıyla eşleştirilmelidir.

## Yerel çalışma

Node 22.12+ ile `npm ci`, `npm run dev`. Test/build: `npm run check`.

## Kurulum

[SECURITY-SETUP.md](SECURITY-SETUP.md) içindeki migration, ilk yönetici, hesap eşleştirme ve yayın adımlarını izle. Şifreleri veya ayrıcalıklı anahtarları kaynak koduna yazma. Genel proje adresi ve genel anahtar `src/config.js` dosyasındadır.

SQL migration'ları GitHub'da bulunur; `main` yayını yalnızca Vite `dist` çıktısını GitHub Pages'e gönderir. Bu depo önceki Firebase taslaklarından bağımsız olarak Supabase kullanır.
