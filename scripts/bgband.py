"""
★★ BG (2026-10-14) — LE BANDEAU DE LA PAGE 1 DU DOCUMENT D'INSTITUTION.

Composé UNE FOIS, ici, et livré en JPEG OPAQUE (`public/doc/institution-band.jpg`).

Pourquoi à l'avance : le voile vert doit être APLATI dans l'image. Les lecteurs
PDF de WhatsApp ne rendent pas les dégradés transparents, et le fond disparaît
à l'arrivée. Ici le voile est calculé pixel par pixel et fondu dans la photo :
le fichier n'a pas de canal alpha, il n'y a rien à « rendre ».

Source : la photo des volontaires d'ארצנו (AP1, `bakasha/public/volunteers-1200.jpg`,
sans mention de licence tierce dans ses métadonnées).

Usage :  python3 scripts/bgband.py
"""
from PIL import Image

SRC = 'bakasha/public/volunteers-1200.jpg'
OUT = 'public/doc/institution-band.jpg'
# 2 × A4 (595,28 pt) de large, 2 × 230 pt de haut : le canevas de page est à l'échelle 2.
W, H = 1191, 460
FOREST = (11, 61, 44)  # #0B3D2C — le vert profond de la charte

photo = Image.open(SRC).convert('RGB')
# Recadrage : toute la largeur, la bande haute (les t-shirts « ארצנו »).
scale = W / photo.width
photo = photo.resize((W, round(photo.height * scale)), Image.LANCZOS)
top = round(photo.height * 0.06)
photo = photo.crop((0, top, W, top + H))

# Le voile : 55 % de vert profond en haut, 82 % en bas (là où se posent le
# titre et le nom), et un peu plus du côté DROIT (le début d'une ligne
# hébraïque, où se pose le logo). Calculé et APLATI : aucun alpha ne survit.
px = photo.load()
for y in range(H):
    ty = y / (H - 1)
    for x in range(W):
        tx = x / (W - 1)
        a = 0.55 + 0.27 * ty + 0.06 * tx
        a = min(a, 0.9)
        r, g, b = px[x, y]
        px[x, y] = (
            round(r * (1 - a) + FOREST[0] * a),
            round(g * (1 - a) + FOREST[1] * a),
            round(b * (1 - a) + FOREST[2] * a),
        )

assert photo.mode == 'RGB'
photo.save(OUT, 'JPEG', quality=84, optimize=True, progressive=False)
print(OUT, photo.size, photo.mode)
