export default async function run(ctx) {
  const initial = await ctx.loadSave("gym-camper");
  if (initial.map !== "MAP_PEWTER_CITY_GYM") throw new Error(`wrong Gym checkpoint: ${JSON.stringify(initial)}`);
  return { manual: `Gym checkpoint loads at (${initial.x},${initial.y}), but H.talk plus the script driver leaves the Brock interaction locked before battle; victory, badge and money remain unverified.` };
}
