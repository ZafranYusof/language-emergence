#!/usr/bin/env python3
"""Generate 8 detailed RPG pixel art character sprites (32x48 -> 128x192)."""

from PIL import Image
import os

OUT = r"C:\tmp\language-emergence\frontend\public\sprites"
os.makedirs(OUT, exist_ok=True)

O = (34, 34, 34, 255)
T = (0, 0, 0, 0)

def new_canvas():
    return Image.new("RGBA", (32, 48), T)

def px(img, x, y, c):
    if 0 <= x < 32 and 0 <= y < 48:
        img.putpixel((x, y), c)

def rect(img, x1, y1, x2, y2, c):
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            px(img, x, y, c)

def save(img, name):
    big = img.resize((128, 192), Image.NEAREST)
    big.save(os.path.join(OUT, name))
    print(f"  Saved {name}")

# ============================================================
# HELPER: draw standard chibi body (legs + shoes)
# ============================================================
def draw_legs(img, leg_color_l, leg_color_r, shoe_color_l, shoe_color_r, belt_color=None):
    """Draw two legs with shoes, standard position."""
    # Left leg
    for y in range(34, 40):
        px(img, 13, y, O); px(img, 14, y, leg_color_l); px(img, 15, y, leg_color_l); px(img, 16, y, O)
    # Right leg
        px(img, 17, y, O); px(img, 18, y, leg_color_r); px(img, 19, y, leg_color_r); px(img, 20, y, O)
    # Left shoe
    for y in range(40, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else shoe_color_l
            px(img, x, y, c)
    # Right shoe
    for y in range(40, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else shoe_color_r
            px(img, x, y, c)

# ============================================================
# 1. MAGE - Blue wizard with tall hat, staff, beard
# ============================================================
def draw_mage():
    img = new_canvas()
    # Palette
    hat_dk = (25, 55, 140, 255); hat = (40, 85, 190, 255); hat_lt = (65, 120, 225, 255)
    star = (255, 235, 60, 255); star_h = (255, 250, 140, 255)
    robe_dk = (25, 50, 130, 255); robe = (40, 75, 175, 255); robe_lt = (60, 110, 210, 255); robe_hi = (85, 140, 235, 255)
    skin = (255, 215, 175, 255); skin_s = (230, 185, 145, 255)
    beard_w = (240, 240, 250, 255); beard_g = (210, 210, 225, 255)
    staff_w = (110, 75, 35, 255); staff_h = (150, 105, 55, 255)
    crystal = (0, 230, 255, 255); crystal_h = (170, 250, 255, 255); crystal_g = (0, 200, 220, 255)
    eye_w = (255, 255, 255, 255); eye_p = (30, 50, 130, 255)
    shoe = (90, 60, 35, 255); shoe_h = (120, 85, 50, 255)

    # === TALL POINTED HAT ===
    # Tip
    px(img, 15, 0, O)
    px(img, 14, 1, O); px(img, 15, 1, star_h); px(img, 16, 1, star); px(img, 17, 1, O)
    # Upper cone
    for dy in range(2, 5):
        hw = dy
        for x in range(16 - hw, 16 + hw + 1):
            edge = x == 16 - hw or x == 16 + hw
            if edge: px(img, x, dy, O)
            elif x < 16: px(img, x, dy, hat_lt)
            else: px(img, x, dy, hat_dk)
    # Star decoration on hat
    px(img, 15, 2, star); px(img, 16, 3, star_h)
    # Lower cone wider
    for dy in range(5, 9):
        hw = 3 + (dy - 5)
        for x in range(16 - hw, 16 + hw + 1):
            edge = x == 16 - hw or x == 16 + hw
            if edge: px(img, x, dy, O)
            elif x < 16: px(img, x, dy, hat_lt)
            else: px(img, x, dy, hat_dk)
    # Hat brim (wide)
    for x in range(10, 22):
        px(img, x, 9, O if x in (10, 21) else hat)
    for x in range(10, 22):
        px(img, x, 10, O if x in (10, 21) else hat_dk)

    # === HEAD ===
    for y in range(10, 17):
        for x in range(12, 20):
            edge = y == 10 or y == 16 or x == 12 or x == 19
            if edge: px(img, x, y, O)
            else: px(img, x, y, skin)
    # Eyes (big, 2px each)
    px(img, 14, 12, eye_w); px(img, 15, 12, eye_p)
    px(img, 17, 12, eye_w); px(img, 18, 12, eye_p)
    # Eyebrows
    px(img, 13, 11, O); px(img, 14, 11, O); px(img, 15, 11, O)
    px(img, 17, 11, O); px(img, 18, 11, O); px(img, 19, 11, O)
    # Nose
    px(img, 16, 13, skin_s)
    # Mouth
    px(img, 15, 15, skin_s); px(img, 16, 15, (200, 150, 120, 255))

    # === BEARD ===
    for y in range(16, 21):
        bw = min(y - 15, 4)
        for x in range(16 - bw, 16 + bw + 1):
            c = beard_w if (x + y) % 2 == 0 else beard_g
            edge = abs(x - 16) == bw
            if edge: px(img, x, y, O)
            else: px(img, x, y, c)

    # === BODY / ROBES ===
    for y in range(17, 38):
        w = 5 + (y - 17) // 3
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, robe_hi)
            elif x < 16: px(img, x, y, robe_lt)
            elif x > 16: px(img, x, y, robe_dk)
            else: px(img, x, y, robe)
    # Robe sash/belt
    for x in range(12, 21):
        px(img, x, 20, (140, 95, 45, 255))
    px(img, 16, 20, (220, 180, 70, 255))  # gold buckle
    # Robe detail lines
    for y in range(24, 37):
        px(img, 16, y, robe_dk)

    # === STAFF (held in left hand) ===
    for y in range(6, 38):
        px(img, 7, y, O); px(img, 8, y, staff_h); px(img, 9, y, staff_w); px(img, 10, y, O)
    # Staff knob details
    px(img, 8, 18, (160, 115, 60, 255)); px(img, 9, 18, (160, 115, 60, 255))
    # Crystal on top (glowing)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            c = crystal_h if dx <= 0 and dy <= 0 else crystal
            if dx == 0 and dy == -1: c = (200, 255, 255, 255)
            px(img, 8 + dx, 4 + dy, c)
    px(img, 8, 2, O); px(img, 9, 2, O)
    px(img, 7, 3, O); px(img, 10, 3, O)
    px(img, 7, 6, O); px(img, 10, 6, O)
    px(img, 8, 7, O); px(img, 9, 7, O)

    # === SHOES ===
    for y in range(38, 41):
        for x in range(12, 17):
            c = O if (x == 12 or y == 40) else shoe_h
            px(img, x, y, c)
    for y in range(38, 41):
        for x in range(17, 22):
            c = O if (x == 21 or y == 40) else shoe
            px(img, x, y, c)

    save(img, "mage.png")

# ============================================================
# 2. KNIGHT - Crimson armor, helmet, sword, shield
# ============================================================
def draw_knight():
    img = new_canvas()
    # Palette
    armor_dk = (140, 20, 20, 255); armor = (185, 35, 35, 255); armor_lt = (220, 55, 55, 255); armor_hi = (245, 90, 80, 255)
    helmet = (155, 25, 25, 255); helmet_lt = (195, 45, 45, 255)
    visor = (30, 30, 35, 255)
    plume = (255, 215, 30, 255); plume_h = (255, 240, 80, 255)
    sword_bl = (190, 200, 215, 255); sword_hi = (230, 235, 245, 255)
    handle = (100, 65, 30, 255); pommel = (210, 175, 55, 255)
    shield_y = (225, 195, 40, 255); shield_dk = (185, 155, 25, 255); emblem = (115, 75, 30, 255)
    boot = (70, 60, 55, 255); boot_h = (95, 85, 80, 255)

    # === PLUME (tall feathery) ===
    for y in range(0, 6):
        for x in range(14, 18):
            c = plume_h if x < 16 else plume
            if y > 3 and (x == 14 or x == 17): continue
            px(img, x, y, c)
    px(img, 15, 0, plume_h); px(img, 16, 0, plume)

    # === HELMET (full face, angular) ===
    for y in range(5, 14):
        for x in range(11, 21):
            edge = y == 5 or y == 13 or x == 11 or x == 20
            if edge: px(img, x, y, O)
            elif 9 <= y <= 10 and 13 <= x <= 18:  # visor slit
                px(img, x, y, visor)
            elif y == 8 and 13 <= x <= 18:
                px(img, x, y, visor)
            else:
                c = helmet_lt if x <= 15 else helmet
                px(img, x, y, c)
    # Helmet ridge
    px(img, 15, 6, armor_hi); px(img, 16, 6, armor_hi)
    px(img, 15, 7, armor_hi); px(img, 16, 7, armor_hi)

    # === BODY ARMOR ===
    for y in range(14, 33):
        w = 5 + (y - 14) // 3
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, armor_hi)
            elif x < 16: px(img, x, y, armor_lt)
            elif x > 16: px(img, x, y, armor_dk)
            else: px(img, x, y, armor)
    # Armor plate rivets/details
    for y in [17, 21, 25, 29]:
        for x in range(13, 20):
            if x not in (13, 19):
                px(img, x, y, armor_dk)
    # Belt
    for x in range(12, 21):
        px(img, x, 22, (80, 60, 40, 255))
    px(img, 16, 22, pommel)

    # === SHIELD (left arm, rectangular) ===
    for y in range(14, 27):
        for x in range(5, 12):
            edge = x == 5 or x == 11 or y == 14 or y == 26
            if edge: px(img, x, y, O)
            elif x == 6 or x == 10 or y == 15 or y == 25:
                px(img, x, y, shield_dk)
            else:
                px(img, x, y, shield_y)
    # Shield emblem (brown cross)
    px(img, 8, 18, emblem); px(img, 8, 19, emblem); px(img, 8, 20, emblem); px(img, 8, 21, emblem)
    px(img, 7, 19, emblem); px(img, 9, 19, emblem)
    px(img, 7, 20, emblem); px(img, 9, 20, emblem)

    # === SWORD (right side, large) ===
    # Blade
    for y in range(8, 30):
        px(img, 24, y, O); px(img, 25, y, sword_hi); px(img, 26, y, sword_bl); px(img, 27, y, O)
    # Blade tip
    px(img, 25, 7, O); px(img, 26, 7, O)
    px(img, 25, 8, sword_hi)
    # Crossguard
    for x in range(22, 30):
        px(img, x, 30, O if x in (22, 29) else pommel)
    # Handle
    for y in range(31, 35):
        px(img, 24, y, O); px(img, 25, y, handle); px(img, 26, y, O)
    # Pommel
    px(img, 24, 35, O); px(img, 25, 35, pommel); px(img, 26, 35, O)

    # === LEGS/BOOTS ===
    for y in range(33, 39):
        for x in range(13, 16): px(img, x, y, armor_lt if y < 37 else boot_h)
        for x in range(17, 20): px(img, x, y, armor if y < 37 else boot)
    for y in range(39, 42):
        for x in range(12, 17):
            c = O if (x == 12 or y == 41) else boot_h
            px(img, x, y, c)
    for y in range(39, 42):
        for x in range(17, 22):
            c = O if (x == 21 or y == 41) else boot
            px(img, x, y, c)

    save(img, "knight.png")

