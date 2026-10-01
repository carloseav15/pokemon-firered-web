export default async function run(ctx) {
  const state = await ctx.loadSave("mart");
  if (state.map !== "MAP_PEWTER_CITY_MART") throw new Error(`wrong checkpoint: ${JSON.stringify(state)}`);
  return { manual: "The save starts at the Mart entrance, but H.talk fails before reaching the clerk because driver.js calls objects.collisionAt, which is absent from the current overworld object API. Buying and selling need a browser route after that driver mismatch is resolved." };
}
