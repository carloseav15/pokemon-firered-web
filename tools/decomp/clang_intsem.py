"""Type-directed C integer semantics for the Clang -> TypeScript emitter (INT).

Clang already annotates every expression with its C type and inserts an explicit ImplicitCastExpr at every
conversion point (assignment, initialiser, return, call argument, usual arithmetic conversions). So no IR is needed:
this module only decides, for a value whose JS number is known to lie in [lo, hi], what TypeScript makes it a valid
value of a target C integer type. See INT_SEMANTICS.md.

A JS number is exact for |v| < 2**53. Chains of + - & | ^ << ~ and unary - are congruent modulo 2**32 with the C
result, so they are left "pending" (value not yet inside the C type's range) until a consumer that is not congruent
mod 2**32 (a conversion, comparison, division, function argument, condition, ...) forces normalisation. Products that
may leave the exact range use Math.imul.
"""

from __future__ import annotations

from dataclasses import dataclass

Cty = tuple[int, bool]  # (bits, signed)

# JS operator precedence levels used to keep the generated text minimal but correct.
COMMA, ASSIGN, COND, OR, AND, BOR, BXOR, BAND, EQ, REL, SHIFT, ADD, MUL, UNARY, ATOM = range(1, 16)

INT_BASE: dict[str, Cty] = {
    "char": (8, False),  # armv4t-none-eabi: char is unsigned
    "signed char": (8, True),
    "unsigned char": (8, False),
    "short": (16, True),
    "unsigned short": (16, False),
    "int": (32, True),
    "unsigned int": (32, False),
    "long": (32, True),
    "unsigned long": (32, False),
    "_Bool": (1, False),
    # GBA typedefs, for type dicts that carry no desugared name
    "u8": (8, False), "s8": (8, True), "u16": (16, False), "s16": (16, True), "u32": (32, False), "s32": (32, True),
    "vu8": (8, False), "vs8": (8, True), "vu16": (16, False), "vs16": (16, True), "vu32": (32, False), "vs32": (32, True),
    "bool8": (8, False), "bool16": (16, False), "bool32": (32, False),
}


class UnsupportedInt(Exception):
    pass


def type_info(type_node: dict) -> Cty | None:
    """(bits, signed) for an integer C type, None for pointers/structs/void/floats. Raises for 64-bit types."""
    q = type_node.get("desugaredQualType") or type_node.get("qualType", "")
    q = q.replace("const ", "").replace("volatile ", "").strip()
    if q in INT_BASE:
        return INT_BASE[q]
    if q in ("long long", "unsigned long long"):
        raise UnsupportedInt("64-bit integer arithmetic is not supported")
    if q.startswith("enum "):
        return (32, False)  # Clang's underlying type for enums without negative constants
    return None


def type_range(t: Cty) -> tuple[int, int]:
    bits, signed = t
    return (-(1 << (bits - 1)), (1 << (bits - 1)) - 1) if signed else (0, (1 << bits) - 1)


@dataclass(frozen=True)
class Ix:
    """A TS expression for a C integer value: its text, precedence, C type and exact JS value interval."""
    code: str
    prec: int
    cty: Cty
    lo: int
    hi: int
    isbool: bool = False  # `code` is a JS boolean (comparison, !, &&, ||); C sees 0/1
    stmt: str | None = None  # statement form for assignments / ++ / -- (no surrounding parentheses)

    def at(self, prec: int) -> str:
        return self.code if self.prec >= prec else f"({self.code})"


def literal(value: int, cty: Cty, code: str | None = None) -> Ix:
    text = code if code is not None else str(value)
    return Ix(text, UNARY if value < 0 else ATOM, cty, value, value)


def from_type(code: str, prec: int, cty: Cty) -> Ix:
    lo, hi = type_range(cty)
    return Ix(code, prec, cty, lo, hi)


def as_int(ix: Ix) -> Ix:
    if not ix.isbool:
        return ix
    return Ix(f"{ix.at(COND + 1)} ? 1 : 0", COND, ix.cty, 0, 1)


