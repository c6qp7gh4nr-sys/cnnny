/*
 * TKGM CORS Proxy — Cloudflare Worker
 * --------------------------------------------------------------
 * Neden gerekli?
 *   TKGM (Tapu-Kadastro) API'si tarayıcıya CORS izni vermez ve ayrıca
 *   kendi sitesinden gelmeyen (Referer/Origin'i parselsorgu.tkgm.gov.tr
 *   olmayan) istekleri 403 ile reddeder. Tarayıcı fetch'i bu başlıkları
 *   gönderemediği için genel proxy'ler çalışmaz. Bu Worker, isteği
 *   doğru başlıklarla iletir ve CORS başlığı ekleyerek geri döner.
 *
 * Kurulum (iPad/telefon/bilgisayar — tamamı tarayıcıdan):
 *   1) dash.cloudflare.com → ücretsiz hesap aç / giriş yap
 *   2) Sol menü: "Workers & Pages" → "Create application" → "Create Worker"
 *   3) Bir isim ver (ör. tkgm-proxy) → "Deploy"
 *   4) "Edit code" → açılan editördeki TÜM kodu sil → bu dosyayı yapıştır
 *      → sağ üstten "Deploy"
 *   5) Worker adresini kopyala:  https://tkgm-proxy.<hesabın>.workers.dev
 *   6) Mimari Tasarım uygulamasında:
 *        ⚙︎ Bağlantı ayarları → "Özel CORS proxy" alanına şunu yaz:
 *        https://tkgm-proxy.<hesabın>.workers.dev/?url=
 *      (sonundaki  ?url=  önemli)
 *   7) "TKGM'den Parsel Sorgula" — il listesi artık gelir.
 * --------------------------------------------------------------
 */
export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return new Response("Kullanım: ?url=<hedef-adres>", { status: 400, headers: cors });
    }
    // Güvenlik: yalnız TKGM alan adlarına izin ver
    let host;
    try { host = new URL(target).hostname; } catch { return new Response("geçersiz url", { status: 400, headers: cors }); }
    if (!/\.tkgm\.gov\.tr$/.test(host)) {
      return new Response("yalnız *.tkgm.gov.tr adreslerine izin var", { status: 403, headers: cors });
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9",
          "Referer": "https://parselsorgu.tkgm.gov.tr/",
          "Origin": "https://parselsorgu.tkgm.gov.tr",
        },
      });
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...cors,
          "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (e) {
      return new Response("proxy hatası: " + e, { status: 502, headers: cors });
    }
  },
};
