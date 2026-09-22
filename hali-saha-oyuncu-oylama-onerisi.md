# Halı Saha Oyuncu Oylama Sistemi — Proje Önerisi

> Bu öneri, geliştirilen `index.html` prototipi esas alınarak hazırlanmıştır. Mevcut işleyiş ile ek geliştirme önerileri ayrı sunulmuştur. İnceleme dosya içeriğine dayanır; canlı veritabanı ve erişim kuralları doğrulanmamıştır.

## 1. Amaç

Halı saha grubundaki oyuncuların birbirlerini oynadıkları mevkiye göre değerlendirebildiği, puanlara ilişkin kısa geri bildirimler paylaşabildiği ve sonuçları ortak bir sistem üzerinden takip edebildiği bir uygulama önerilmektedir.

Sistem; oyuncuların güçlü ve gelişime açık yönlerinin görülmesini, değerlendirmelerin düzenli toplanmasını ve ilerleyen aşamalarda dengeli takım oluşturulmasına veri sağlanmasını amaçlar. Puanlar katılımcı görüşlerini yansıtır; tek başına nesnel performans ölçümü olarak değerlendirilmemelidir.

## 2. Kullanıcı Rolleri

| Rol | Kapsam |
| --- | --- |
| Yönetici | Oyuncu hesaplarını ve mevkileri yönetir, oylamayı açar veya kapatır, katılımı izler, ayrıntılı sonuçları ve yorum sahiplerini görür. |
| Oyuncu | Kendisi dışındaki oyunculara puan verir, isteğe bağlı açıklama yazar ve oylamasını kesinleştirdikten sonra istatistikleri görür. |

Mevkiler: **Kaleci, Defans, Orta Saha ve Forvet.**

## 3. Önerilen Temel Kullanım Akışı

1. Yönetici oyuncu hesaplarını oluşturur ve başlangıç mevkilerini belirler.
2. Oyuncu hesabına giriş yapar. Prototipte varsayılan geçici şifreyle açılan hesaplar, oy vermeden önce şifrelerini değiştirmek zorundadır.
3. Oyuncu kendisi dışındaki herkesi, oynadığı mevkiyi dikkate alarak **1–10 arasında** puanlar.
4. Her puana isteğe bağlı, en fazla **500 karakterlik** açıklama ekleyebilir.
5. Verilen puanlar işlem sırasında kaydedilir. Oyuncu, kendi oylaması kilitlenmeden ve genel oylama kapanmadan önce değerlendirmelerini güncelleyebilir.
6. Herkese oy verdikten sonra **“İstatistikleri gör”** seçeneği etkinleşir.
7. Oyuncu uyarıyı onayladığında kendi oylaması kilitlenir; puanlarını ve açıklamalarını artık değiştiremez.
8. Oyuncu genel sonuçları, mevki bazlı listeleri ve kendisine yazılan açıklamaları görür.
9. Yönetici gerektiğinde oyuncunun kilidini kaldırabilir veya genel oylamayı kapatabilir.

**Mevcut istisna:** Yönetici genel oylamayı kapattığında, kendi değerlendirmelerini tamamlamayan oyuncular da sonuç ekranına geçebilir. Kişisel kilidin kaldırılması ise genel oylama kapalı olduğu sürece oy vermeyi yeniden açmaz.

## 4. Temel İş Kuralları

| Konu | Kural |
| --- | --- |
| Kendi kendine oy | Oyuncu kendisine oy veremez. |
| Puan aralığı | Arayüzde 1–10 arasında tam sayı seçilir. |
| Oy kaydı | Her oyuncu çifti için tek güncel değerlendirme tutulur; değişiklik aynı kaydı günceller. |
| Açıklama | İsteğe bağlıdır ve puanla ilişkilidir. |
| Kişisel kesinleştirme | İstatistikleri açmadan önce uyarı gösterilir ve onay alınır. |
| Genel kapanış | Yönetici kapattığında yeni oy ve değişiklikler arayüzde durdurulur. |
| Kişisel sıfırlama | Oyuncunun verdiği oylar ve açıklamalar silinir, kilidi kaldırılır; kendisine verilen oylar korunur. |
| Oyuncu silme | Hesapla birlikte oyuncunun verdiği ve aldığı oylar temizlenir. |
| Mevki değişikliği | Yönetici mevkileri değiştirebilir; oyuncu da kişisel kilidi yokken kendi mevkisini değiştirebilir. |