def convert(ix: Ix, to: Cty) -> Ix:
    """Value of `ix` converted to C integer type `to` (a no-op when every possible value already fits)."""
    ix = as_int(ix)
    lo_r, hi_r = type_range(to)
    if ix.lo >= lo_r and ix.hi <= hi_r:
        return Ix(ix.code, ix.prec, to, ix.lo, ix.hi)
    bits, signed = to
    if ix.lo == ix.hi:  # a constant: fold the conversion into a literal
        v = ix.lo & ((1 << bits) - 1)
        if signed and v >= 1 << (bits - 1):
            v -= 1 << bits
        return literal(v, to)
    if bits == 32:
        code, prec = (f"{ix.at(ATOM)} | 0", BOR) if signed else (f"{ix.at(ATOM)} >>> 0", SHIFT)
    elif signed:
        sh = 32 - bits
        code, prec = f"({ix.at(ATOM)} << {sh}) >> {sh}", SHIFT
    else:
        code, prec = f"{ix.at(ATOM)} & 0x{(1 << bits) - 1:x}", BAND
    return Ix(code, prec, to, lo_r, hi_r)


def norm(ix: Ix) -> Ix:
    """Force the value into the range of its own C type."""
    return convert(ix, ix.cty)


def as_cond(ix: Ix) -> Ix:
    """A JS condition for C truthiness of an integer expression."""
    if ix.isbool:
        return ix
    n = norm(ix)
    if n.prec >= ATOM:  # identifiers, literals, calls: JS truthiness of a number is C truthiness
        return Ix(n.code, n.prec, n.cty, n.lo, n.hi, isbool=True)
    return Ix(f"{n.at(EQ + 1)} !== 0", EQ, n.cty, 0, 1, isbool=True)


_HUGE = 1 << 52
_I32 = (-(1 << 31), (1 << 31) - 1)  # what a JS bitwise operator produces


def _bitlen_mask(v: int) -> int:
    return (1 << max(v, 0).bit_length()) - 1


def arith(op: str, a: Ix, b: Ix, t: Cty) -> Ix:
    """Binary arithmetic/bitwise/shift operator; `a` and `b` already have the operand types Clang chose."""
    a, b = as_int(a), as_int(b)
    lo_r, hi_r = type_range(t)
    signed = t[1]
    if op in ("+", "-"):
        if max(abs(a.lo), abs(a.hi), abs(b.lo), abs(b.hi)) > _HUGE >> 4:
            a, b = norm(a), norm(b)
        lo, hi = (a.lo + b.lo, a.hi + b.hi) if op == "+" else (a.lo - b.hi, a.hi - b.lo)
        return Ix(f"{a.at(ADD)} {op} {b.at(ADD + 1)}", ADD, t, lo, hi)
    if op == "*":
        cands = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi]
        lo, hi = min(cands), max(cands)
        if lo >= lo_r and hi <= hi_r:  # cannot overflow the C type: the exact product is the C result
            return Ix(f"{a.at(MUL)} * {b.at(MUL + 1)}", MUL, t, lo, hi)
        call = f"Math.imul({a.at(COMMA + 1)}, {b.at(COMMA + 1)})"
        return Ix(call, ATOM, t, lo_r, hi_r) if signed else Ix(call, ATOM, t, _I32[0], _I32[1])  # int32 bits, pending for unsigned
    if op in ("/", "%"):
        a, b = norm(a), norm(b)
        if op == "/":
            m = max(abs(a.lo), abs(a.hi))
            lo, hi = (0, a.hi) if not signed else (-m, m)
            return Ix(f"Math.trunc({a.at(MUL)} / {b.at(MUL + 1)})", ATOM, t, lo, hi)
        m = max(abs(b.lo), abs(b.hi)) - 1  # |a % b| < |b|
        lo, hi = (0, min(a.hi, m)) if a.lo >= 0 else (-m, m)
        return Ix(f"{a.at(MUL)} % {b.at(MUL + 1)}", MUL, t, lo, hi)
    if op == "<<":
        k = b.lo if b.lo == b.hi else None
        if k is not None and 0 <= k < 32 and a.lo >= lo_r and a.hi <= hi_r and a.lo * (1 << k) >= lo_r and a.hi * (1 << k) <= hi_r:
            return Ix(f"{a.at(SHIFT)} << {b.at(SHIFT + 1)}", SHIFT, t, a.lo << k, a.hi << k)
        core = f"{a.at(SHIFT)} << {b.at(SHIFT + 1)}"
        return Ix(core, SHIFT, t, lo_r, hi_r) if signed else Ix(core, SHIFT, t, _I32[0], _I32[1])  # int32 bits, pending for unsigned
    if op == ">>":
        k = b.lo if b.lo == b.hi else None
        if signed:
            fits = a.lo >= lo_r and a.hi <= hi_r
            lo, hi = (a.lo >> k, a.hi >> k) if (fits and k is not None and 0 <= k < 32) else (lo_r, hi_r)
            return Ix(f"{a.at(SHIFT)} >> {b.at(SHIFT + 1)}", SHIFT, t, lo, hi)
        fits = a.lo >= 0 and a.hi <= hi_r
        lo, hi = (0, a.hi >> k) if (fits and k is not None and 0 <= k < 32) else (0, hi_r)
        return Ix(f"{a.at(SHIFT)} >>> {b.at(SHIFT + 1)}", SHIFT, t, lo, hi)
    if op in ("&", "|", "^"):
        prec = {"&": BAND, "|": BOR, "^": BXOR}[op]
        core = f"{a.at(ATOM)} {op} {b.at(ATOM)}"  # bitwise operands always parenthesised: (x >>> 0) & (w - 1)
        small = (1 << 31) - 1
        if op == "&" and ((a.lo >= 0 and a.hi <= small) or (b.lo >= 0 and b.hi <= small)):
            his = [x.hi for x in (a, b) if x.lo >= 0 and x.hi <= small]
            return Ix(core, prec, t, 0, min(his))  # non-negative int32 result, identical for signed and unsigned C types
        if op in ("|", "^") and a.lo >= 0 and b.lo >= 0 and a.hi <= small and b.hi <= small:
            return Ix(core, prec, t, 0, _bitlen_mask(max(a.hi, b.hi)))
        return Ix(core, prec, t, lo_r, hi_r) if signed else Ix(core, prec, t, _I32[0], _I32[1])  # int32 bits, pending for unsigned
    raise UnsupportedInt(f"unsupported integer operator {op}")


