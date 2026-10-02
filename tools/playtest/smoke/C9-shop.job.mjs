export default async function run(ctx) {
  const initial = await ctx.loadSave("mart");
  if (initial.map !== "MAP_PEWTER_CITY_MART") throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);
  const result = await ctx.runEval(`const before = { state: H.st(), money: frDebug.save.save.money,
    bag: frDebug.save.save.bag.items.map(x => [x.item, x.quantity]), flags: [...frDebug.save.save.flags] };
    const clerk = H.objects().find(o => o[0] === 3 && o[1] === 2 && o[2] === 3);
    if (!clerk) throw new Error("Pewter Mart clerk did not spawn: " + JSON.stringify(H.objects()));
    await H.counter(2, 3);
    const open = H.st();
    frDebug.run(1, 1);
    frDebug.run(1, 0);
    await frDebug.wait(120);
    const taskModule = await H.mod("/src/fr/gba/tasks.ts");
    return { before, clerk, open, state: H.st(), cb2: H.cb2(),
      tasks: taskModule.tasks.tasks.filter(t => t.isActive).map(t => [t.func.name, [...t.data]]),
      money: frDebug.save.save.money,
      bag: frDebug.save.save.bag.items.map(x => [x.item, x.quantity]), party: H.party(), flags: [...frDebug.save.save.flags] }`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