# ============================================================
# 3. SAGE - Purple scholar, mortarboard, glasses, book
# ============================================================
def draw_sage():
    img = new_canvas()
    hat = (90, 40, 140, 255); hat_lt = (120, 65, 175, 255); hat_dk = (65, 25, 105, 255)
    tassel = (210, 180, 55, 255); tassel_h = (240, 210, 90, 255)
    robe = (85, 40, 135, 255); robe_lt = (110, 60, 165, 255); robe_dk = (60, 25, 100, 255)
    gold = (215, 185, 55, 255); gold_h = (245, 215, 85, 255)
    skin = (250, 215, 180, 255); skin_s = (225, 190, 155, 255)
    glasses = (255, 225, 50, 255); glasses_r = (210, 180, 35, 255)
    book_c = (130, 85, 45, 255); book_p = (245, 235, 210, 255); book_sp = (100, 65, 30, 255)
    eye_w = (255, 255, 255, 255); eye_p = (35, 35, 100, 255)
    shoe = (70, 40, 110, 255)

    # === MORTARBOARD ===
    # Flat board (wide rectangle)
    for y in range(3, 5):
        for x in range(9, 23):
            edge = (y == 3 and (x == 9 or x == 22)) or (y == 4 and (x == 9 or x == 22))
            if edge: px(img, x, y, O)
            else: px(img, x, y, hat_lt if y == 3 else hat)
    # Button on top center
    px(img, 15, 3, gold); px(img, 16, 3, gold_h)
    # Cap body underneath
    for y in range(5, 9):
        for x in range(12, 20):
            edge = x == 12 or x == 19
            if edge: px(img, x, y, O)
            elif x < 16: px(img, x, y, hat_lt)
            else: px(img, x, y, hat_dk)
    # Tassel (dangling from right)
    px(img, 22, 4, tassel_h); px(img, 22, 5, tassel); px(img, 22, 6, tassel)
    px(img, 23, 6, tassel_h); px(img, 23, 7, tassel)

    # === HEAD ===
    for y in range(9, 16):
        for x in range(12, 20):
            edge = y == 9 or y == 15 or x == 12 or x == 19
            if edge: px(img, x, y, O)
            else: px(img, x, y, skin)
    # Round glasses (large, prominent)
    # Left lens
    for y in (11, 12):
        for x in (13, 14, 15):
            px(img, x, y, glasses_r if x == 13 or x == 15 or y == 11 else eye_w)
    px(img, 14, 11, glasses); px(img, 14, 12, eye_p)
    # Right lens
    for y in (11, 12):
        for x in (17, 18, 19):
            px(img, x, y, glasses_r if x == 17 or x == 19 or y == 11 else eye_w)
    px(img, 18, 11, glasses); px(img, 18, 12, eye_p)
    # Bridge
    px(img, 16, 11, glasses_r)
    # Mouth
    px(img, 15, 14, skin_s); px(img, 16, 14, skin_s)

    # === GOLD COLLAR TRIM ===
    for x in range(12, 20):
        px(img, x, 16, gold_h); px(img, x, 17, gold)

    # === BODY/ROBE ===
    for y in range(17, 38):
        w = 5 + (y - 17) // 4
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, robe_lt)
            elif x < 16: px(img, x, y, robe_lt)
            elif x > 16: px(img, x, y, robe_dk)
            else: px(img, x, y, robe)
    # Robe center seam
    for y in range(20, 37):
        px(img, 16, y, robe_dk)

    # === BOOK (held in front) ===
    for y in range(22, 31):
        for x in range(13, 20):
            edge = x == 13 or x == 19 or y == 22 or y == 30
            if edge: px(img, x, y, O)
            elif x == 16: px(img, x, y, book_sp)
            elif x == 14 or x == 18: px(img, x, y, book_c)
            else: px(img, x, y, book_p)
    # Text lines on pages
    for y in range(24, 29):
        px(img, 15, y, (180, 170, 150, 255))
        px(img, 17, y, (180, 170, 150, 255))

    # === SHOES ===
    for y in range(38, 41):
        for x in range(12, 17):
            c = O if (x == 12 or y == 40) else shoe
            px(img, x, y, c)
    for y in range(38, 41):
        for x in range(17, 22):
            c = O if (x == 21 or y == 40) else shoe
            px(img, x, y, c)

    save(img, "sage.png")

