export default async function run(ctx) {
  return { manual: process.env.SMOKE_MANUAL_REASON ?? "Not automated in this pass; see the corresponding C-point note in TAREAS-FINALES.md." };
}
