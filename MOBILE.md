# Mimari Tasarım — iOS & Android (Capacitor)

Bu repo, web uygulamasını **Capacitor** ile gerçek iOS/Android uygulamasına
çevirecek şekilde hazırlandı. Web kodu native bir WebView içinde çalışır; App
Store ve Play Store'a yüklenebilir.

> Bu sunucuda (Linux, ağ kapalı) iOS derlenemez. Aşağıdaki adımları **kendi
> bilgisayarında** (iOS için **Mac + Xcode** şart) çalıştır.

## Gereksinimler
- **Node.js 18+** ve npm
- **Android:** Android Studio (SDK + JDK 17)
- **iOS:** macOS + **Xcode** + (mağaza için) **Apple Developer hesabı $99/yıl**, CocoaPods (`sudo gem install cocoapods`)
- Mağaza: **Google Play Console** ($25 tek sefer), **App Store Connect** (Apple hesabıyla)

## Kurulum (tek seferlik)
```bash
# 1) bağımlılıkları kur
npm install

# 2) web çıktısını (www/) üret + native projeleri ekle
npm run cap:add:android      # android/ klasörünü oluşturur
npm run cap:add:ios          # ios/ klasörünü oluşturur (yalnız Mac'te)

# 3) uygulama ikonları + splash üret
#    assets/icon.png (1024x1024) ve assets/splash.png (2732x2732) repoda HAZIR.
npx @capacitor/assets generate --iconBackgroundColor '#1f6f5c' --splashBackgroundColor '#eef2f0'
```

## Her güncellemede (web kodunu değiştirince)
```bash
npm run cap:sync             # www/ yeniden üretir + native projelere kopyalar
# sonra:
npm run cap:android          # Android Studio'da açar
npm run cap:ios              # Xcode'da açar (Mac)
```
`mimari-tasarim.html` tek kaynaktır; `cap:sync` onu `www/index.html`'e
dönüştürür (sayfa CSP meta'sı native kabuk için otomatik çıkarılır).

## Derleme & mağaza
- **Android:** Android Studio → Build → Generate Signed Bundle/APK → `.aab`
  üret → Play Console'a yükle. (İlk seferde imza anahtarı oluştur.)
- **iOS:** Xcode → Signing & Capabilities'te Team seç → Product → Archive →
  Distribute App → App Store Connect.

## İzin metinleri (kamera/konum)
Uygulama OCR için kamera/galeri ve koordinat için konum kullanabilir:
- **iOS** `ios/App/App/Info.plist`:
  - `NSCameraUsageDescription` = "İmar belgesi fotoğrafı çekmek için"
  - `NSPhotoLibraryUsageDescription` = "İmar belgesi seçmek için"
  - `NSLocationWhenInUseUsageDescription` = "Parsel konumunu bulmak için"
- **Android** `android/app/src/main/AndroidManifest.xml`:
  - `<uses-permission android:name="android.permission.INTERNET"/>` (varsayılan var)
  - konum gerekiyorsa `ACCESS_FINE_LOCATION`

## Notlar
- **CORS / backend:** Uygulamanın worker'ı ve kullandığı CORS-proxy'leri zaten
  `Access-Control-Allow-Origin: *` gönderir; bu yüzden native WebView'de standart
  `fetch` ile giriş/arşiv ve TKGM sorguları sorunsuz çalışır. (CapacitorHttp
  eklentisi `fetch`'i değiştirip backend isteğini bozduğu için kapalı tutuldu.)
- **Çevrimdışı:** three.js/Leaflet/Tesseract şu an CDN'den yüklenir (internet
  ister). Tamamen çevrimdışı istersek bu kütüphaneleri `www/`'e gömeriz (ayrı iş).
- **Backend:** giriş/arşiv için Cloudflare Worker aynen kullanılır (adres
  `mimari-tasarim.html` içinde sabit). Native'de de çalışır.
- `appId`'yi (`tr.angim.mimari`) ve `appName`'i `capacitor.config.json`'dan
  değiştirebilirsin (mağaza paket adı budur).