# ============================================================
# 4. RANGER - Green hooded cloak, bow, quiver
# ============================================================
def draw_ranger():
    img = new_canvas()
    hood_dk = (25, 75, 30, 255); hood = (40, 110, 50, 255); hood_lt = (55, 140, 65, 255)
    cloak = (35, 95, 42, 255); cloak_lt = (50, 125, 58, 255); cloak_dk = (22, 70, 28, 255)
    leather = (90, 110, 65, 255); leather_dk = (70, 85, 50, 255)
    bow = (130, 85, 40, 255); bow_h = (165, 115, 60, 255); bow_dk = (100, 65, 25, 255)
    bowstring = (190, 190, 190, 255)
    quiver = (110, 75, 35, 255); arrow = (170, 175, 180, 255); arrow_h = (200, 205, 215, 255)
    boot = (75, 110, 55, 255); boot_lt = (95, 135, 70, 255)
    skin = (230, 198, 165, 255); skin_s = (205, 172, 140, 255)
    eye_w = (255, 255, 255, 255); eye_p = (35, 95, 45, 255)

    # === HOOD (pointed, covering head) ===
    px(img, 15, 1, O); px(img, 16, 1, O)  # hood tip
    for dy in range(2, 8):
        hw = dy - 1
        for x in range(16 - hw, 16 + hw + 1):
            edge = x == 16 - hw or x == 16 + hw
            if edge: px(img, x, dy, O)
            elif x < 16: px(img, x, dy, hood_lt)
            else: px(img, x, dy, hood_dk)
    # Hood drapes to sides
    for y in range(8, 15):
        for x in range(11, 21):
            edge = x == 11 or x == 20
            if edge: px(img, x, y, O)
            elif x <= 13: px(img, x, y, hood_lt)
            elif x >= 18: px(img, x, y, hood_dk)
            elif y < 11: px(img, x, y, hood)
            else: px(img, x, y, hood_dk)

    # Face (narrow window)
    for y in range(10, 14):
        for x in range(14, 18):
            if x in (14, 17) and y < 12: continue  # hood shadow
            px(img, x, y, skin)
    px(img, 15, 11, eye_w); px(img, 16, 11, eye_p)  # left eye
    # right eye partially hidden
    px(img, 15, 13, skin_s); px(img, 16, 13, skin_s)

    # === BODY (leather armor) ===
    for y in range(14, 34):
        w = 5 + (y - 14) // 4
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, cloak_lt)
            elif x < 16: px(img, x, y, cloak_lt)
            elif x > 16: px(img, x, y, cloak_dk)
            else: px(img, x, y, cloak)
    # Cloak center line
    for y in range(18, 35):
        px(img, 16, y, cloak_dk)
    # Belt
    for x in range(12, 21):
        px(img, x, 22, leather)
    px(img, 16, 22, (160, 130, 70, 255))

    # === QUIVER ON BACK ===
    for y in range(10, 30):
        px(img, 22, y, O); px(img, 23, y, quiver); px(img, 24, y, O)
    # Arrow tips poking out
    px(img, 22, 8, arrow_h); px(img, 23, 9, arrow_h); px(img, 24, 8, arrow)
    px(img, 22, 7, O); px(img, 23, 8, O); px(img, 24, 7, O)

    # === BOW (held in left hand) ===
    # Upper limb
    px(img, 7, 14, O); px(img, 8, 14, bow_h); px(img, 9, 14, O)
    px(img, 6, 15, O); px(img, 7, 15, bow)
    px(img, 6, 16, O); px(img, 7, 16, bow_h)
    px(img, 6, 17, O); px(img, 7, 17, bow)
    px(img, 7, 18, O); px(img, 8, 18, bow)
    px(img, 7, 19, O)
    px(img, 7, 20, O)
    px(img, 7, 21, O)
    # Grip
    px(img, 7, 22, O); px(img, 8, 22, bow_dk); px(img, 9, 22, O)
    # Lower limb
    px(img, 7, 23, O)
    px(img, 7, 24, O); px(img, 8, 24, bow)
    px(img, 7, 25, O); px(img, 8, 25, bow_h)
    px(img, 7, 26, O); px(img, 8, 26, bow)
    px(img, 8, 27, O); px(img, 9, 27, bow)
    px(img, 9, 28, O); px(img, 10, 28, bow_h); px(img, 11, 28, O)
    # Bowstring
    px(img, 8, 14, bowstring); px(img, 7, 22, bowstring); px(img, 10, 28, bowstring)

    # === BOOTS ===
    for y in range(34, 40):
        for x in range(13, 16): px(img, x, y, leather_dk if y < 37 else boot)
        for x in range(17, 20): px(img, x, y, leather if y < 37 else boot_lt)
    for y in range(40, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else boot
            px(img, x, y, c)
    for y in range(40, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else boot_lt
            px(img, x, y, c)

    save(img, "ranger.png")

# ============================================================
# 5. CLERIC - White robe, golden halo, cross, healing glow
# ============================================================
def draw_cleric():
    img = new_canvas()
    halo = (255, 225, 75, 255); halo_h = (255, 245, 150, 255)
    robe = (240, 240, 248, 255); robe_lt = (255, 255, 255, 255); robe_dk = (215, 215, 230, 255)
    hood = (230, 230, 242, 255); hood_dk = (210, 210, 225, 255)
    gold = (225, 185, 50, 255); gold_h = (255, 220, 85, 255); gold_dk = (190, 150, 30, 255)
    cross = (220, 175, 45, 255); cross_h = (250, 210, 80, 255)
    skin = (248, 220, 195, 255); skin_s = (225, 195, 170, 255)
    eye_w = (255, 255, 255, 255); eye_p = (45, 110, 155, 255)
    glow = (255, 255, 210, 160); glow_h = (255, 255, 230, 200)
    shoe = (225, 225, 235, 255); shoe_dk = (200, 200, 215, 255)

    # === HALO (floating, circular) ===
    for x in range(13, 19):
        px(img, x, 1, halo_h if x < 16 else halo)
    px(img, 12, 2, halo); px(img, 19, 2, halo)
    px(img, 12, 3, halo_h); px(img, 19, 3, halo)
    px(img, 13, 4, halo); px(img, 18, 4, halo)

    # === HOOD ===
    for y in range(4, 14):
        w = min(y - 3, 5)
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x < 16: px(img, x, y, hood)
            else: px(img, x, y, hood_dk)

    # === FACE ===
    for y in range(10, 15):
        for x in range(13, 19):
            edge = y == 10 or y == 14 or x == 13 or x == 18
            if edge: px(img, x, y, O)
            else: px(img, x, y, skin)
    # Eyes (gentle)
    px(img, 14, 12, eye_w); px(img, 15, 12, eye_p)
    px(img, 17, 12, eye_w); px(img, 16, 12, eye_p)
    # Gentle smile
    px(img, 15, 13, skin_s); px(img, 16, 13, skin_s)

    # === BODY/ROBE ===
    for y in range(14, 40):
        w = 5 + (y - 14) // 4
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, robe_lt)
            elif x < 16: px(img, x, y, robe_lt)
            elif x > 16: px(img, x, y, robe_dk)
            else: px(img, x, y, robe)

    # === GOLD CROSS ON CHEST ===
    # Vertical
    for y in range(17, 22):
        px(img, 16, y, cross_h)
        px(img, 15, y, cross)
    # Horizontal
    px(img, 14, 18, cross); px(img, 14, 19, cross)
    px(img, 17, 18, cross_h); px(img, 17, 19, cross_h)

    # === GOLD TRIM at hem ===
    for x in range(11, 22):
        px(img, x, 38, gold_h); px(img, x, 39, gold_dk)

    # === GOLD TRIM at sleeves (wrists) ===
    px(img, 10, 28, gold_h); px(img, 11, 28, gold); px(img, 11, 29, gold_dk)
    px(img, 21, 28, gold_h); px(img, 22, 28, gold); px(img, 22, 29, gold_dk)

    # === HEALING GLOW around hands ===
    for dy in range(-1, 2):
        for dx in range(-2, 3):
            if dx*dx + dy*dy <= 4:
                c = glow_h if abs(dx) + abs(dy) <= 1 else glow
                px(img, 10 + dx, 26 + dy, c)
                px(img, 22 + dx, 26 + dy, c)

    # === SHOES ===
    for y in range(40, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else (shoe if x % 2 == 0 else shoe_dk)
            px(img, x, y, c)
    for y in range(40, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else (shoe_dk if x % 2 == 0 else shoe)
            px(img, x, y, c)

    save(img, "cleric.png")

# ============================================================
# 6. ASSASSIN - Dark hood, glowing red eyes, dual daggers
# ============================================================
def draw_assassin():
    img = new_canvas()
    hood = (42, 42, 48, 255); hood_lt = (62, 62, 70, 255); hood_dk = (22, 22, 28, 255)
    cloak = (38, 38, 44, 255); cloak_lt = (55, 55, 65, 255); cloak_dk = (18, 18, 24, 255)
    shadow = (15, 15, 20, 255)
    eye_r = (255, 35, 25, 255); eye_g = (255, 75, 55, 255); eye_glow = (255, 50, 40, 180)
    dagger = (185, 190, 200, 255); dagger_h = (225, 230, 240, 255)
    handle = (75, 65, 55, 255)
    belt = (55, 45, 35, 255); buckle = (145, 145, 155, 255)
    boot = (28, 28, 32, 255); boot_lt = (42, 42, 48, 255)

    # === HOOD (pointed, very shadowy) ===
    px(img, 15, 1, O); px(img, 16, 1, O)
    for dy in range(2, 8):
        hw = dy - 1
        for x in range(16 - hw, 16 + hw + 1):
            edge = x == 16 - hw or x == 16 + hw
            if edge: px(img, x, dy, O)
            elif x < 16: px(img, x, dy, hood_lt)
            else: px(img, x, dy, hood_dk)

    # === FACE (completely shadowed, only eyes glow) ===
    for y in range(8, 15):
        for x in range(11, 21):
            edge = x == 11 or x == 20
            if edge: px(img, x, y, O)
            elif y == 8: px(img, x, y, hood)
            else: px(img, x, y, shadow)
    # Glowing red eyes (with glow halo)
    px(img, 13, 10, eye_glow); px(img, 14, 10, eye_g); px(img, 15, 10, eye_r)
    px(img, 17, 10, eye_g); px(img, 18, 10, eye_r); px(img, 19, 10, eye_glow)
    # Eye glow reflected on "cheeks"
    px(img, 14, 11, (80, 20, 15, 100)); px(img, 18, 11, (80, 20, 15, 100))

    # === BODY/CLOAK (flowing) ===
    for y in range(14, 40):
        w = 5 + (y - 14) // 3
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, cloak_lt)
            elif x < 16: px(img, x, y, cloak_lt)
            elif x > 16: px(img, x, y, cloak_dk)
            else: px(img, x, y, cloak)
    # Flowing cloak lines
    for y in range(20, 40):
        px(img, 14, y, cloak_dk)
        px(img, 18, y, cloak_lt)

    # === LEATHER BELT ===
    for x in range(12, 21):
        px(img, x, 22, belt)
    px(img, 16, 22, buckle); px(img, 16, 23, buckle)

    # === DUAL DAGGERS ===
    # Left dagger
    px(img, 8, 18, O); px(img, 8, 19, dagger_h); px(img, 8, 20, dagger); px(img, 8, 21, dagger); px(img, 8, 22, O)
    px(img, 9, 22, O); px(img, 9, 23, handle); px(img, 9, 24, O)
    px(img, 8, 23, O); px(img, 10, 23, O)
    # Right dagger
    px(img, 24, 18, O); px(img, 24, 19, dagger_h); px(img, 24, 20, dagger); px(img, 24, 21, dagger); px(img, 24, 22, O)
    px(img, 23, 22, O); px(img, 23, 23, handle); px(img, 23, 24, O)
    px(img, 22, 23, O); px(img, 24, 23, O)

    # === BOOTS (dark, sleek) ===
    for y in range(37, 41):
        for x in range(13, 16): px(img, x, y, boot_lt)
        for x in range(17, 20): px(img, x, y, boot)
    for y in range(41, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else boot_lt
            px(img, x, y, c)
    for y in range(41, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else boot
            px(img, x, y, c)

    save(img, "assassin.png")

# ============================================================
# 7. ENGINEER - Leather cap, goggles, apron, wrench
# ============================================================
def draw_engineer():
    img = new_canvas()
    cap = (165, 105, 45, 255); cap_lt = (195, 135, 70, 255); cap_dk = (135, 80, 30, 255)
    goggle_f = (70, 130, 195, 255); goggle_r = (95, 155, 215, 255); goggle_dk = (50, 100, 160, 255)
    apron = (175, 115, 48, 255); apron_lt = (205, 145, 75, 255); apron_dk = (145, 90, 32, 255)
    shirt = (215, 200, 165, 255); shirt_dk = (190, 175, 142, 255)
    wrench = (165, 170, 180, 255); wrench_h = (210, 215, 225, 255); wrench_dk = (130, 135, 145, 255)
    toolbelt = (95, 65, 35, 255); pocket = (125, 85, 45, 255)
    boot = (105, 70, 35, 255); boot_h = (135, 95, 55, 255)
    skin = (238, 205, 175, 255); skin_s = (215, 180, 150, 255)
    eye_w = (255, 255, 255, 255); eye_p = (55, 95, 135, 255)

    # === LEATHER CAP ===
    for y in range(3, 9):
        for x in range(12, 20):
            edge = (y == 3 and x in (12, 19)) or (y == 8 and x in (12, 19))
            if y == 3 and x not in (12, 19): px(img, x, y, cap_lt)
            elif y == 8 and x not in (12, 19): px(img, x, y, cap_dk)
            elif x == 12: px(img, x, y, O)
            elif x == 19: px(img, x, y, O)
            else: px(img, x, y, cap if x > 15 else cap_lt)
    # Cap brim
    for x in range(11, 21):
        px(img, x, 8, O if x in (11, 20) else cap_dk)

    # === GOGGLES (pushed up on forehead) ===
    for x in range(13, 19):
        px(img, x, 9, goggle_dk if x in (13, 18) else goggle_f)
    px(img, 13, 9, goggle_r); px(img, 18, 9, goggle_r)
    px(img, 15, 9, (55, 55, 60, 255)); px(img, 16, 9, (55, 55, 60, 255))

    # === HEAD ===
    for y in range(10, 16):
        for x in range(12, 20):
            edge = y == 10 or y == 15 or x == 12 or x == 19
            if edge: px(img, x, y, O)
            else: px(img, x, y, skin)
    # Eyes
    px(img, 14, 12, eye_w); px(img, 15, 12, eye_p)
    px(img, 17, 12, eye_w); px(img, 16, 12, eye_p)
    # Grin
    px(img, 15, 14, skin_s); px(img, 16, 14, (180, 140, 110, 255))

    # === SHIRT (at collar) ===
    for y in range(16, 18):
        for x in range(13, 19):
            px(img, x, y, shirt if x < 16 else shirt_dk)

    # === APRON ===
    for y in range(18, 38):
        w = 4 + (y - 18) // 5
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, apron_lt)
            elif x < 16: px(img, x, y, apron_lt)
            elif x > 16: px(img, x, y, apron_dk)
            else: px(img, x, y, apron)
    # Apron straps
    px(img, 14, 18, O); px(img, 14, 19, apron); px(img, 14, 20, apron_lt)
    px(img, 18, 18, O); px(img, 18, 19, apron); px(img, 18, 20, apron_dk)

    # === TOOL BELT ===
    for x in range(12, 21):
        px(img, x, 24, toolbelt)
    # Pockets
    for y in range(25, 29):
        px(img, 12, y, O); px(img, 13, y, pocket); px(img, 14, y, O)
        px(img, 18, y, O); px(img, 19, y, pocket); px(img, 20, y, O)

    # === WRENCH (right hand, large) ===
    # Handle (long)
    for y in range(14, 32):
        px(img, 25, y, wrench_h if y % 3 == 0 else wrench)
    # Jaw head
    px(img, 24, 12, O); px(img, 25, 12, wrench_h); px(img, 26, 12, wrench); px(img, 27, 12, O)
    px(img, 23, 13, O); px(img, 24, 13, wrench_h); px(img, 25, 13, wrench_dk)
    px(img, 27, 13, O); px(img, 26, 13, wrench)
    px(img, 22, 14, O); px(img, 23, 14, wrench)
    px(img, 28, 14, O); px(img, 27, 14, wrench_dk)
    # Wrench outline
    for y in range(12, 15):
        px(img, 24, y, O); px(img, 26, y, O)

    # === BOOTS ===
    for y in range(38, 41):
        for x in range(13, 16): px(img, x, y, boot_h)
        for x in range(17, 20): px(img, x, y, boot)
    for y in range(41, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else boot_h
            px(img, x, y, c)
    for y in range(41, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else boot
            px(img, x, y, c)

    save(img, "engineer.png")

# ============================================================
# 8. ORACLE - Teal hair, glowing eyes, crystal ball, stars
# ============================================================
def draw_oracle():
    img = new_canvas()
    hair = (0, 185, 195, 255); hair_lt = (50, 215, 225, 255); hair_dk = (0, 145, 155, 255)
    robe = (0, 155, 165, 255); robe_lt = (25, 185, 195, 255); robe_dk = (0, 125, 135, 255)
    star = (255, 225, 55, 255); star_h = (255, 245, 120, 255)
    skin = (232, 215, 205, 255); skin_s = (210, 190, 180, 255)
    eye_c = (0, 225, 245, 255); eye_g = (100, 245, 255, 255); eye_glow = (0, 200, 220, 120)
    ball = (0, 215, 235, 255); ball_h = (155, 255, 255, 255); sparkle = (255, 255, 255, 255)
    shoe = (0, 135, 145, 255)

    # === FLOWING TEAL HAIR (top) ===
    for y in range(2, 10):
        hw = min(y - 1, 5)
        for x in range(16 - hw, 16 + hw + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - hw or x == 16 + hw
            if edge: px(img, x, y, O)
            elif x < 16: px(img, x, y, hair_lt)
            else: px(img, x, y, hair_dk)

    # === FACE ===
    for y in range(9, 15):
        for x in range(12, 20):
            edge = y == 9 or y == 14 or x == 12 or x == 19
            if edge: px(img, x, y, O)
            else: px(img, x, y, skin)
    # Glowing cyan eyes (larger, 2px tall)
    px(img, 14, 11, eye_g); px(img, 15, 11, eye_c)
    px(img, 17, 11, eye_g); px(img, 18, 11, eye_c)
    px(img, 14, 12, eye_c); px(img, 15, 12, eye_g)
    px(img, 17, 12, eye_c); px(img, 18, 12, eye_g)
    # Eye glow on cheeks
    px(img, 13, 12, eye_glow); px(img, 19, 12, eye_glow)
    # Mouth
    px(img, 15, 13, skin_s); px(img, 16, 13, skin_s)

    # === LONG FLOWING HAIR SIDES ===
    for y in range(10, 32):
        for x in [9, 10, 11, 12]:
            if y > 28 and x < 10: continue
            c = O if x == 9 else (hair_lt if x == 10 else hair)
            px(img, x, y, c)
        for x in [19, 20, 21, 22]:
            if y > 28 and x > 21: continue
            c = O if x == 22 else (hair_dk if x == 21 else hair)
            px(img, x, y, c)

    # === BODY/ROBE ===
    for y in range(14, 40):
        w = 5 + (y - 14) // 4
        for x in range(16 - w, 16 + w + 1):
            if x < 0 or x > 31: continue
            edge = x == 16 - w or x == 16 + w
            if edge: px(img, x, y, O)
            elif x == 16 - w + 1: px(img, x, y, robe_lt)
            elif x < 16: px(img, x, y, robe_lt)
            elif x > 16: px(img, x, y, robe_dk)
            else: px(img, x, y, robe)
    # Center seam
    for y in range(18, 39):
        px(img, 16, y, robe_dk)

    # === CONSTELLATION STAR PATTERNS ===
    star_positions = [(18, 15), (14, 20), (19, 22), (13, 26), (18, 28), (14, 32), (19, 34), (15, 36)]
    for sx, sy in star_positions:
        px(img, sx, sy, star)
        if sx + 1 < 32: px(img, sx + 1, sy, star_h)
    # Some connected constellation lines
    px(img, 16, 17, (180, 200, 60, 120))
    px(img, 15, 23, (180, 200, 60, 120))

    # === CRYSTAL BALL (floating above left hand) ===
    bx, by = 25, 22
    # Ball glow outline
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            dist = dx*dx + dy*dy
            if 5 < dist <= 10:
                px(img, bx + dx, by + dy, (0, 200, 220, 140))
    # Ball body
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx*dx + dy*dy <= 5:
                c = ball_h if (dx < 0 and dy < 0) else ball
                if dx == 0 and dy == 0: c = sparkle
                px(img, bx + dx, by + dy, c)
    # Sparkle highlights
    px(img, bx - 1, by - 2, sparkle)
    px(img, bx + 1, by + 1, (180, 255, 255, 180))

    # === SHOES ===
    for y in range(40, 43):
        for x in range(12, 17):
            c = O if (x == 12 or y == 42) else shoe
            px(img, x, y, c)
    for y in range(40, 43):
        for x in range(17, 22):
            c = O if (x == 21 or y == 42) else shoe
            px(img, x, y, c)

    save(img, "oracle.png")

# ============================================================
if __name__ == "__main__":
    print("Generating detailed RPG sprites...")
    draw_mage()
    draw_knight()
    draw_sage()
    draw_ranger()
    draw_cleric()
    draw_assassin()
    draw_engineer()
    draw_oracle()
    print("All 8 sprites generated!")