## 5. Puanlama ve Sıralama

İlk sürümde anlaşılır bir aritmetik ortalama modeli kullanılması önerilmektedir. Prototipte bu model bulunmaktadır.

```text
Oyuncu ortalaması = Alınan geçerli puanların toplamı / Alınan geçerli oy sayısı
Kişi başına beklenen oy = Oyuncu sayısı − 1
Toplam beklenen oy = Oyuncu sayısı × (Oyuncu sayısı − 1)
Katılım yüzdesi = Girilen oy sayısı / Toplam beklenen oy × 100
```

Örneğin 14 kişilik bir grupta her oyuncu 13 kişiyi değerlendirir ve toplam 182 oy beklenir. Bir oyuncunun aldığı 13 oyun toplamı 104 ise ortalaması **8,00** olur.

- Eksik oylar sıfır puan sayılmaz; ortalama yalnızca alınan geçerli oylarla hesaplanır.
- Hiç oy almayan oyuncunun ortalaması boş gösterilir.
- Genel liste ortalamaya göre yüksekten düşüğe sıralanır.
- Genel listede eşit ortalamalar aynı dereceyi paylaşır; sonraki derece atlanır: **1, 2, 2, 4**. Eşit oyuncuların görüntüleme sırası kullanıcı adına göredir.
- Ekranda ortalamalar iki ondalık basamakla gösterilir; mevcut hesaplamada sıralama yuvarlanmamış değer üzerinden yapılır.
- Mevki ve genel grup ortalamaları, puanı oluşmuş oyuncuların ortalamalarının aritmetik ortalamasıdır.

**Geliştirme önerisi:** Prototipte mevki kartları sıra numarasını ardışık verir. Eşitlik kuralı genel liste ve mevki listelerinde aynı şekilde uygulanmalıdır. Oy sayısı ve katılım oranı, özellikle oylama sürerken puanın yanında görünür tutulmalıdır.

## 6. Ekranlar ve Raporlama

### Oyuncu ekranı

- Mevkiye göre gruplanmış oyuncu kartları.
- 1–10 puan seçimi ve kısa açıklama alanı.
- Tamamlanan ve beklenen oy sayısı ile ilerleme göstergesi.
- Şifre değiştirme ve mevki seçimi.
- Kesinleştirme sonrasında genel sıralama, mevki sıralaması ve toplam puanlar.
- Oyuncuya yazılan açıklamalar ve bunlarla ilişkili puanlar; açıklama sahibinin adı gösterilmez.

### Yönetici ekranı

- Oyuncu oluşturma, adını ve mevkisini değiştirme, şifre işlemleri ve silme.
- Oyuncu bazında oylama ilerlemesi ve kilit durumu.
- Kimlerin kime kaç puan verdiğini gösteren oy matrisi.
- Ortalama, toplam, oy sayısı, en düşük ve en yüksek puanlar.
- Oy veren kişi bilgisiyle açıklama listeleri.
- Genel oylamayı açma, kapatma ve oyları sıfırlama.
- Sonuçları CSV ve JSON olarak dışa aktarma; açıklamaları JSON olarak indirme.
- Veritabanı JSON içeriğini görüntüleme, indirme ve içe aktarma.

Prototipte ayrıca mobil uyumlu görünüm ile açık ve koyu tema bulunmaktadır.

## 7. Görünürlük ve Kesinleştirme Yaklaşımı

Oyunculara gösterilen ekranlarda kimin kime puan verdiği gizlenmeli; yönetici bu ayrıntıları görebilmelidir. Bu nedenle sistem **yöneticiye karşı anonim değildir**. Bu görünürlük kuralı oylama başlamadan önce katılımcılara açıklanmalıdır.

