// Hand-written CORRECT counterparts of controls.c, used to check the detector has no false positives.
export const c_add8 = (a, b) => (a + b) & 0xff;
export const c_add16 = (a, b) => ((a + b) << 16) >> 16;
export const c_local_wrap = (a) => (a + 10) & 0xff;
export const c_signed_cast = (a) => (a << 24) >> 24;
export const c_u32_mul = (a, b) => Math.imul(a, b) >>> 0;
export const c_u32_shr = (a) => a >>> 4;
export const c_if = (a) => (a > 3 ? 1 : 2);
export const c_signed_shr = (a) => a >> 2;
export const c_div = (a, b) => Math.trunc(a / b);
export const c_static_local = (() => { let n = 0; return () => ++n; })(); // persistent state, like the C `static`
