#!/usr/bin/env python3
"""
Kurumsal Instagram post üreteci — Gimat Yapı | ANGiM kimliği.
Üç şablon: frame (çerçeveli foto) · navy (lacivert zeminli foto) · text (metin kartı).
Sabit alt bant: altın çizgi + beyaz logo bandı. Lacivert diyagonal zemin.

Kullanım:
  python3 render_post.py --mode text --textfile metin.txt --out output/metin.png
  python3 render_post.py --mode navy --photo inputs/foto.jpg --out output/foto.png
  python3 render_post.py --mode frame --photo inputs/foto.jpg --focus 0.4 --out output/foto.png
Logo: assets/logo.png varsa kullanılır, yoksa metin-logo çizilir.
"""
import argparse, math, os
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = os.path.join(os.path.dirname(__file__), "assets", "fonts", "Archivo.ttf")
LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "logo.png")

NAVY        = (21, 37, 156)
NAVY_DARK   = (9, 17, 78)
NAVY_BRIGHT = (40, 62, 196)
GOLD_D = (156, 123, 46)
GOLD   = (212, 175, 90)
GOLD_L = (243, 226, 168)
WHITE  = (255, 255, 255)
RED    = (226, 35, 26)
LOGO_NAVY = (31, 56, 100)

PRESETS = {"4:5": (1080, 1350), "1:1": (1080, 1080), "9:16": (1080, 1920)}


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def footer_h(h):
    return round(h * 0.11)


# ---------- backgrounds ----------
def navy_background(W, H):
    """Lacivert diyagonal gradyan + diyagonal şeritler."""
    diag = int(math.hypot(W, H)) + 8
    base = Image.new("RGB", (diag, diag))
    d = ImageDraw.Draw(base)
    for y in range(diag):
        t = y / diag
        if t < 0.45:
            col = lerp(NAVY_DARK, NAVY_BRIGHT, t / 0.45)
        else:
            col = lerp(NAVY_BRIGHT, NAVY_DARK, (t - 0.45) / 0.55)
        d.line([(0, y), (diag, y)], fill=col)
    # diyagonal şeritler (dikey çiz → döndür)
    stripe = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stripe)
    gap = int(W * 0.24)
    sw = int(W * 0.115)
    x = -diag
    while x < diag * 2:
        sd.rectangle([x, 0, x + sw, diag], fill=(120, 150, 255, 26))
        sd.rectangle([x + sw, 0, x + sw + int(sw * 0.45), diag], fill=(6, 12, 60, 30))
        x += gap
    base = Image.alpha_composite(base.convert("RGBA"), stripe)
    base = base.rotate(38, resample=Image.BICUBIC, expand=False)
    left = (diag - W) // 2
    top = (diag - H) // 2
    return base.crop((left, top, left + W, top + H)).convert("RGB")