Sonuçları görüntüleyen oyuncunun oylarının kilitlenmesi, gördüğü puanlara göre kendi değerlendirmelerini değiştirmesini sınırlandırmayı amaçlar. Bununla birlikte yönetici kilidi kaldırabilir. Yeniden açma işlemlerinin gerekçesiyle kaydedilmesi önerilir.

**Uygulama notu:** Mevcut dosya veritabanının tamamını tarayıcıya okur ve giriş kontrolünü tarayıcıda yapar. Dolayısıyla bilgilerin ekranda gizlenmesi tek başına veri erişimi gizliliği sağlamaz. Hedef sürümde oyuncuya yalnızca yetkili olduğu verilerin gönderilmesi ve yazma kurallarının veri katmanında uygulanması gerekir.

## 8. Mevcut Teknik Yapı

| Bileşen | Prototipteki yapı |
| --- | --- |
| Arayüz | Tek HTML dosyası içinde CSS ve JavaScript |
| Ortak veri | Firebase Realtime Database ile REST istekleri |
| Demo | Tarayıcıda yerel JSON verisi |
| Temel kayıtlar | `config`, `admins`, `users`, `votes` |
| Değerlendirme | Oy veren ve oy alan kimliğine bağlı `puan`, `aciklama`, `ts` alanları |
| Sonuç hesabı | Tarayıcıda mevcut oylar üzerinden hesaplama |

Demo verisi yalnızca kullanılan tarayıcıda tutulur. Prototipte veri yenileme isteklerle yapılır; tüm cihazlara otomatik canlı güncelleme sağlayan sürekli dinleme bulunmaz.

## 9. Sonraki Geliştirme Önerileri

Bu bölümdeki maddeler mevcut prototipte tamamlanmış özellikler olarak değerlendirilmemelidir.

| Öncelik | Öneri | Beklenen katkı |
| --- | --- | --- |
| 1 | Kimlik doğrulama, rol kontrolü ve veri erişim sınırlarını veri katmanında uygulama | Oyuncunun yalnızca kendi yetkisi kapsamında işlem yapması |
| 1 | Puan aralığı, kendi kendine oy yasağı ve kilit kontrollerini her yazmada doğrulama | Arayüz dışından veya eski açık ekranlardan yapılan işlemlerde tutarlılık |
| 1 | Maç veya oylama dönemi kaydı ekleme | Geçmiş oyları silmeden yeni değerlendirme başlatma |
| 1 | Dönem başında katılımcı listesini ve mevkileri sabitleme | Beklenen oy sayısının ve değerlendirme bağlamının dönem içinde değişmemesi |
| 1 | Yeniden açma, sıfırlama ve içe aktarma işlemlerinin kaydını tutma | Yönetici müdahalelerinin izlenebilmesi |
| 2 | Bağlantı kesildiğinde ortak sisteme kaydedilmeyen işlemleri oyuncuya açıkça gösterme | Yerel demo kaydı ile ortak kayıt arasında karışıklığı önleme |
| 2 | Değerlendirme ölçütleri için kısa puan rehberi ekleme | Katılımcıların benzer ölçütlerle puan vermesi |
| 2 | Mevki sıralamasında eşitlik davranışını standartlaştırma | Sonuç ekranları arasında tutarlılık |
| 3 | Maç ve dönem bazında gelişim grafikleri | Oyuncunun zaman içindeki değişimini izleme |
| 3 | Puan ve mevki dağılımıyla dengeli takım önerisi | Takım oluştururken yöneticiye karar desteği |

## 10. Kabul Ölçütleri

Hedef sürüm aşağıdaki senaryolarla doğrulanmalıdır:

