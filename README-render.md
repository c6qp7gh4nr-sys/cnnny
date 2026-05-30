# Kurumsal Post Üretici (Gimat Yapı | ANGiM)

İki kullanım yolu var:

## 1) Tarayıcı aracı — `instagram-formatter.html`
Cihazında aç, foto/metin bırak, anında indir. Foto cihazdan çıkmaz.

## 2) Sunucu render — `render_post.py` (Claude üretir)
Fotoğrafları repoya koyarsın, Claude hazır PNG'leri `output/` içine üretir.

### Klasör düzeni
```
assets/logo.png        ← Gimat | ANGiM logosu (bir kez ekle; beyaz kenar otomatik kırpılır)
assets/fonts/Archivo.ttf
inputs/                ← buraya fotoğraf ve metin dosyalarını koy
output/                ← üretilen görseller
```

### Komutlar
```bash
# Metin kartı (lacivert zemin)
python3 render_post.py --mode text --textfile inputs/metin.txt --out output/1.png

# Lacivert zeminli fotoğraf
python3 render_post.py --mode navy --photo inputs/foto.jpg --focus 0.4 --out output/2.png

# Çerçeveli (beyaz zemin) fotoğraf
python3 render_post.py --mode frame --photo inputs/foto.jpg --out output/3.png
```
`--size`: `4:5` (vars.) · `1:1` · `9:16` &nbsp;|&nbsp; `--focus`: 0.0 (üst) – 1.0 (alt) kırpma.

### Logo
`assets/logo.png` varsa alt bantta o kullanılır. Yoksa metin-logo çizilir.
Logoyu eklemek için dosyayı repoya koyup `claude/instagram-post-formatter-31Xik` dalına push et.