def compare(op: str, a: Ix, b: Ix, t: Cty) -> Ix:
    a, b = norm(as_int(a)), norm(as_int(b))
    js = {"==": "===", "!=": "!=="}.get(op, op)
    prec = EQ if op in ("==", "!=") else REL
    return Ix(f"{a.at(prec)} {js} {b.at(prec + 1)}", prec, t, 0, 1, isbool=True)


def negate(a: Ix, t: Cty) -> Ix:
    a = as_int(a)
    if a.lo == a.hi:
        return literal(-a.lo, t)
    inner = a.at(UNARY)
    if inner.startswith("-"):
        inner = f"({a.code})"
    return Ix(f"-{inner}", UNARY, t, -a.hi, -a.lo)


def bit_not(a: Ix, t: Cty) -> Ix:
    a = as_int(a)
    lo_r, hi_r = type_range(t)
    core = f"~{a.at(UNARY)}"
    if t[1]:
        fits = a.lo >= lo_r and a.hi <= hi_r
        return Ix(core, UNARY, t, -a.hi - 1 if fits else lo_r, -a.lo - 1 if fits else hi_r)
    return Ix(core, UNARY, t, _I32[0], _I32[1])  # int32 bits, pending for unsigned


def enum_constants(ast: dict) -> dict[str, int]:
    """name -> value for every enumerator anywhere in a translation unit (Clang does not repeat the value at each use)."""
    out: dict[str, int] = {}
    stack = [ast]
    while stack:
        n = stack.pop()
        if not isinstance(n, dict):
            continue
        if n.get("kind") == "EnumDecl":
            nxt = 0
            for c in n.get("inner", []) or []:
                if c.get("kind") != "EnumConstantDecl":
                    continue
                v = nxt
                for e in c.get("inner", []) or []:
                    if e.get("kind") == "ConstantExpr" and "value" in e:
                        v = int(e["value"])
                    elif e.get("kind") == "IntegerLiteral":
                        v = int(e["value"])
                out[c["name"]] = v
                nxt = v + 1
            continue
        stack.extend(reversed(n.get("inner", []) or []))
    return out
