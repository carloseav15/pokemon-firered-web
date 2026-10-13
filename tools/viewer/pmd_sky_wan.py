"""Lector de sprites WAN de PMD: Explorers of Sky (files/MONSTER/monster.bin y packs afines).

Contenedores (verificados sobre monster.bin, 599 entradas):
  pack:   u32 0, u32 n, n x (u32 desplazamiento, u32 longitud); cada entrada es un PKDPX.
  PKDPX:  "PKDPX" u16 longitud, 9 flags, u32 tamaño descomprimido, datos desde 0x14 (algoritmo AT de pmd-red).
  SIR0:   "SIR0" u32 puntero al contenido; el contenido es la cabecera WAN.
Cabecera WAN (contenido): u32 anim_info, u32 image_info, u16 tipo, u16 1.
  image_info: u32 tabla de imágenes, u32 info de paletas, u16 x3, u16 nº de imágenes.
    imagen = lista de (u32 puntero, u32 longitud, u32 0) hasta (0, 0, 0); puntero 0 = tira de ceros.
    paleta = 16 colores RGBA de 4 bytes por paleta (0x80 de alfa en los datos).
  anim_info: u32 tabla de metaframes, u32 tabla de desplazamientos, u32 tabla de grupos, u16 nº de grupos.
    metaframe = grupo de piezas OAM de 10 bytes (imagen u16, u16, attr0, attr1, attr2) hasta attr1 & 0x0800.
    grupo de animación = (u32 puntero, u32 nº de secuencias (8 direcciones)); secuencia = fotogramas de 12 bytes
    (duración u8, flag u8, metaframe u16, desplazamiento 2 x i16, sombra 2 x i16) hasta duración 0
    (struct wan_animation_frame de pmd-sky include/wan.h).
"""

from __future__ import annotations

import struct

from pmd_sky_kao import _PATTERNS

SHAPE_DIMS = {
    (0, 0): (8, 8), (0, 1): (16, 16), (0, 2): (32, 32), (0, 3): (64, 64),
    (1, 0): (16, 8), (1, 1): (32, 8), (1, 2): (32, 16), (1, 3): (64, 32),
    (2, 0): (8, 16), (2, 1): (8, 32), (2, 2): (16, 32), (2, 3): (32, 64),
}


def px_decompress(buf: bytes, off: int, data_start: int) -> bytes:
    """Descompresión PX (mismos flags y comandos que AT4PX); data_start = 0x14 en PKDPX, 0x12 en AT4PX."""
    s = memoryview(buf)[off:]
    clen = s[5] | (s[6] << 8)
    flags = [s[7 + i] + 3 for i in range(9)]
    out = bytearray()
    cur, cmd, bit = data_start, 0, 8
    while cur < clen:
        if bit == 8:
            cmd = s[cur]
            cur += 1
            bit = 0
            if cur >= clen:
                break
        if cmd & 0x80:
            out.append(s[cur])
            cur += 1
        else:
            command = (s[cur] >> 4) + 3
            hi = (s[cur] & 0xF) << 8
            for i, f in enumerate(flags):
                if command == f:
                    command = 0x1F - i
            if 0x17 <= command <= 0x1F:
                c = s[cur] & 0xF
                cur += 1
                p = [(c + x) & 0xF for x in _PATTERNS[command]]
                out.append((p[0] << 4) | p[1])
                out.append((p[2] << 4) | p[3])
            else:
                cur += 1
                pos = len(out) + hi + s[cur] - 0x1000
                cur += 1
                for _ in range(command):
                    out.append(out[pos])
                    pos += 1
        bit += 1
        cmd = (cmd << 1) & 0xFF
    return bytes(out)


def read_pack(data: bytes) -> list[bytes]:
    """Entradas de un pack (ya descomprimidas si son PKDPX)."""
    magic, n = struct.unpack_from("<II", data, 0)
    if magic != 0:
        raise ValueError("pack inesperado")
    out = []
    for i in range(n):
        off, ln = struct.unpack_from("<II", data, 8 + i * 8)
        if ln == 0:
            out.append(b"")
            continue
        head = data[off : off + 5]
        if head == b"PKDPX":
            raw = px_decompress(data, off, 0x14)
            want = struct.unpack_from("<I", data, off + 0x10)[0]
            if len(raw) != want:
                raise ValueError(f"entrada {i}: {len(raw)} bytes, se esperaban {want}")
            out.append(raw)
        else:
            out.append(data[off : off + ln])
    return out


