import "./styles.css";
import { launchFireRed } from "./games/firered/boot";
import { launchStartup } from "./games/firered/startup";
import { launchAnimHarness } from "./games/firered/animHarness";

// ?fr=new / ?fr=continue / ?fr=sandbox skip the intro and boot the FireRed engine directly.
// ?fr=anims&a=<species>&t=<species> boots a battle harness that plays move animations on demand (window.frAnim).
const direct = new URLSearchParams(location.search).get("fr");
if (direct === "sandbox") void launchFireRed({ mode: "sandbox" });
else if (direct === "anims") void launchAnimHarness(new URLSearchParams(location.search));
else if (direct === "new") void launchFireRed({ mode: "new", playerName: "RED", gender: 0, rivalName: "GREEN" });
else if (direct === "continue") void launchFireRed({ mode: "continue" });
else void launchStartup();
