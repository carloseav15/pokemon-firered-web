"""Lector de kaomado.kao (retratos de PMD: Explorers of Sky) y del compresor AT4PX.

Formato (verificado contra las 1154 filas del archivo):
  - Tabla de 1155 filas x 40 punteros u32 LE (fila = índice de monstruo; 40 = 20 emociones x {normal, volteada}).
  - Puntero positivo: desplazamiento absoluto del retrato. Negativo: casilla vacía, con |valor| = inicio del
    siguiente dato. Cero: sin entrada.
  - Retrato: paleta de 16 colores RGB (48 bytes) + AT4PX; descomprime a 800 bytes = 40x40 px de 4 bpp en
    5x5 tiles de 8x8 (tile en orden de filas; dentro del byte, nibble bajo = píxel izquierdo).
La descompresión sigue DecompressAT de pret/pmd-red (src/decompress_at.c).
"""

from __future__ import annotations

import struct

EMOTIONS = ["Normal", "Grin", "Pain", "Angry", "Worried", "Sad", "Crying", "Shouting", "Teary-Eyed", "Determined",
            "Joyous", "Inspired", "Surprised", "Dizzy", "Special0", "Special1", "Sigh", "Stunned", "Special2", "Special3"]
ROWS = 1155
SLOTS = 40

_PATTERNS = {  # orden de los 9 flags -> nibbles (a b c d) como fracciones de c
    0x1F: (0, 0, 0, 0), 0x1E: (0, 1, 1, 1), 0x1D: (0, -1, 0, 0), 0x1C: (0, 0, -1, 0), 0x1B: (0, 0, 0, -1),
    0x1A: (0, -1, -1, -1), 0x19: (0, 1, 0, 0), 0x18: (0, 0, 1, 0), 0x17: (0, 0, 0, 1),
}


def at_decompress(src: bytes | memoryview, off: int = 0) -> bytes:
    s = src[off:]
    if bytes(s[:5]) != b"AT4PX":
        raise ValueError(f"cabecera AT4PX esperada en {off:#x}, hay {bytes(s[:5])!r}")
    clen = s[5] | (s[6] << 8)
    flags = [s[7 + i] + 3 for i in range(9)]
    out = bytearray()
    cur, cmd, bit = 0x12, 0, 8
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
                p = [(c + d) & 0xF for d in _PATTERNS[command]]
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


class Kao:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.table = struct.unpack_from(f"<{ROWS * SLOTS}I", data, 0)

    def pointer(self, row: int, slot: int) -> int:
        """Desplazamiento del retrato, o 0 si la casilla está vacía."""
        p = self.table[row * SLOTS + slot]
        return p if 0 < p <= len(self.data) else 0

    def emotions(self, row: int) -> list[int]:
        """Índices de emoción (0-19) con retrato normal (casilla par) en esa fila."""
        return [e for e in range(20) if self.pointer(row, e * 2)]

    def portrait(self, row: int, slot: int) -> tuple[list[tuple[int, int, int]], bytes]:
        p = self.pointer(row, slot)
        if not p:
            raise KeyError((row, slot))
        pal = [tuple(self.data[p + i * 3 : p + i * 3 + 3]) for i in range(16)]
        pix = at_decompress(self.data, p + 48)
        if len(pix) != 800:
            raise ValueError(f"fila {row} casilla {slot}: {len(pix)} bytes descomprimidos, se esperaban 800")
        return pal, pix  # type: ignore[return-value]


def tiles_to_indices(pix: bytes) -> list[int]:
    """800 bytes en 5x5 tiles -> 1600 índices de color en orden de filas de 40 px."""
    out = [0] * 1600
    for t in range(25):
        tx, ty = (t % 5) * 8, (t // 5) * 8
        for i in range(64):
            b = pix[t * 32 + i // 2]
            out[(ty + i // 8) * 40 + tx + i % 8] = (b & 15) if i % 2 == 0 else (b >> 4)
    return out