1. Oyuncu kendisine, başka bir oyuncu adına veya izin verilen aralık dışında oy yazamaz.
2. Bir değerlendirmeyi güncellemek oy sayısını artırmaz.
3. Oylama açıkken tüm oyuncular değerlendirilmeden kişisel kesinleştirme yapılamaz.
4. Kesinleştirme ve genel kapanış, doğrudan veri yazma girişimlerinde de uygulanır.
5. Oyuncu diğer oyuncuların ham oy kayıtlarına ve hesap doğrulama bilgilerine erişemez.
6. Kişisel oy sıfırlama, ilgili oyuncuya başkalarının verdiği oyları korur.
7. Eksik oylar ortalamayı sıfır puan gibi düşürmez; hiç oy almayanlar ayrı gösterilir.
8. Genel ve mevki bazlı sıralamalarda eşitlik davranışı tutarlıdır.
9. Başarısız kayıt oyuncuya başarılı işlem olarak gösterilmez.
10. Dışa aktarılan sonuçlar, aynı anda hesaplanan ekran sonuçlarıyla uyuşur.

## 11. Önerilen İlk Sürüm Kapsamı

İlk sürümün; **oyuncu yönetimi, mevki bazlı tek puanlı değerlendirme, isteğe bağlı yorum, kişisel kesinleştirme, genel kapanış, sıralama ve sonuç dışa aktarma** özellikleriyle sunulması önerilir.

Mevcut prototip bu işlevlerin arayüz temelini sağlamaktadır. Sonraki geliştirme adımı, erişim ve kayıt kurallarını veri katmanında uygulamak ve oylamaları dönemler halinde saklamak olmalıdır. Çok ölçütlü puanlama, gelişim grafikleri ve dengeli takım önerileri daha sonraki aşamada ele alınabilir.

## 12. GitHub Yayını İçin Güvenlik Tasarımı

**Durum:** Bu bölüm uygulanacak güvenlik şartnamesidir. Mevcut HTML, GitHub yayını, Firebase Authentication ve canlı veritabanı kuralları bu belge hazırlanırken değiştirilmemiştir. “Tüm önlemler uygulandı” veya “şifre kırılamaz” iddiası taşımaz.

