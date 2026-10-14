"""Lector mínimo de NSBTX (textura de Nitro: BTX0 > TEX0) para los gráficos de objetos de HeartGold/SoulSilver.

Solo texturas con paleta (formatos 2, 3 y 4 de DS: 2, 4 y 8 bits por píxel); sin texturas comprimidas ni con alfa.
Diseño del bloque TEX0 (relativo al inicio del bloque): 0x0E desplazamiento de la tabla de texturas, 0x14 datos de
texturas, 0x30 tamaño de paletas >> 3, 0x34 tabla de paletas, 0x38 datos de paletas. Cada tabla es un "diccionario" de
Nitro: u8 0, u8 n, u16 tamaño, árbol de (n + 1) x 4 bytes, u16 tamaño de cabecera, u16 tamaño de entradas, n entradas y
n nombres de 16 bytes. Entrada de textura: u16 desplazamiento >> 3, u16 parámetros (bits 4-6: ancho = 8 << n,
7-9: alto = 8 << n, 10-12: formato, 13: el color 0 es transparente), 4 bytes; entrada de paleta: u16 desplazamiento >> 3, u16.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass


@dataclass
class Texture:
    name: str
    width: int
    height: int
    fmt: int
    transparent0: bool
    data: bytes  # píxeles ya expandidos a un índice por byte


@dataclass
class Palette:
    name: str
    colors: list[tuple[int, int, int]]


def _dict(d: bytes, off: int, entry_size: int) -> tuple[list[bytes], list[str]]:
    n = d[off + 1]
    o = off + 8 + (n + 1) * 4
    o += 4  # tamaño de cabecera y de entradas
    entries = [d[o + i * entry_size : o + (i + 1) * entry_size] for i in range(n)]
    names_off = o + n * entry_size
    names = [d[names_off + i * 16 : names_off + (i + 1) * 16].split(b"\0")[0].decode("latin-1") for i in range(n)]
    return entries, names


def parse(d: bytes) -> tuple[list[Texture], list[Palette]]:
    if d[:4] != b"BTX0":
        raise ValueError("BTX0 esperado")
    tex = struct.unpack_from("<I", d, 0x10)[0]
    if d[tex : tex + 4] != b"TEX0":
        raise ValueError("TEX0 esperado")
    u16 = lambda o: struct.unpack_from("<H", d, o)[0]  # noqa: E731
    u32 = lambda o: struct.unpack_from("<I", d, o)[0]  # noqa: E731
    tex_info, tex_data = tex + u16(tex + 0x0E), tex + u32(tex + 0x14)
    pal_info, pal_data = tex + u32(tex + 0x34), tex + u32(tex + 0x38)
    ents, names = _dict(d, tex_info, 8)
    textures = []
    for e, name in zip(ents, names):
        off, par = struct.unpack_from("<HH", e, 0)
        w, h, fmt = 8 << ((par >> 4) & 7), 8 << ((par >> 7) & 7), (par >> 10) & 7
        bpp = {2: 2, 3: 4, 4: 8}.get(fmt)
        if bpp is None:
            raise ValueError(f"{name}: formato de textura {fmt} no soportado")
        raw = d[tex_data + off * 8 : tex_data + off * 8 + w * h * bpp // 8]
        if bpp == 8:
            px = bytes(raw)
        elif bpp == 4:
            px = bytes(v for b in raw for v in (b & 15, b >> 4))
        else:
            px = bytes(v for b in raw for v in (b & 3, (b >> 2) & 3, (b >> 4) & 3, b >> 6))
        textures.append(Texture(name, w, h, fmt, bool((par >> 13) & 1), px))
    pents, pnames = _dict(d, pal_info, 4)
    pals = []
    offsets = [struct.unpack_from("<H", e, 0)[0] * 8 for e in pents]
    for off, name in zip(offsets, pnames):
        colors = []
        for i in range(16):
            v = u16(pal_data + off + i * 2)
            colors.append(((v & 31) << 3 | (v & 31) >> 2, ((v >> 5) & 31) << 3 | ((v >> 5) & 31) >> 2, ((v >> 10) & 31) << 3 | ((v >> 10) & 31) >> 2))
        pals.append(Palette(name, colors))
    return textures, pals
