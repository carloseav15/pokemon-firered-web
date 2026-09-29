// INT controls. Every control is one C function (controls/controls.c) compared with:
//   generated (before INT)  the frozen baseline generator: recorded, never asserted
//   generated (INT)         the current tools/decomp generator: MUST match C/wasm (expect)
//   fixed                   hand-written correct TS for the original controls: proves the control itself has no false positive
// Division controls are expected to differ only where wasm traps (b == 0, INT_MIN / -1): `expectOnly` pins the cluster.
const P = (n, t) => ({ n, t });
const FIXED = new Set(["c_add8", "c_add16", "c_local_wrap", "c_signed_cast", "c_u32_mul", "c_u32_shr", "c_static_local", "c_if", "c_signed_shr", "c_div"]);

const ctl = (name, params, ret, opts = {}) => {
  const expect = opts.trapOnly ? "NEEDS_TRIAGE" : "MATCH_OBSERVED";
  const expectOnly = opts.trapOnly ? ["c-trap"] : undefined;
  return {
    name, group: "controls", kind: "pure", ret, params,
    c: { name, srcPath: "tools/oracle/controls/controls.c", stem: "controls" },
    impls: [
      { label: "generated (before INT)", mjs: "controls_generated_old", name },
      { label: "generated (INT)", mjs: "controls_generated_new", name, expect, expectOnly },
      ...(FIXED.has(name) ? [{ label: "fixed", mjs: "controls_fixed", name, expect, expectOnly }] : []),
    ],
    cost: { specLines: 1, wrapper: "none", state: "none", touchedTs: false, adapters: [], reusable: "n/a (control)" },
  };
};

const s32 = (...n) => n.map((x) => P(x, "s32"));
export default [
  // original controls (definitions unchanged)
  ctl("c_add8", [P("a", "u8"), P("b", "u8")], "u8"),
  ctl("c_add16", [P("a", "s16"), P("b", "s16")], "s16"),
  ctl("c_local_wrap", [P("a", "u8")], "u8"),
  ctl("c_signed_cast", [P("a", "u8")], "s32"),
  ctl("c_u32_mul", [P("a", "u32"), P("b", "u32")], "u32"),
  ctl("c_u32_shr", [P("a", "u32")], "u32"),
  ctl("c_static_local", [], "s32"), // state persists across the 2001 calls on both sides
  ctl("c_if", s32("a"), "s32"),
  ctl("c_signed_shr", s32("a"), "s32"),
  ctl("c_div", s32("a", "b"), "s32", { trapOnly: true }),
  // INT-2: operators, promotions, conversions
  ctl("c_mul_s32", s32("a", "b"), "s32"),
  ctl("c_mul_u32_u8", [P("a", "u32"), P("b", "u8")], "u32"),
  ctl("c_mul_s16", [P("a", "s16"), P("b", "s16")], "s32"),
  ctl("c_mul_s16_ret", [P("a", "s16"), P("b", "s16")], "s16"),
  ctl("c_shl_u32", [P("a", "u32"), P("n", "u8")], "u32"),
  ctl("c_shl_s32", [P("a", "s32"), P("n", "u8")], "s32"),
  ctl("c_shr_s32", [P("a", "s32"), P("n", "u8")], "s32"),
  ctl("c_shr_u32", [P("a", "u32"), P("n", "u8")], "u32"),
  ctl("c_neg_u8", [P("a", "u8")], "s32"),
  ctl("c_neg_u8_ret", [P("a", "u8")], "u8"),
  ctl("c_neg_u32", [P("a", "u32")], "u32"),
  ctl("c_not_u32", [P("a", "u32")], "u32"),
  ctl("c_not_u8", [P("a", "u8")], "u8"),
  ctl("c_cmp_u32_s32", [P("a", "u32"), P("b", "s32")], "s32"),
  ctl("c_cmp_s8_u8", [P("a", "s8"), P("b", "u8")], "s32"),
  ctl("c_assign_trunc", s32("a"), "u8"),
  ctl("c_init_trunc", s32("a"), "u16"),
  ctl("c_compound_mul", [P("a", "s16"), P("b", "s16")], "s16"),
  ctl("c_compound_shr", [P("a", "u8"), P("n", "u8")], "u8"),
  ctl("c_compound_sub", [P("a", "u8"), P("b", "u8")], "u8"),
  ctl("c_inc_u8", [P("a", "u8")], "u8"),
  ctl("c_postinc_value", [P("a", "u8")], "u8"),
  ctl("c_preinc_value", [P("a", "u8")], "u8"),
  ctl("c_div_s16", [P("a", "s16"), P("b", "s16")], "s32", { trapOnly: true }),
  ctl("c_mod_s32", s32("a", "b"), "s32", { trapOnly: true }),
  ctl("c_div_u32", [P("a", "u32"), P("b", "u32")], "u32", { trapOnly: true }),
  ctl("c_ternary_sign", [P("a", "u8"), P("b", "s8")], "s32"),
  ctl("c_u32_from_s8", [P("a", "s8")], "u32"),
  ctl("c_bool_value", s32("a", "b"), "s32"),
  ctl("c_u16_arith", [P("a", "u16"), P("b", "u16")], "u16"),
  ctl("c_bitops_u32", [P("a", "u32"), P("b", "u32")], "u32"),
  ctl("c_s8_sub", [P("a", "s8"), P("b", "s8")], "s8"),
  ctl("c_s8_cast_chain", s32("a"), "s32"),
  ctl("c_u32_sum3", [P("a", "u32"), P("b", "u32"), P("c", "u32")], "u32"),
  ctl("c_s32_sum3", s32("a", "b", "c"), "s32"),
  ctl("c_u8_sum3", [P("a", "u8"), P("b", "u8"), P("c", "u8")], "u8"),
];
