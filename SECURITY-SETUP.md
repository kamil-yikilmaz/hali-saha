# Güvenli geçiş ve yayın

Hedef proje: `halisaha-8913e`. Bölge: `europe-west1`. Site origin: `https://kamil-yikilmaz.github.io`.

Bu sürüm bir şifre kırılmazlığı garantisi değildir. Şifrelerin uygulama verisinde tutulmasını kaldırır; kurulum ve canlı testlerle tamamlanmalıdır.

## 1. Önce veri ve erişim

- Firebase konsolunda mevcut Rules ve Authentication ayarlarını inceleyin. Canlı kurallar bu kod incelemesinde doğrulanmadı.
- Yetkili konsoldan eski veriyi erişimi kısıtlı bir yedeğe alın. Yedeği GitHub'a yüklemeyin.
- `admins`, `users/passHash` ve varsa eski database secret hassastır. Kullanılmış ayrıcalıklı sırları iptal edin; geçmişten dosya silmek tek başına yeterli değildir.
- Geçişte eski şifreler yeniden kullanılmaz; kullanıcılar yeni şifre belirler.
- Yeni veriler `secureV2` altında tutulur; eski veri otomatik silinmez. Kurallar tüm istemci yollarını kapatır. Eski veriyi silme ayrıca planlanır.

## 2. Firebase Authentication

1. Email/Password sağlayıcısını açın; izin verilen domainlere `kamil-yikilmaz.github.io` ekleyin.
2. Password Policy: Require modunda en az 15 karakter; kullanıcıların uzun parola cümleleri kullanmasına izin verin. Arayüzde politika göstermenin sunucu politikasının yerine geçmediğini unutmayın.
3. E-posta hesabı keşfi korumasını etkinleştirin; Authentication giriş/sıfırlama kotalarını beklenen küçük kullanıcı grubuna göre sınırlandırın. API'deki hız sınırı Firebase giriş uç noktasını kapsamıyor.
4. TOTP için Identity Platform gereksinimini doğrulayın ve TOTP sağlayıcısını etkinleştirin. Maliyet/plan değişikliği gerekiyorsa hesap sahibi onayıyla ilerleyin.
5. Oyuncuların Authentication hesaplarını oluşturun. Benzersiz rastgele başlangıç şifresi kullanın; ortak şifre dağıtmayın. Kullanıcı kendisi şifre sıfırlama akışıyla yeni şifre belirlesin ve e-postasını doğrulasın.
6. Doğrulanmış yönetici Auth UID'sini güvenilir ortamda atayın. Proje ve veritabanı URL'sini doğrulayarak:

```sh
cd functions
node bootstrap.cjs halisaha-8913e https://halisaha-8913e-default-rtdb.europe-west1.firebasedatabase.app AUTH_UID 'Yönetici'
```

Bu komut Application Default Credentials gerektirir; mevcut `secureV2` üzerine yazmaz. Ayrıcalıklı kimlik bilgilerini depoya koymayın. Yönetici ilk girişte **Doğrulama uygulaması kur** seçeneğiyle TOTP kurar; çıkış yapıp koduyla yeniden girer. MFA olmadan yönetici API'si çalışmaz. Kurtarma işlemi güvenilir proje yöneticisince kimlik doğrulanarak yapılmalı; uygulamada MFA atlatma yolu bulunmaz.

## 3. App Check ve API

- Web uygulamasını Firebase App Check'e kaydedin. reCAPTCHA Enterprise site anahtarında site domainini tanımlayın; desteklenen korumaları etkinleştirin.
- App Check enforcement API'de zorunludur. Üretime debug token veya debug bypass eklemeyin.
- App Check botları tamamen engellemez ve kullanıcı yetkisinin yerine geçmez.
- Cloud Functions kullanımı için gerekli faturalandırma/plan koşullarını hesap sahibi doğrulamalıdır. Bu değişiklik otomatik etkinleştirilmez.
- `functions/index.js` içindeki `ALLOWED_ORIGIN` varsayılanı GitHub Pages originidir. Özel domain kullanılıyorsa dağıtımda gerçek origini tanımlayın; CORS bir yetki kontrolü değildir.
- Admin SDK yetkisi olan runtime hesabı kuralları aşar; en az gerekli IAM erişimini verin, paylaşılan servis hesabı anahtarı kullanmayın.
- Geliştirme/staging projesinde denedikten sonra güvenilir operatör ortamında:

```sh
firebase deploy --project halisaha-8913e --only functions:secureApi
```

**Rules dağıtımı eski sayfanın tüm veri erişimini keser.** Hazırlanmış yeni arayüz, hesaplar ve aktarım ile koordineli bir bakım aralığında:

```sh
firebase deploy --project halisaha-8913e --only database
```

`database.rules.json` üst ve alt bütün istemci okumalarını/yazmalarını reddeder; yalnızca doğrulanmış API kullanılır. Hata halinde `.read:true`/`.write:true` açarak geri dönmeyin.

## 4. Eski oyları koruma

- Her eski oyuncu UID'sini gerçek Authentication UID'sine eşleyen özel JSON hazırlayın: `{ "eskiUid": "authUid" }`.
- Yedek ve eşleme yalnızca `private/` gibi git tarafından yok sayılan, erişimi kısıtlı bir yerde bulunsun.

```sh
node scripts/migrate-legacy.cjs private/backup.json private/uid-map.json private/converted.json
```

Dönüştürücü ağa bağlanmaz, eski şifre özetlerini taşımaz, mevcut çıktı dosyasını ezmez. Eksik/tekrarlı eşlemede veya puansız yorum gibi hatalı veride durur; sessizce veri kaybetmez.