class Piece:
    __slots__ = ("image", "x", "y", "w", "h", "hflip", "vflip", "tile", "pal", "last")

    def __init__(self, image: int, attr0: int, attr1: int, attr2: int) -> None:
        shape, size = (attr0 >> 14) & 3, (attr1 >> 14) & 3
        self.w, self.h = SHAPE_DIMS[(shape, size)]
        y = attr0 & 0xFF
        self.y = y - 256 if y >= 128 else y
        self.x = (attr1 & 0x1FF) - 256  # x con sesgo +0x100, igual que las poses de pmd-red
        self.hflip = bool(attr1 & 0x1000)
        self.vflip = bool(attr1 & 0x2000)
        self.last = bool(attr1 & 0x0800)
        self.tile = attr2 & 0x3FF
        self.pal = (attr2 >> 12) & 0xF
        self.image = image


class Wan:
    def __init__(self, sir0: bytes) -> None:
        if sir0[:4] != b"SIR0":
            raise ValueError("SIR0 esperado")
        u32 = lambda o: struct.unpack_from("<I", sir0, o)[0]  # noqa: E731
        u16 = lambda o: struct.unpack_from("<H", sir0, o)[0]  # noqa: E731
        self.d = sir0
        c = u32(4)
        p_anim, p_img, self.kind = u32(c), u32(c + 4), u16(c + 8)
        # imágenes
        tab, p_pal = u32(p_img), u32(p_img + 4)
        n_img = u16(p_img + 14)
        self.images: list[bytes] = []
        for i in range(n_img):
            o = u32(tab + i * 4)
            stream = bytearray()
            while True:
                ptr, ln, _ = struct.unpack_from("<III", sir0, o)
                o += 12
                if ptr == 0 and ln == 0:
                    break
                stream += sir0[ptr : ptr + ln] if ptr else bytes(ln)
            self.images.append(bytes(stream))
        # paletas: bloques de 16 colores RGBA
        pal_data = u32(p_pal)
        n_pal = max(1, (p_pal - pal_data) // 64)
        self.palettes = []
        for k in range(n_pal):
            cols = []
            for i in range(16):
                r, g, b, _a = sir0[pal_data + k * 64 + i * 4 : pal_data + k * 64 + i * 4 + 4]
                cols.append((r, g, b))
            self.palettes.append(cols)
        # metaframes: la tabla no declara su longitud; se lee hasta el inicio de la tabla de desplazamientos
        p_meta, p_off, p_groups, n_groups = u32(p_anim), u32(p_anim + 4), u32(p_anim + 8), u16(p_anim + 12)
        n_meta = (p_off - p_meta) // 4 if p_off > p_meta else 0
        self.frames: list[list[Piece]] = []
        for i in range(n_meta):
            o = u32(p_meta + i * 4)
            pieces = []
            while True:
                img, _unk, a0, a1, a2 = struct.unpack_from("<HHHHH", sir0, o)
                o += 10
                pieces.append(Piece(img, a0, a1, a2))
                if pieces[-1].last:
                    break
            self.frames.append(pieces)
        # animaciones: grupos -> hasta 8 secuencias
        self.anims: list[list[list[tuple[int, int, int, int]]] | None] = []
        for g in range(n_groups):
            ptr, count = struct.unpack_from("<II", sir0, p_groups + g * 8)
            if ptr == 0 or count == 0:
                self.anims.append(None)
                continue
            seqs = []
            for k in range(count):
                o = u32(ptr + k * 4)
                seq = []
                while True:
                    dur, _flag, fid, dx, dy, _sx, _sy = struct.unpack_from("<BBHhhhh", sir0, o)
                    o += 12
                    if dur == 0:
                        break
                    seq.append((dur, fid, dx, dy))
                seqs.append(seq)
            self.anims.append(seqs)

    def render_piece(self, p: Piece) -> list[list[int]] | None:
        """Píxeles (índices de color) de una pieza; tiles en orden 1D de OBJ."""
        img = self.images[p.image] if 0 <= p.image < len(self.images) else None
        if img is None:
            return None
        wt, ht = p.w // 8, p.h // 8
        rows = [[0] * p.w for _ in range(p.h)]
        for t in range(wt * ht):
            src = (p.tile + t) * 32
            if src + 32 > len(img):
                continue
            tx, ty = (t % wt) * 8, (t // wt) * 8
            for i in range(64):
                b = img[src + i // 2]
                rows[ty + i // 8][tx + i % 8] = (b & 15) if i % 2 == 0 else (b >> 4)
        if p.hflip:
            rows = [r[::-1] for r in rows]
        if p.vflip:
            rows = rows[::-1]
        return rows
