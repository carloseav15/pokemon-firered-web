/* Positive/negative controls for the oracle (NOT pokefirered code).
 * The "generated" TS for these is emitted by the CURRENT tools/decomp/clang_codegen.py,
 * whose integer semantics are known to be wrong (see gen_controls.py). A detector that
 * cannot flag these cannot be trusted on project code. */
typedef unsigned char u8;
typedef signed char s8;
typedef unsigned short u16;
typedef short s16;
typedef unsigned int u32;
typedef int s32;

u8 c_add8(u8 a, u8 b) { return a + b; }
s16 c_add16(s16 a, s16 b) { s16 r = a + b; return r; }
u8 c_local_wrap(u8 a) { u8 x = a; x += 10; return x; }
s32 c_signed_cast(u8 a) { return (s8)a; }
u32 c_u32_mul(u32 a, u32 b) { return a * b; }
u32 c_u32_shr(u32 a) { return a >> 4; }
s32 c_static_local(void) { static s32 n; n++; return n; }
/* negative controls: the current generator handles these correctly */
s32 c_if(s32 a) { if (a > 3) return 1; else return 2; }
s32 c_signed_shr(s32 a) { return a >> 2; }
/* trap control: wasm traps on b == 0 and INT_MIN / -1 */
s32 c_div(s32 a, s32 b) { return a / b; }

/* ---- INT-2 controls: operators, promotions, conversions (added with the INT work; the ones above are untouched) */
s32 c_mul_s32(s32 a, s32 b) { return a * b; }
u32 c_mul_u32_u8(u32 a, u8 b) { return a * b; }
s32 c_mul_s16(s16 a, s16 b) { return a * b; }
s16 c_mul_s16_ret(s16 a, s16 b) { return a * b; }
u32 c_shl_u32(u32 a, u8 n) { return a << n; }
s32 c_shl_s32(s32 a, u8 n) { return a << n; }
s32 c_shr_s32(s32 a, u8 n) { return a >> n; }
u32 c_shr_u32(u32 a, u8 n) { return a >> n; }
s32 c_neg_u8(u8 a) { return -a; }
u8 c_neg_u8_ret(u8 a) { return -a; }
u32 c_neg_u32(u32 a) { return -a; }
u32 c_not_u32(u32 a) { return ~a; }
u8 c_not_u8(u8 a) { return ~a; }
s32 c_cmp_u32_s32(u32 a, s32 b) { return a < b; }
s32 c_cmp_s8_u8(s8 a, u8 b) { return a < b; }
u8 c_assign_trunc(s32 a) { u8 x; x = a; return x; }
u16 c_init_trunc(s32 a) { u16 x = a; return x; }
s16 c_compound_mul(s16 a, s16 b) { a *= b; return a; }
u8 c_compound_shr(u8 a, u8 n) { a >>= n; return a; }
u8 c_compound_sub(u8 a, u8 b) { a -= b; return a; }
u8 c_inc_u8(u8 a) { a++; return a; }
u8 c_postinc_value(u8 a) { u8 b = a++; return b + a; }
u8 c_preinc_value(u8 a) { u8 b = ++a; return b + a; }
s32 c_div_s16(s16 a, s16 b) { return a / b; }
s32 c_mod_s32(s32 a, s32 b) { return a % b; }
u32 c_div_u32(u32 a, u32 b) { return a / b; }
s32 c_ternary_sign(u8 a, s8 b) { return a ? b : 0; }
u32 c_u32_from_s8(s8 a) { return a; }
s32 c_bool_value(s32 a, s32 b) { return (a > 0) + (b > 0); }
u16 c_u16_arith(u16 a, u16 b) { return (a * b) >> 4; }
u32 c_bitops_u32(u32 a, u32 b) { return (a & b) | (a ^ b); }
s8 c_s8_sub(s8 a, s8 b) { return a - b; }
s32 c_s8_cast_chain(s32 a) { return (s8)((u16)a >> 4); }
u32 c_u32_sum3(u32 a, u32 b, u32 c) { return a + b + c; }
s32 c_s32_sum3(s32 a, s32 b, s32 c) { return a + b + c; }
u8 c_u8_sum3(u8 a, u8 b, u8 c) { return a + b + c; }
