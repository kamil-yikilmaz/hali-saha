# Güvenli kurulum ve işletim

## Uygulanan mimari

GitHub Pages statik Vite çıktısını sunar. Supabase Auth kimliği doğrular. Tarayıcı yalnızca `public.secure_api(payload jsonb)` sunucu fonksiyonunu çağırır. İş tablolarına doğrudan erişim yoktur. Bu sürüm, önceki taslaktaki Edge Function yerine PostgreSQL RPC kullanır: doğrulanmış JWT kimliği, üyelik, aktif Auth oturumu, MFA, kotalar ve tüm iş kuralları transaction içinde kontrol edilir. Böylece bir service-role anahtarını uygulama sunucusunda veya tarayıcıda taşımak gerekmez.

`app_private.state` en fazla 100 üyeli tek grup için atomik JSONB durumudur. `account_links` Auth UID ile eski oyuncu kimliğini bağlar. `archives` yeni dönem öncesindeki veriyi saklar. `audit` parola/token/yorum içermez. `rate_limits` başarısız iş kuralı denemeleri dahil 60 istek/dakika/hesap sınırını uygular. Çok gruplu veya büyük ölçekli kullanım için normalleştirilmiş dönem/oy tablolarına geçilmelidir.

## SQL kurulumu

Migration dosyalarını numara sırasıyla yalnızca yetkili SQL Editor/CLI üzerinden uygula:

1. `202609220001_lockdown.sql`: eski doğrudan istemci erişimini kapatır. Veri silmez. Eski HTML bu aşamadan sonra çalışmaz.
2. `202609220002_secure_api.sql`: özel tabloları ve sunucu API'sini kurar; geçerli eski oyları taşır, oylamayı kapalı başlatır. Tekrar çalıştırma mevcut güvenli durumu sıfırlamaz.

Eski `public.players`, `public.votes`, `public.app_config` kayıtları yalnızca yönetim yetkileriyle ulaşılabilir biçimde korunur. Geçersiz puan, uzun yorum veya yetim kayıtlar aktif oya dönüştürülmez; orijinal tablolarda korunur. `scripts/verify-migration.sql` farkları sayar. Kritik fark çözülmeden oylamayı açma. Eski `pass_hash` yeni aktif durumda bulunmaz ve girişte kullanılmaz. Eski kaynak tablo ve yedeklerinin saklama/silme takvimini yönetici belirlemelidir.

## İlk yönetici ve oyuncu hesapları

Eski kullanıcı adı/parolalar Supabase Auth hesabı değildir. Yönetici e-posta adresini tahmin etme; eski açık veritabanındaki ad veya `is_admin` alanını hesap sahipliği kanıtı olarak kabul etme.

1. Proje sahibi kendi doğrulanmış hesabını Supabase Authentication üzerinden oluşturur. Parolayı kendisi girer; GitHub'a, SQL'e veya sohbete yazılmaz. E-posta daveti/doğrulama kullanılacaksa üretime uygun SMTP kurulmalıdır. Varsayılan SMTP normal kullanıcı dağıtımı için uygun değildir.
2. Kullanıcının onayladığı Auth hesabını ve eski yönetici kimliğini aşağıdaki şablonla, yalnızca SQL Editor üzerinden eşleştir. Önce gerçekten doğru kişiye ait olduklarını doğrula.
3. İlk girişte Hesap erişimi → Doğrulama uygulaması kur → altı haneli kodu doğrula. Yönetici MFA olmadan veriye erişemez. Okuma için son bir saat, değişiklik için son on dakika TOTP doğrulaması gerekir.
4. Oyuncuların doğrulanmış Auth hesaplarını oluştur. Yönetici panelindeki Hesabı bağla formuyla gerçek oyuncuya bağla. Yeniden bağlama/başkasının hesabını devralma bu API'de yasaktır; kurtarma proje sahibinin kontrollü işlemidir.

```sql
-- Placeholder'ları yalnızca doğrulanan gerçek kimliklerle değiştir.
-- Bu örnek otomatik olarak çalıştırılmaz.
insert into app_private.account_links(auth_id, player_id)
select u.id, p.id::text
from auth.users u cross join public.players p
where u.id = 'DOGRULANMIS_AUTH_UUID'::uuid
  and u.email_confirmed_at is not null
  and p.id = 'ONAYLANMIS_ESKI_YONETICI_UUID'::uuid
  and p.is_admin = true;
```

