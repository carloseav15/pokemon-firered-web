// Preserve existing deep links and inspectors, while ordinary map consultation uses one page.
const url = new URL(location.href);
const hash = new URLSearchParams(url.hash.slice(1));
const legacy = url.searchParams.get("legacy") === "1";
const page = url.pathname.split("/").pop();
if (page === "viewer.html" && (legacy || hash.get("modo") === "explore")) {
  await import("../viewer/main");
} else if (page === "crystal-world.html" && legacy) {
  await import("../compare/crystalWorldMain");
} else {
  const game = page === "hns.html" ? "hns" : page?.startsWith("crystal") ? "crystal" : url.searchParams.get("game") === "emerald" ? "emerald" : "firered";
  const target = new URL("/maps.html", url);
  target.searchParams.set("game", game);
  target.hash = url.hash;
  location.replace(target.href);
}
export {};