def corner_accents(img, W, bodyH):
    cx, cy = int(W * 0.30), int(bodyH * 0.12)
    ov = Image.new("RGBA", (W, bodyH), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    nd = NAVY_DARK + (230,)
    d.polygon([(0, 0), (cx, 0), (0, cy)], fill=nd)
    d.polygon([(W, 0), (W - cx, 0), (W, cy)], fill=nd)
    d.polygon([(0, bodyH), (cx, bodyH), (0, bodyH - cy)], fill=nd)
    d.polygon([(W, bodyH), (W - cx, bodyH), (W, bodyH - cy)], fill=nd)
    g = GOLD + (255,)
    d.line([(cx, 0), (0, cy)], fill=g, width=3)
    d.line([(W - cx, 0), (W, cy)], fill=g, width=3)
    d.line([(cx, bodyH), (0, bodyH - cy)], fill=g, width=3)
    d.line([(W - cx, bodyH), (W, bodyH - cy)], fill=g, width=3)
    img.paste(Image.alpha_composite(img.convert("RGBA").crop((0, 0, W, bodyH)), ov).convert("RGB"), (0, 0))


def gold_line(img, y, W, height=7):
    bar = Image.new("RGB", (W, height))
    d = ImageDraw.Draw(bar)
    for x in range(W):
        t = x / W
        col = lerp(GOLD_D, GOLD_L, t / 0.5) if t < 0.5 else lerp(GOLD_L, GOLD_D, (t - 0.5) / 0.5)
        d.line([(x, 0), (x, height)], fill=col)
    img.paste(bar, (0, y))


# ---------- photo ----------
def cover(img, photo, box):
    x, y, w, h = box[:4]
    focus = box[4] if len(box) > 4 else 0.5
    iw, ih = photo.size
    scale = max(w / iw, h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    ph = photo.resize((nw, nh), Image.LANCZOS)
    ox = x + (w - nw) // 2
    oy = y + int((h - nh) * focus)
    img.paste(ph, (ox, oy), ph if ph.mode == "RGBA" else None)


# ---------- logo footer ----------
def load_logo():
    if not os.path.exists(LOGO_PATH):
        return None
    lg = Image.open(LOGO_PATH).convert("RGBA")
    # beyaz / şeffaf kenar boşluklarını otomatik kırp
    px = lg.load()
    w, h = lg.size
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 25 and not (r > 244 and g > 244 and b > 244):
                mp[x, y] = 255
    bbox = mask.getbbox()
    if bbox:
        pad = 6
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        lg = lg.crop(bbox)
    return lg


def draw_footer(img, W, H):
    fh = footer_h(H)
    fy = H - fh
    gold_line(img, fy - 7, W)
    ImageDraw.Draw(img).rectangle([0, fy, W, H], fill=WHITE)
    logo = load_logo()
    pad = int(fh * 0.26)
    max_h = fh - pad * 2
    max_w = int(W * 0.62)
    if logo:
        lw, lh = logo.size
        s = min(max_w / lw, max_h / lh)
        nw, nh = int(lw * s), int(lh * s)
        logo = logo.resize((nw, nh), Image.LANCZOS)
        img.paste(logo, ((W - nw) // 2, fy + (fh - nh) // 2), logo)
    else:
        draw_logo_fallback(img, W // 2, fy + fh // 2, fh)


def draw_logo_fallback(img, cx, cy, fh):
    d = ImageDraw.Draw(img)
    s = int(fh * 0.36)
    fG = font(s, "Black")
    fY = font(int(s * 0.34), "Bold")
    fA = font(s, "ExtraBold")
    # Gimat (kırmızı), sağ hizalı
    gw = d.textlength("Gimat", font=fG)
    gx = cx - 30 - gw
    d.text((gx, cy - s * 0.55), "Gimat", font=fG, fill=RED)
    # çatı çizgisi
    d.line([(gx + s * 0.2, cy - s * 0.45), (gx + gw * 0.55, cy - s * 0.95),
            (gx + gw, cy - s * 0.45)], fill=RED, width=max(3, s // 12), joint="curve")
    # YAPI (Gimat altında ortalı)
    yw = d.textlength("Y A P I", font=fY)
    d.text((gx + (gw - yw) / 2, cy + s * 0.2), "Y A P I", font=fY, fill=(28, 28, 28))
    # ayraç
    d.line([(cx, cy - s * 0.7), (cx, cy + s * 0.7)], fill=(150, 160, 190), width=3)
    # ANGiM (lacivert)
    d.text((cx + 30, cy - s * 0.55), "ANGiM", font=fA, fill=LOGO_NAVY)


# ---------- text ----------
def wrap(d, text, fnt, maxw):
    out = []
    for para in text.split("\n"):
        para = para.strip()
        if para == "":
            out.append("")
            continue
        words, cur = para.split(), ""
        for w in words:
            t = (cur + " " + w).strip()
            if d.textlength(t, font=fnt) <= maxw or not cur:
                cur = t
            else:
                out.append(cur); cur = w
        if cur:
            out.append(cur)
    return out


def render_text(img, W, bodyH, text):
    d = ImageDraw.Draw(img)
    pad = int(W * 0.085)
    maxw = W - pad * 2
    maxh = bodyH - int(pad * 1.2)
    chosen = None
    for size in range(72, 24, -2):
        fnt = font(size, "ExtraBold")
        asc, desc = fnt.getmetrics()
        lh = asc + desc + int(size * 0.18)
        lines = wrap(d, text, fnt, maxw)
        total = 0
        for ln in lines:
            total += int(lh * 0.5) if ln == "" else lh
        if total <= maxh:
            chosen = (fnt, lh, lines, total)
            break
    if not chosen:
        fnt = font(24, "Bold"); asc, desc = fnt.getmetrics()
        lh = asc + desc + 4; lines = wrap(d, text, fnt, maxw)
        total = sum(int(lh * 0.5) if l == "" else lh for l in lines)
        chosen = (fnt, lh, lines, total)
    fnt, lh, lines, total = chosen
    y = (bodyH - total) // 2
    for ln in lines:
        if ln == "":
            y += int(lh * 0.5); continue
        w = d.textlength(ln, font=fnt)
        d.text(((W - w) // 2, y), ln, font=fnt, fill=WHITE)
        y += lh


# ---------- main render ----------
def render(mode, fmt, photo_path=None, text=None, focus=0.5, out="output/post.png"):
    W, H = PRESETS[fmt]
    fh = footer_h(H)
    bodyH = H - fh - 7
    img = Image.new("RGB", (W, H), WHITE)

    if mode == "frame":
        gold_line(img, 0, W)
        if photo_path:
            ph = Image.open(photo_path).convert("RGB")
            cover(img, ph, (0, 7, W, bodyH - 7, focus))
    elif mode == "navy":
        bg = navy_background(W, bodyH)
        img.paste(bg, (0, 0))
        if photo_path:
            ph = Image.open(photo_path).convert("RGB")
            photoH = int(bodyH * 0.62)
            py = (bodyH - photoH) // 2
            cover(img, ph, (0, py, W, photoH, focus))
        corner_accents(img, W, bodyH)
    elif mode == "text":
        bg = navy_background(W, bodyH)
        img.paste(bg, (0, 0))
        corner_accents(img, W, bodyH)
        render_text(img, W, bodyH, text or "")

    draw_footer(img, W, H)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    img.save(out, "PNG")
    print("OK ->", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["frame", "navy", "text"])
    ap.add_argument("--size", default="4:5", choices=list(PRESETS))
    ap.add_argument("--photo")
    ap.add_argument("--text")
    ap.add_argument("--textfile")
    ap.add_argument("--focus", type=float, default=0.5)
    ap.add_argument("--out", default="output/post.png")
    a = ap.parse_args()
    txt = a.text
    if a.textfile:
        with open(a.textfile, encoding="utf-8") as f:
            txt = f.read()
    render(a.mode, a.size, a.photo, txt, a.focus, a.out)
