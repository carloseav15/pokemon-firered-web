// Page-side helper shared by the story jobs: takeWarp(x, y, dest, opts) steps onto / into a warp of the current map by real
// movement. Needs walk() from route2-lib's routeHelpers. Handles plain warps, arrow warps (press in the facing direction),
// directional stair warps (lateral press, TryArrowWarp) and impassable door tiles (stand beside, press towards, TryDoorWarp).
export const warpHelpers = `
  // Step onto a warp tile (planner target); stairs/arrow warps need one more press in some direction.
  const takeWarp = async (x, y, dest, opts) => {
    // A job may declare window.__alsoArrived(dest) for destinations reached by a cutscene instead of the warp (S.S. Anne departure).
    const arrived = () => H.st().map === dest || !!window.__alsoArrived?.(dest);
    // A door tile (MB_WARP_DOOR) is impassable: stand next to it and press towards it (TryDoorWarp).
    if (window.frGame.overworld.map.collisionAt(x + 7, y + 7)) {
      const side = [[0, 1, "U"], [0, -1, "D"], [-1, 0, "R"], [1, 0, "L"]].find(([dx, dy]) => H.bfs(x + dx + 7, y + dy + 7) !== null);
      if (!side) return { ...H.st(), note: "no reachable side of door (" + x + "," + y + ")" };
      const w = await walk(x + side[0], y + side[1], opts);
      if (w.note && w.note !== "map changed") return w;
      window.__from = H.st().map;
      await H.exit(side[2], 2, opts);
      await H.until(() => arrived() && H.fieldFree(), null, 1500);
      return arrived() ? H.st() : { ...H.st(), note: "door warp to " + dest + " failed" };
    }
    const r = await walk(x, y, opts);
    if (r.note && r.note !== "map changed") return r;
    // Arrow/stair warps fire on a press in their direction while standing on the tile: try the facing direction first.
    const facing = { 1: "D", 2: "U", 3: "L", 4: "R" }[H.observe().facing];
    // Directional stairs (MB_*_STAIR_WARP) are entered laterally (field_control_avatar.c TryArrowWarp).
    const ow = window.frGame.overworld, beh = ow.map.behaviorAt(x + 7, y + 7);
    const stair = [["L", C.DIR_WEST], ["R", C.DIR_EAST]].find(([, d]) => ow.player.IsDirectionalStairWarpMetatileBehavior(beh, d))?.[0];
    for (const dir of [stair, facing, "U", "D", "L", "R"].filter((d, i, a) => d && a.indexOf(d) === i)) {
      if (arrived()) break;
      if (H.st().map === (window.__from ?? "") && H.fieldFree() && H.st().x === x && H.st().y === y) {
        await H.exit(dir, 1, opts);
        await H.until(() => arrived(), null, 400);
      }
    }
    await H.until(() => arrived() && H.fieldFree(), null, 1500);
    return arrived() ? H.st() : { ...H.st(), note: "warp to " + dest + " failed" };
  };
`;
