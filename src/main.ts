import "./styles.css";
import { launchFireRed } from "./fr/boot";
import { launchStartup } from "./fr/startup";

// ?fr=new / ?fr=continue / ?fr=sandbox skip the intro and boot the FireRed engine directly.
const direct = new URLSearchParams(location.search).get("fr");
if (direct === "sandbox") void launchFireRed({ mode: "sandbox" });
else if (direct === "new") void launchFireRed({ mode: "new", playerName: "RED", gender: 0, rivalName: "GREEN" });
else if (direct === "continue") void launchFireRed({ mode: "continue" });
else void launchStartup();