İlk yönetici hesabı için MFA kaybı kurtarması Supabase proje sahibinde kalır. Uygulama içinde yöneticilik atama endpoint'i yoktur. Oyuncu ekleme arayüzünde kimlik boş bırakılırsa sunucu yeni UUID üretir. Hesap eşleştirilmeden kayıtlar korunur, erişim açılmaz.

## Auth ayarları

Auth'ta en az 14 karakter parola politikası, e-posta doğrulama, uygun giriş/yenileme kotaları yapılandırılmalıdır. Ücretsiz plana dahil olmayan korumaların açık olduğu varsayılmaz. Herkese açık kayıt gerekmiyorsa yeni kullanıcı kaydını kapat. CAPTCHA ancak proje sahibinin sağlayıcı anahtarlarıyla kurulabilir; kurulmadan etkin olduğu iddia edilmez. Oyuncu MFA kurduysa API AAL1 oturumunu kabul etmez.

Parola değiştirme mevcut parolayla yeniden doğrulamayı gerektirir; UI minimumu tek başına Auth sunucusu politikasının yerine geçmez. Şifre sıfırlama/davet akışı SMTP hazır olana kadar yönetici kontrollüdür. Uygulama e-posta gönderimini kendiliğinden başlatmaz.

Oturumlar bellektedir; sayfa yenilendiğinde yeniden giriş gerekir. Çıkış tüm Auth oturumlarını iptal eder. API JWT'nin `session_id` değerinin halen `auth.sessions` tablosunda mevcut olduğunu kontrol eder. MFA tazeliği JWT yenilenme saatinden değil doğrulanmış `amr` kaydından alınır.

## Yayın ve kontrol

`npm ci`, `npm run check`, `npm audit --audit-level=high`. SQL entegrasyon testleri PGlite/PostgreSQL üzerinde gerçek rol/izin ve transaction davranışını sınar; Supabase Auth sağlayıcısı testte taklit edilir, gerçek hesapla giriş/MFA smoke testi ayrıca yapılır.

GitHub Actions yalnızca `dist` yükler. SQL, testler ve kaynak yedekleri Pages dosyalarına dahil edilmez. Yayın öncesi `scripts/check-live-boundary.mjs` eski tabloların ve görünümlerin anonim erişime kapalı olduğunu ve anonim RPC'nin reddedildiğini doğrular. Anahtar `src/config.js` içinde yalnızca genel publishable/anon anahtarıdır; secret/service-role anahtarı koyma.

GitHub Pages özel HTTP başlıklarını yönetmez. Meta CSP kullanılır; HTTP-only cookie, tam sunucu CSP başlıkları veya `frame-ancestors` koruması uygulanmış sayılmaz. Daha ileri başlık ihtiyacında başlık destekleyen barındırmaya geç.

## Geri dönüş ve yedek

Eski herkese açık politikaları geri getirme. Hata varsa güvenli bakım/giriş ekranını koru. Yeni oylar geldikten sonra eski snapshot'a dönmek veri kaybettirir; önce özel durumu yedekle ve farkları uzlaştır. Düzenli şifreli PostgreSQL yedeğini repo ve herkese açık depolama dışında tut; Auth hesap/MFA kurtarmasını ayrıca planla. Ücretsiz proje duraklatma ve kota sınırları geçerlidir; sınırsız erişilebilirlik garantisi yoktur.

## Canlı uygulama durumu — 22 Eylül 2026

- Eski tablolardan 22 üye ve 20 oy güvenli duruma aktarıldı; kaynak kayıtlar korundu.
- Eski herkese açık politikalar kaldırıldı; beş eski tablo/görünüm için anonim HEAD isteği ve anonim RPC çağrısı 401 ile reddedildi.
- Herkese açık kayıt kapatıldı; e-posta doğrulama açık kaldı. Auth minimum parola uzunluğu 14, güvenli parola değişikliği ve mevcut parola gereksinimi etkinleştirildi.
- Auth hesabı ve hesap eşleştirmesi sayısı kurulum sırasında sıfırdı. İlk yönetici hesabı oluşturulmadan gerçek giriş/MFA uçtan uca testi tamamlanamaz.
- Sızmış parola kontrolü Pro plan gerektiriyor; etkinleştirilmedi. CAPTCHA sağlayıcı anahtarları ve özel SMTP kurulmadı.