Çıktıyı canlıya yazmadan önce her UID'nin doğru Auth hesabına ait olduğunu, oyuncu/oy sayılarını ve toplamları karşılaştırın. Güvenilir operatör, `secureV2/members` içine oyuncuları mevcut yönetici kaydını koruyarak aktarır; `votes`, `locked`, `config` alanlarını birlikte uygular. Root overwrite yapmayın. UID eşlemesi yönetici UID'siyle çakışmamalı. Bu aktarım otomatik çalıştırılmamıştır.

Yeni kayıtlarla geçmiş yorumların alıcıları doğru eşleşmeli. Sonuçlar doğrulandıktan sonra genel oylama yönetici tarafından açılabilir.

## 5. GitHub Pages

Repository Variables içine aşağıdaki **herkese açık web yapılandırması** değerlerini yazın:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID` = `halisaha-8913e`
- `VITE_FIREBASE_APP_ID`
- `VITE_APP_CHECK_SITE_KEY`

Bunlar servis hesabı veya database secret değildir. Firebase web API anahtarı bir erişim yetkisi değildir; gerçek güvenlik Authentication, API ve kurallardır.

**Yalnızca backend/kurallar/hesaplar hazır ve staging testleri geçmişse** `SECURE_BACKEND_READY=true` yapın. Bu değişken eksikse yayın işi çalışmaz. Workflow sadece `dist` dizinini yükler; sunucu kodu, dokümanlar ve özel dosyalar Pages çıktısına girmez. Depo herkese açıktır; kaynak kodun da herkese açık olduğunu unutmayın.

Pages ayarında Enforce HTTPS açık olmalı. GitHub/Google proje yöneticilerinde MFA, ana dal koruması ve PR kontrolleri etkinleştirilmelidir. Bu yönetim ayarları kodla uygulanmış sayılmaz.

## 6. Operasyonel sınırlar

- Yönetici okumasında TOTP ve en fazla 1 saatlik giriş; yazmada en fazla 10 dakikalık giriş zorunludur. Oturum iptali her çağrıda kontrol edilir. Hareketsizlik tabanlı 15 dakika kontrolü bu sürümde yoktur.
- Onaylı kullanıcı başına dakikada 60 API isteği; hatalı işlemler de bütçeyi tüketir. Fonksiyon en fazla 3 örneğe çıkar. Bunlar DDoS veya maliyet garantisi değildir. Kullanım ve bütçe alarmları ayrıca kurulmalıdır.
- Son 500 işlem state ile atomik saklanır; bu, dışarıda değiştirilemez bir denetim arşivi değildir. Uzun süreli kayıt gerekiyorsa erişimi kısıtlı ayrı kayıt sistemi ekleyin.
- Genel sonuçlar kişisel kesinleştirmeden sonra görünür; küçük grupta sonuç farklarından oy tahmini yapılabilir. Daha güçlü anonimlik için sadece genel kapanış sonrası sonuç gösterme kuralı seçilebilir.
- Meta CSP kullanılır. `frame-ancestors`, HSTS ve diğer HTTP yanıt başlığı politikaları yalnızca meta ile sağlanmaz; GitHub Pages'in sunmadığı başlıkları gerekli görürseniz uygun proxy/hosting katmanı planlayın.
- Şifre sıfırlama/doğrulama e-postaları yalnızca kullanıcı düğmeye bastığında gönderilir. Bu değişiklik hazırlanırken kimseye e-posta gönderilmedi.

## 7. Yayın kabul testleri

Yerel testler: `npm run check`. Ek canlı/staging kontrolleri:

- Oturumsuz ve oturumlu doğrudan RTDB REST okuma/yazma reddediliyor.
- App Check olmadan API çağrısı reddediliyor.
- Doğrulanmamış e-posta, onaysız UID ve devre dışı hesap erişemiyor.
- Oyuncu yönetici çağrısını doğrudan yapsa bile reddediliyor.
- MFA'sız yönetici ve süresi geçen yönetici oturumu reddediliyor.
- İptal edilen tokenla sonraki çağrı başarısız oluyor.
- Aynı anda oy/kilitleme/kapanış istekleri gönderildiğinde kilit sonrası değişiklik kalmıyor.
- Oyuncu yanıtında başka kullanıcıların ham oyları, kimlikli yorumları veya şifre özetleri yok.
- Kaydetme hatasında başarı mesajı veya demo geçişi yok.
- Şifre sıfırlama, e-posta doğrulama ve TOTP giriş/enrollment gerçek hesaplarla tamamlanıyor.
- GitHub Pages altında yüklenen uygulamada App Check, CSP ve alt dizin yolları çalışıyor.

Bu canlı kontroller yapılmadan “güvenlik tamamlandı” veya “yayına hazır” sonucu çıkarılmamalıdır.

## Resmî kaynaklar

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/totp-mfa
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/database/security
- https://firebase.google.com/support/guides/security-checklist
- https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https

## Bağımlılık notu

Firebase Admin SDK transitif `gaxios` bağımlılığının `uuid` sürümü, GHSA-w5hq-g745-h8pq nedeniyle 11.1.1 ile override edilmiştir. Gaxios yalnızca uyumlu `v4()` API'sini kullanır; yükleme ve UUID üretimi yerelde doğrulanmıştır. Üst bağımlılık düzeltildiğinde override yeniden değerlendirilmelidir. GitHub Actions referansları doğrulanan tam commit SHA'larına sabitlenmiştir.