GitHub üzerinden yayının GitHub Pages ile yapıldığı varsayılmıştır. GitHub Pages statik dosyaları yayımlar; kimlik doğrulama ve yetkili veri işlemleri için ayrı bir güvenilir servis gerekir. HTTPS zorunlu tutulmalıdır. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [HTTPS ayarı](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

### 12.1. Dosyada doğrulanan bulgular

| Öncelik | Kodda görülen durum | Yapılacak değişiklik |
| --- | --- | --- |
| Kritik | `refresh()` kökten `dbRead('')` çağırır; `boot()` bunu giriş öncesinde çalıştırır. Hesaplar, şifre özetleri ve oylar aynı ağaçtadır. | Kök okuma kaldırılacak. İstemciye şifre veya şifre özeti gönderilmeyecek. |
| Kritik | `doLogin()` şifre özetlerini tarayıcıda karşılaştırır; rol `S.session` içinde belirlenir. | Firebase Authentication kimliği ve sunucu tarafında yetkilendirme kullanılacak. |
| Kritik | `refresh()` yönetici yoksa sabit şifreli yönetici hesabı oluşturur. | Otomatik yönetici oluşturma kaldırılacak; ilk yönetici güvenilir yönetim ortamından atanacak. |
| Yüksek | Ortak geçici oyuncu şifresi ve en az dört karakterli şifre akışı vardır. | Ortak şifre kaldırılacak; kişiye özel hesap etkinleştirme/şifre belirleme akışı uygulanacak. |
| Kritik | `DB.secret` tarayıcı ayarlarına alınabilir, yerel depolamaya yazılır ve istek URL'sine eklenir. | Database secret ve ayrıcalıklı token giriş alanları kaldırılacak. Kullanılmış gizli anahtarlar iptal edilip yenilenecek. |
| Kritik | Oylama kilidi, genel kapanış ve kullanıcı yetkisi esas olarak arayüz üzerinden kontrol edilir. | Her işlemde güncel sunucu durumu ile kimlik, rol, sahiplik ve kilit doğrulanacak. |
| Yüksek | Bağlantı hatasında otomatik yerel demo moduna geçilir. | Canlı sürümde işlem durdurulacak; başarısız kayıt başarılı gibi gösterilmeyecek. |
| Yüksek | Yönetici ekranından tüm veritabanı JSON ile değiştirilebilir. | Genel amaçlı kök yazma kaldırılacak; kapsamı sınırlı, doğrulanan ve kayıt altına alınan işlemler kullanılacak. |
| Orta | CSV alanlarının tırnaklanması formül yorumlanmasını tek başına engellemez. | Kullanıcı kaynaklı hücrelere CSV formül enjeksiyonu önlemi uygulanacak. |

Bunlar dosya incelemesinden elde edilen bulgulardır. Canlı Firebase kuralları görülmediği için verilerin internete açık olduğu veya bir sızıntı yaşandığı ileri sürülmemektedir.

### 12.2. Hedef mimari

- **GitHub Pages:** Yalnızca arayüz ve herkese açık uygulama yapılandırması.
- **Firebase Authentication:** Giriş, hesap doğrulama, şifre belirleme/değiştirme, sıfırlama ve çok faktörlü doğrulama.
- **Güvenilir API / Cloud Functions:** Oy verme, kesinleştirme, sonuç okuma ve yönetici işlemleri. Kimlik, rol ve iş kuralları burada doğrulanır.
- **Realtime Database:** İstemciden doğrudan erişim kapalı; bu tasarımda veri işlemleri yalnızca yetkili sunucu üzerinden gerçekleştirilir.

Callable Functions kimlik ve App Check tokenlarını işleyebilir; uygulamanın ayrıca kullanıcı yetkilerini kontrol etmesi gerekir. [Callable Functions](https://firebase.google.com/docs/functions/callable).

Bu mimaride kullanılacak istemci erişim kuralı:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

**Bu kural mevcut HTML ile uyumlu değildir:** Uygulanırsa eski uygulamanın veritabanı erişimi kesilir. Güvenli API ve yeni giriş akışıyla birlikte devreye alınmalıdır. Alt yollarda erişim veren eski kurallar bırakılmamalıdır. Yetkili Admin SDK erişimi bu kurallarla sınırlandırılmadığı için API'nin her işlemde yetkilendirme yapması zorunludur. [Realtime Database kuralları](https://firebase.google.com/docs/database/security).

### 12.3. Şifre ve hesap güvenliği gereksinimleri

1. Özel SHA-256 şifre karşılaştırma kodu kaldırılacak; şifreler uygulamanın `users` veya `admins` kayıtlarında tutulmayacak.
2. E-posta/şifre kullanılacaksa projeye özel politika **en az 15 karakter** ve uzun parola cümlelerini destekleyecek şekilde ayarlanacak. Bu bir proje tercihidir; yalnızca HTML `minlength` kontrolüne bırakılmayacak. Firebase politika modu sunucuda zorunlu uygulanacak.
3. Şifre yöneticisi, otomatik doldurma ve yapıştırma engellenmeyecek. Kullanıcılardan başka hesaplarda kullandıkları şifreleri kullanmamaları istenecek.
4. Yönetici kullanıcı şifresini göremeyecek; ortak geçici şifre dağıtımı yerine tek kullanımlık şifre belirleme/sıfırlama akışı kullanılacak.
5. E-posta adresinden hesap varlığını öğrenmeyi sınırlayan koruma etkinleştirilecek. Giriş ve sıfırlama yanıtları hesap varlığını ifşa etmeyecek. [Firebase parola politikası ve hesap keşfi koruması](https://firebase.google.com/docs/auth/web/password-auth).
6. Uygulama yöneticilerinde TOTP çok faktörlü doğrulama zorunlu olacak. Bunun için Firebase Authentication with Identity Platform gereksinimi ve proje koşulları dağıtımdan önce doğrulanacak. İkinci faktör tamamlanmadan yönetici işlemleri kabul edilmeyecek; kurtarma süreci ayrıca tanımlanacak. [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa).
7. GitHub ve Google Cloud/Firebase proje sahiplerinin hesaplarında da çok faktörlü doğrulama etkin olacak.
8. Hesap oluşturmak uygulamaya üyelik sağlamayacak. Yalnızca yönetici tarafından onaylanan aktif oyuncular uygulama verisine erişebilecek.
9. E-posta doğrulaması ve aktif üyelik kontrolü API'de yapılacak; kullanıcı kendi üyeliğini veya yönetici rolünü değiştiremeyecek.
10. Şifre, şifre özeti, doğrulama kodu, sıfırlama bağlantısı ve erişim tokenı günlük kayıtlarına yazılmayacak.

### 12.4. Deneme saldırıları ve kötüye kullanım

- Firebase kimlik doğrulama uç noktalarının kotaları küçük kullanıcı grubuna uygun sınırlandırılacak; başarısız giriş artışları izlenecek. Sadece uygulama API'sini sınırlamak, ayrı Authentication uç noktasını korumaz.
- Oy verme, sonuç sorgulama ve yönetici işlemlerine sunucu tarafında kullanıcı/işlem bazlı hız sınırı konulacak. IP temelli ek sınırlar ortak ağdaki oyuncuları gereksiz engellemeyecek şekilde uygulanacak.
- Sadece tarayıcıda bekletme veya düğmeyi devre dışı bırakma güvenlik kontrolü sayılmayacak.
- App Check, desteklenen servislerde kurulum ve test sonrasında zorunlu hale getirilecek. Callable Functions için `enforceAppCheck` kullanılacak. App Check kimlik doğrulama, yetki denetimi veya hız sınırının yerine geçmeyecek. [App Check uygulaması](https://firebase.google.com/docs/app-check/cloud-functions).
- Şüpheli trafik, hata oranları ve kaynak tüketimi için alarm kurulacak. Fonksiyon ölçeklenmesine sınır konulacak. Bütçe alarmının tek başına harcamayı durdurmadığı dikkate alınacak. [Firebase güvenlik kontrol listesi](https://firebase.google.com/support/guides/security-checklist).

### 12.5. Oturum ve yetki kontrolleri

- API her istekte doğrulanmış kullanıcı kimliğini esas alacak. İstemcinin gönderdiği `uid`, `role` veya `isAdmin` yetki kaynağı olmayacak.
- Yönetici yetkisi güvenilir sunucu tarafından atanacak; yetki kaldırma işlemi sonraki hassas istekte etkili olacak.
- Hesap kapatma veya ele geçirilme şüphesinde oturumlar iptal edilecek; sunucu iptal edilmiş oturumları reddedecek.
- Şifre, e-posta ve önemli yönetim işlemlerinde yakın zamanda yeniden doğrulama istenecek. Yalnızca eski tokenın varlığı yeterli olmayacak. [Oturum yönetimi](https://firebase.google.com/docs/auth/admin/manage-sessions).
- Proje tercihi olarak yönetici için 15 dakika hareketsizlik süresi belirlenecek ve sunucuda uygulanacak. Tarayıcı sayacının kaldırılması bu sınırı aşmaya yetmeyecek.
- Çıkışta arayüzdeki özel veriler temizlenecek. Tokenlar uygulamanın özel `localStorage` alanlarına veya URL'lerine yazılmayacak; kimlik SDK'sının oturum yönetimi kullanılacak.
- Oturum çerezi kullanan bir API seçilirse `HttpOnly`, `Secure`, uygun `SameSite` ve CSRF kontrolü uygulanacak. Bearer token kullanan tasarımla çerez tasarımı birbirine karıştırılmayacak.

### 12.6. Oy ve sonuç bütünlüğü

Sunucu şu koşulların tamamını doğrulayacak:

- Oy veren aktif ve onaylı kullanıcıdır; hedef oyuncu ilgili dönem kadrosundadır.
- Kullanıcı kendisine oy vermemektedir.
- Puan tam sayıdır ve 1–10 aralığındadır; açıklama en fazla 500 karakterdir.
- Oylama açıktır ve kullanıcının kişisel kilidi yoktur.
- İşlem zamanı sunucuda üretilmiştir; istemci zamanına güvenilmez.
- Kilitleme, oy verme ve genel kapanış aynı tutarlılık mekanizmasıyla işlenir. Eşzamanlı istekler kilit sonrası oyu değiştiremez.
- Kesinleştirme isteğinde eksik oy kontrolü sunucuda tekrar yapılır.
- Oyuncu yalnızca kendi verdiği oyları, izin verilen sonuçları ve kimliği çıkarılmış kendi yorumlarını alır. Tüm oy matrisi tarayıcıya gönderilmez.
- Oylama sürerken sonuç görme şartı API'de de uygulanır; arayüzü atlayarak sonuç alınamaz.
- Oyuncular toplam puan, ortalama veya sıralamayı doğrudan yazamaz; sonuçları sunucu hesaplar.
- Silme/sıfırlama işlemlerinin kapsamı açıkça gösterilir, tekrar doğrulama istenir ve denetim kaydı tutulur.

Küçük gruplarda sonuç farklarından oy tahmini yapılabilir. Daha güçlü mahremiyet istenirse oyunculara sonuçlar yalnızca genel kapanıştan sonra açılmalıdır. Bu, mevcut “kişisel kesinleştirme sonrası görüntüleme” kuralına alternatif bir ürün kararıdır.

### 12.7. Tarayıcı ve GitHub yayın güvenliği

- Kullanıcı adı ve yorumlar metin olarak işlenecek; kullanıcı girdisi çalıştırılabilir HTML içine yerleştirilmeyecek. Mevcut `esc()` yaklaşımı korunup yeni ekranlarda da uygulanacak.
- JavaScript ve CSS ayrı dosyalara alınacak; mümkün olduğunca dar kaynak listeli Content Security Policy uygulanacak. `unsafe-eval` kullanılmayacak; inline kodlar kaldırılacak veya uygun hash/nonce tasarlanacak.
- GitHub Pages üzerinde HTML meta CSP uygulanabilir; fakat `frame-ancestors` gibi HTTP yanıt başlığı gerektiren korumalar bununla sağlanmış sayılmayacak. Tam başlık kontrolü gerekiyorsa başlık ekleyebilen bir yayın katmanı kullanılacak.
- Referrer politikası ve hassas API yanıtlarında önbellek kontrolü tanımlanacak. CORS yalnızca gereken originlere açılacak; CORS yetkilendirme yerine geçmeyecek.
- GitHub Pages için HTTPS zorunlu olacak; HTTP kaynak kullanılmayacak.
- Depoya servis hesabı JSON'u, database secret, özel anahtar, gerçek veri yedeği veya `.env` sırrı eklenmeyecek. Build sırasında JavaScript'e gömülen değerlerin gizli kalmadığı kabul edilecek.
- Firebase web yapılandırmasındaki API anahtarı tek başına gizli kimlik bilgisi değildir. Gerçek sırlarla karıştırılmayacak; erişim kimlik ve yetki kontrollerine dayanacak. [Firebase anahtar güvenliği](https://firebase.google.com/support/guides/security-checklist).
- Depo ve yayın paketleri gizli bilgi taramasından geçirilecek; yanlışlıkla yayımlanmış sırlar yalnızca Git geçmişinden silinmeyecek, ayrıca iptal edilecek.
- Bağımlılık sürümleri kilitlenecek, güvenlik güncellemeleri izlenecek. CI yetkileri en az ayrıcalıkla sınırlandırılacak; güvenilmeyen PR koduna yayın sırları verilmeyecek.
- CSV dışa aktarımında kullanıcı metninin formül olarak yorumlanması engellenecek. JSON içe aktarmada şema, boyut ve izin verilen alanlar kontrol edilecek.

### 12.8. Güvenli geçiş sırası

1. Canlı depo, yayın yöntemi, Firebase kuralları ve hesap ayarları tespit edilir. İnceleme sırasında kullanıcıların ham şifreleri veya özel anahtarları istenmez.
2. Yetkili ortamda erişimi kısıtlı veri yedeği alınır. Açık erişim doğrulanırsa geçici erişim kapatma ile olası sızıntı sınırlandırılır; eski uygulamanın bu sırada çalışmayacağı belirtilir.
3. Ayrı test ortamında Authentication, üyelik ve yönetici rolü kurulur.
4. Mevcut oyuncu kimlikleri ile yeni Authentication UID'leri eşlenir. Oy veren ve oy alan referansları birlikte dönüştürülür; kayıt sayıları ve puanlar karşılaştırılır.
5. Eski şifreler taşınmaz. Kullanıcılar yeni şifre belirler; uygulama verisindeki `passHash` alanları kaldırılır. Eski yedeklerin erişimi ve saklama süresi ayrıca yönetilir.
6. Güvenilir API, veri kuralları ve yeni arayüz birlikte test edilir. Yayın sırasında eski istemci isteklerinin reddedildiği doğrulanır.
7. Yeni API, kapalı doğrudan veri erişimi ve yeni arayüz koordineli yayımlanır. Geri dönüş planı hiçbir aşamada herkese açık kuralları yeniden etkinleştirmez.
8. Kullanılmış ayrıcalıklı anahtarlar yenilenir; eski oturumlar gerektiğinde iptal edilir. Canlı alarm ve denetim kayıtları kontrol edilir.

### 12.9. Yayın öncesi güvenlik kabul testleri

Aşağıdakiler bu belge hazırlanırken çalıştırılmış testler değildir; uygulanacak sürüm için yayın koşullarıdır.

| Test | Beklenen sonuç |
| --- | --- |
| Oturumsuz kök veritabanı isteği | Erişim reddedilir. |
| Oturumlu istemciden doğrudan RTDB okuma/yazma | API üzerinden erişim tasarımında reddedilir. |
| Tarayıcıdan yönetici rolü taklidi | Yönetici API işlemi reddedilir. |
| Başka kullanıcı adına oy | Reddedilir. |
| Onaysız yeni Authentication hesabıyla veri erişimi | Reddedilir. |
| Kilit sonrası doğrudan veya eşzamanlı oy isteği | Reddedilir; kesinleşen oy korunur. |
| Kapanıştan önce açılmış eski ekrandan oy | Güncel sunucu kapanış kontrolüyle reddedilir. |
| Eksik oyla kesinleştirme | Reddedilir. |
| Geçersiz puan veya 500 karakteri aşan açıklama | Reddedilir. |
| Oyuncunun diğer kişilerin ham oylarını istemesi | Reddedilir; yanıt verisinde de bulunmaz. |
| Yorum veya kullanıcı adında HTML/script içeriği | Çalıştırılmaz; metin olarak gösterilir. |
| Tekrarlayan istekler | Belirlenen sunucu hız sınırı uygulanır. |
| İptal edilmiş oturum veya devre dışı kullanıcı | Özel veri ve işlemlere erişemez. |
| MFA tamamlanmadan yönetici işlemi | Reddedilir. |
| Ağ kesintisinde kayıt | Açık hata gösterilir; başarı veya gizli demo geçişi yoktur. |
| Yayın çıktısında şifre özeti veya ayrıcalıklı sır taraması | Hiçbir eşleşme olmamalıdır. |

**Tamamlanma ölçütü:** Yeni kodun yazılması tek başına yeterli değildir. Authentication ayarları, API, canlı kurallar ve yayın ayarları uygulanıp bu testler geçmeden sistem güvenli yayına hazır olarak işaretlenmez.

## 22 Eylül 2026 güvenlik güncellemesi

Eski Firebase/istemcide parola kontrolü önerileri artık geçerli değildir. Güncel uygulama Supabase Auth ve sunucuda PostgreSQL RPC yetkilendirmesi kullanır. Kurulum ve sınırlamalar için `SECURITY-SETUP.md` esas alınmalıdır.
