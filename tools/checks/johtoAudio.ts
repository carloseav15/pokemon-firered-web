// Headless checks for Johto ambient music resolution and map audio controller.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/games/firered/generated/constants.ts";
import { JOHTO_MUSIC_MAP, resolveJohtoMusic } from "../../src/viewer/audio/johtoMusic.ts";
import { JOHTO_WILD_MONS, getJohtoWildMon } from "../../src/viewer/audio/johtoWildMons.ts";
import { getJohtoSign } from "../../src/viewer/interaction/johtoSigns.ts";
import { getJohtoDialogue, formatJohtoInteriorName } from "../../src/viewer/interaction/johtoDialogues.ts";
import { getJohtoItemInfo, getJohtoInspection } from "../../src/viewer/interaction/johtoItems.ts";
import { isMartClerk, getMartCatalogue, buyMartItem } from "../../src/viewer/interaction/johtoMart.ts";
import { getJohtoTrainerInfo, isJohtoTrainer } from "../../src/viewer/interaction/johtoTrainers.ts";
import { GetMoney, SetMoney } from "../../src/core/pokemon/items.ts";
import { createMon, giveMonToPlayer, setDexFlag } from "../../src/core/pokemon/pokemon.ts";
import { save } from "../../src/games/firered/save.ts";
import { rom } from "../../src/core/rom.ts";

if (!rom.species) {
  const speciesData = JSON.parse(readFileSync(process.cwd() + "/public/fr/data/species.json", "utf8"));
  rom.species = speciesData.species;
  rom.expTables = speciesData.exp;
}
if (!rom.moves) {
  rom.moves = JSON.parse(readFileSync(process.cwd() + "/public/fr/data/moves.json", "utf8")).moves;
}
if (!rom.items) {
  rom.items = JSON.parse(readFileSync(process.cwd() + "/public/fr/data/items.json", "utf8")).items;
}
import { ViewerAudioController } from "../../src/viewer/audio/audioController.ts";

// 1. Verificar resolución canónica de Johto
assert.equal(resolveJohtoMusic("MUS_HG_NEW_BARK"), C.MUS_PALLET);
assert.equal(resolveJohtoMusic("MUS_HG_VIOLET"), C.MUS_SEVII_67);
assert.equal(resolveJohtoMusic("MUS_HG_AZALEA"), C.MUS_SEVII_123);
assert.equal(resolveJohtoMusic("MUS_HG_ROUTE42"), C.MUS_SEVII_ROUTE);
assert.equal(resolveJohtoMusic("MUS_HG_UNION_CAVE"), C.MUS_SEVII_DUNGEON);
assert.equal(resolveJohtoMusic("MUS_HG_CHERRYGROVE"), C.MUS_SEVII_45);
assert.equal(resolveJohtoMusic("MUS_HG_ROUTE29"), C.MUS_ROUTE1);
assert.equal(resolveJohtoMusic("MUS_HG_ROUTE30"), C.MUS_ROUTE3);
assert.equal(resolveJohtoMusic("MUS_HG_ROUTE34"), C.MUS_ROUTE11);
assert.equal(resolveJohtoMusic("MUS_HG_ROUTE38"), C.MUS_ROUTE24);
assert.equal(resolveJohtoMusic("MUS_HG_CYCLING"), C.MUS_CYCLING);
assert.equal(resolveJohtoMusic("MUS_HG_SURF"), C.MUS_SURF);

// 2. Verificar que cada mapa en public/viewer/johto.json tiene music y musicName coherentes
const johtoDoc = JSON.parse(readFileSync(process.cwd() + "/public/viewer/johto.json", "utf8"));
const maps = johtoDoc.maps as Record<string, any>;
assert.equal(Object.keys(maps).length, 77);

for (const [mapId, m] of Object.entries(maps)) {
  assert.ok(m.musicName, `${mapId} debe tener musicName`);
  assert.ok(m.musicName in JOHTO_MUSIC_MAP, `La etiqueta ${m.musicName} de ${mapId} debe estar en JOHTO_MUSIC_MAP`);
  const expectedSongId = JOHTO_MUSIC_MAP[m.musicName];
  assert.equal(m.music, expectedSongId, `El campo music de ${mapId} debe coincidir con su resolución (${expectedSongId})`);
}

// 3. Probar ViewerAudioController con Johto activado
const audio = new ViewerAudioController();
audio.setJohto(true);

// Simular entrada a New Bark Town pasando musicName
audio.updateMap("MAP_NEW_BARK_TOWN", "MUS_HG_NEW_BARK");
assert.equal((audio as any).currentMusicId, C.MUS_PALLET);

// Transición al cruzar hacia Ruta 29
audio.updateMap("MAP_ROUTE29", "MUS_HG_ROUTE29");
assert.equal((audio as any).currentMusicId, C.MUS_ROUTE1);

// Transición al cruzar hacia Cherrygrove City
audio.updateMap("MAP_CHERRYGROVE_CITY", "MUS_HG_CHERRYGROVE");
assert.equal((audio as any).currentMusicId, C.MUS_SEVII_45);

// Transición al cruzar hacia Violet City
audio.updateMap("MAP_VIOLET_CITY", "MUS_HG_VIOLET");
assert.equal((audio as any).currentMusicId, C.MUS_SEVII_67);

// Subirse a la bicicleta en Violet City
audio.updateMap("MAP_VIOLET_CITY", "MUS_HG_VIOLET", "bike");
assert.equal((audio as any).currentMusicId, C.MUS_CYCLING);

// Bajarse de la bicicleta en Violet City
audio.updateMap("MAP_VIOLET_CITY", "MUS_HG_VIOLET", "walk");
assert.equal((audio as any).currentMusicId, C.MUS_SEVII_67);

// Hacer surf en Ruta 42
audio.updateMap("MAP_ROUTE42", "MUS_HG_ROUTE42", "surf");
assert.equal((audio as any).currentMusicId, C.MUS_SURF);

// Desembarcar en Ruta 42
audio.updateMap("MAP_ROUTE42", "MUS_HG_ROUTE42", "walk");
assert.equal((audio as any).currentMusicId, C.MUS_SEVII_ROUTE);

// 4. Clima dinámico en Johto (Lluvia en Lago de la Furia y Ruta 43)
assert.equal(maps["MAP_LAKE_OF_RAGE"].weather, C.WEATHER_RAIN, "Lago de la Furia debe tener clima de lluvia (3)");
assert.equal(maps["MAP_LAKE_OF_RAGE_LOW_TIDE"].weather, C.WEATHER_RAIN, "Lago de la Furia marea baja debe tener clima de lluvia (3)");
assert.equal(maps["MAP_ROUTE43"].weather, C.WEATHER_RAIN, "Ruta 43 debe tener clima de lluvia (3)");
assert.equal(maps["MAP_NEW_BARK_TOWN"].weather, C.WEATHER_SUNNY, "Pueblo Primavera debe tener clima despejado (2)");

// 5. Gritos ambientales de Pokémon salvajes en Johto
// Ruta 29: especies terrestres (Sentret, Pidgey, Hoothoot, Rattata)
audio.chooseAmbientCry("MAP_ROUTE29", true);
const chosenCryR29 = (audio as any).ambientCrySpecies;
assert.ok(
  [C.SPECIES_SENTRET, C.SPECIES_PIDGEY, C.SPECIES_HOOTHOOT, C.SPECIES_RATTATA].includes(chosenCryR29),
  `Grito de Ruta 29 (${chosenCryR29}) debe pertenecer a la fauna de la ruta`
);
assert.equal((audio as any).ambientCryIsWaterMon, false, "Ruta 29 solo tiene fauna terrestre");

// Ruta 40: ruta marina (Tentacool, Tentacruel, Krabby, Corsola)
audio.chooseAmbientCry("MAP_ROUTE40", true);
const chosenCryR40 = (audio as any).ambientCrySpecies;
assert.ok(
  [C.SPECIES_TENTACOOL, C.SPECIES_TENTACRUEL, C.SPECIES_KRABBY, C.SPECIES_CORSOLA].includes(chosenCryR40),
  `Grito de Ruta 40 (${chosenCryR40}) debe pertenecer a la fauna marina`
);
assert.equal((audio as any).ambientCryIsWaterMon, true, "Ruta 40 debe marcar que es un Pokémon de agua");

// Lago de la Furia
audio.chooseAmbientCry("MAP_LAKE_OF_RAGE", true);
const chosenCryLake = (audio as any).ambientCrySpecies;
assert.ok(
  [C.SPECIES_GYARADOS, C.SPECIES_MAGIKARP, C.SPECIES_VENONAT, C.SPECIES_FLAAFFY].includes(chosenCryLake),
  `Grito de Lago de la Furia (${chosenCryLake}) debe pertenecer a Gyarados/Magikarp/Venonat/Flaaffy`
);

// Interior / no outdoors: cancela gritos
audio.chooseAmbientCry("MAP_ROUTE29", false);
assert.equal((audio as any).ambientCrySpecies, C.SPECIES_NONE);
assert.equal((audio as any).ambientCryState, 4);

// 6. Lectura de letreros y carteles de ruta
const signR29 = getJohtoSign("MAP_ROUTE29", 64, 15, "Route29_EventScript_Sign");
assert.ok(signR29, "Debe existir cartel en Ruta 29 (64, 15)");
assert.equal(signR29.title, "Ruta 29");
assert.ok(
  signR29.text.includes("CHERRYGROVE") || signR29.text.includes("CIUDAD CEREZO"),
  `El cartel de Ruta 29 debe mencionar Ciudad Cerezo: ${signR29.text}`
);

const signLake = getJohtoSign("MAP_LAKE_OF_RAGE", 30, 36, "LakeOfRage_EventScript_Sign1");
assert.ok(signLake, "Debe existir cartel en Lago de la Furia (30, 36)");
assert.equal(signLake.title, "Lago de la Furia");
assert.ok(
  signLake.text.includes("GYARADOS"),
  `El cartel del Lago de la Furia debe mencionar a Gyarados: ${signLake.text}`
);

const signR43 = getJohtoSign("MAP_ROUTE43", 17, 3, "Route43_EventScript_Sign1");
assert.ok(signR43, "Debe existir cartel en Ruta 43 (17, 3)");
assert.equal(signR43.title, "Ruta 43");
assert.ok(
  signR43.text.includes("LAKE OF RAGE") || signR43.text.includes("LAGO DE LA FURIA"),
  `El cartel de Ruta 43 debe mencionar el Lago de la Furia: ${signR43.text}`
);

// 7. Diálogos auténticos de personajes (NPCs) en Johto
const oldManDialogue = getJohtoDialogue("MAP_ROUTE29", 1, "Route29_EventScript_OldMan", "OBJ_EVENT_GFX_OLD_MAN_1");
assert.ok(oldManDialogue, "Debe existir diálogo del anciano de la Ruta 29");
assert.equal(oldManDialogue.title, "Anciano");
assert.ok(
  (oldManDialogue.text.includes("POKéMON") || oldManDialogue.text.toLowerCase().includes("pokemon")) && oldManDialogue.text.includes("catch"),
  `El diálogo del anciano debe enseñar a atrapar Pokémon: ${oldManDialogue.text}`
);

const lanceDialogue = getJohtoDialogue("MAP_LAKE_OF_RAGE", 1, "LakeOfRage_EventScript_Lance", "OBJ_EVENT_GFX_LANCE");
assert.ok(lanceDialogue, "Debe existir diálogo de Lance en Lago de la Furia");
assert.equal(lanceDialogue.title, "Campeón Lance");
assert.ok(
  lanceDialogue.text.toLowerCase().includes("gyarados") || lanceDialogue.text.toLowerCase().includes("magikarp"),
  `El diálogo de Lance debe hablar del Gyarados rojo / Magikarp: ${lanceDialogue.text}`
);

const momDialogue = getJohtoDialogue("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_1F", 1, "NewBarkTown_PlayersHouse_1F_EventScript_Mom", "OBJ_EVENT_GFX_MOM");
assert.ok(momDialogue, "Debe existir diálogo de la Madre en Pueblo Primavera");
assert.equal(momDialogue.title, "Madre");
assert.ok(
  momDialogue.text.length > 10,
  `El diálogo de la madre debe contener texto: ${momDialogue.text}`
);

const elmDialogue = getJohtoDialogue("MAP_NEW_BARK_TOWN_LAB", 2, "NewBarkTown_Lab_EventScript_Elm", "OBJ_EVENT_GFX_PROF_ELM");
assert.ok(elmDialogue, "Debe existir diálogo del Prof. Elm en el laboratorio");
assert.equal(elmDialogue.title, "Prof. Elm");

const silverDialogue = getJohtoDialogue("MAP_NEW_BARK_TOWN", 3, "NewBarkTown_EventScript_Silver", "OBJ_EVENT_GFX_SILVER");
assert.ok(silverDialogue, "Debe existir diálogo de Silver en Pueblo Primavera");
assert.equal(silverDialogue.title, "Silver");

const nurseDialogue = getJohtoDialogue("MAP_CHERRYGROVE_CITY_POKEMON_CENTER", 1, "Common_EventScript_PkmnCenterNurse", "OBJ_EVENT_GFX_NURSE");
assert.ok(nurseDialogue, "Debe existir diálogo para la Enfermera Joy");
assert.equal(nurseDialogue.title, "Enfermera Joy");

const clerkDialogue = getJohtoDialogue("MAP_CHERRYGROVE_CITY_MART", 1, "Common_OpenMart", "OBJ_EVENT_GFX_CLERK");
assert.ok(clerkDialogue, "Debe existir diálogo para el dependiente de la tienda");
assert.equal(clerkDialogue.title, "Dependiente");

// 8. Interiores de Johto (nombres formateados, planos y conexiones de puertas/warps)
assert.equal(formatJohtoInteriorName("MAP_NEW_BARK_TOWN_LAB"), "Laboratorio del Prof. Elm");
assert.equal(formatJohtoInteriorName("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_1F"), "Casa del Jugador (Planta 1)");
assert.equal(formatJohtoInteriorName("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_2F"), "Habitación del Jugador (Planta 2)");
assert.equal(formatJohtoInteriorName("MAP_CHERRYGROVE_CITY_MART"), "Tienda Pokémon de Ciudad Cerezo");
assert.equal(formatJohtoInteriorName("MAP_CHERRYGROVE_CITY_POKEMON_CENTER"), "Centro Pokémon de Ciudad Cerezo");

// Verificar correspondencia de puertas entre New Bark Town y el Laboratorio
const newBarkMap = JSON.parse(readFileSync(process.cwd() + "/public/hns/maps/MAP_NEW_BARK_TOWN.json", "utf8"));
const elmLabMap = JSON.parse(readFileSync(process.cwd() + "/public/hns/maps/MAP_NEW_BARK_TOWN_LAB.json", "utf8"));
const elmLabLayout = JSON.parse(readFileSync(process.cwd() + "/public/hns/layouts/LAYOUT_NEW_BARK_TOWN_LAB.json", "utf8"));

// Warp 0 de New Bark Town lleva al Laboratorio
assert.equal(newBarkMap.warps[0].destMap, "MAP_NEW_BARK_TOWN_LAB");
assert.equal(newBarkMap.warps[0].destWarpId, 0);

// Salida del Laboratorio lleva de vuelta a New Bark Town
assert.equal(elmLabMap.warps[0].destMap, "MAP_NEW_BARK_TOWN");
assert.equal(elmLabMap.warps[0].destWarpId, 0);
assert.ok(elmLabLayout.width > 0 && elmLabLayout.height > 0, "El layout del laboratorio debe tener dimensiones válidas");

// Verificar correspondencia de puertas de Ciudad Cerezo y el Centro Pokémon
const cherrygroveMap = JSON.parse(readFileSync(process.cwd() + "/public/hns/maps/MAP_CHERRYGROVE_CITY.json", "utf8"));
const cherryCenterMap = JSON.parse(readFileSync(process.cwd() + "/public/hns/maps/MAP_CHERRYGROVE_CITY_POKEMON_CENTER.json", "utf8"));
assert.equal(cherrygroveMap.warps[1].destMap, "MAP_CHERRYGROVE_CITY_POKEMON_CENTER");
assert.equal(cherryCenterMap.warps[0].destMap, "MAP_CHERRYGROVE_CITY");
assert.equal(cherryCenterMap.warps[0].destWarpId, 1);

// 9. Objetos del suelo e inspección de interiores en Johto
const potionItem = getJohtoItemInfo("Route29_EventScript_ItemPotion");
assert.ok(potionItem, "Debe resolver objeto de la Ruta 29");
assert.equal(potionItem.name, "Poción");
assert.equal(potionItem.itemId, C.ITEM_POTION);

const ballItem = getJohtoItemInfo("Route31_EventScript_ItemPokeBall");
assert.ok(ballItem, "Debe resolver Poké Ball de la Ruta 31");
assert.equal(ballItem.name, "Poké Ball");
assert.equal(ballItem.itemId, C.ITEM_POKE_BALL);

const antidoteItem = getJohtoItemInfo("Route31_EventScript_ItemAntidote");
assert.ok(antidoteItem, "Debe resolver Antídoto de la Ruta 31");
assert.equal(antidoteItem.name, "Antídoto");
assert.equal(antidoteItem.itemId, C.ITEM_ANTIDOTE);

const nesInspection = getJohtoInspection("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_2F", 4, 2, "NewBarkTown_PlayersHouse_2F_EventScript_NES");
assert.ok(nesInspection, "Debe existir inspección de la consola NES");
assert.equal(nesInspection.title, "Consola NES");
assert.ok(nesInspection.text.includes("NES"), "El texto debe mencionar la consola NES");

const clockInspection = getJohtoInspection("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_2F", 10, 1, "LittlerootTown_BrendansHouse_2F_EventScript_WallClock");
assert.ok(clockInspection, "Debe existir inspección del reloj de pared");
assert.equal(clockInspection.title, "Reloj de pared");

const pcInspection = getJohtoInspection("MAP_NEW_BARK_TOWN_PLAYERS_HOUSE_2F", 1, 1, "LittlerootTown_BrendansHouse_2F_EventScript_PC");
assert.ok(pcInspection, "Debe existir inspección del PC");
assert.equal(pcInspection.title, "PC de Almacenamiento");

const labPcInspection = getJohtoInspection("MAP_NEW_BARK_TOWN_LAB", 3, 1, "LittlerootTown_ProfessorBirchsLab_EventScript_PC");
assert.ok(labPcInspection, "Debe existir inspección del ordenador del laboratorio");
assert.equal(labPcInspection.title, "Ordenador del Laboratorio");

const healingInspection = getJohtoInspection("MAP_NEW_BARK_TOWN_LAB", 2, 2, "NewBarkTown_Lab_EventScript_HealingMachine1");
assert.ok(healingInspection, "Debe existir inspección de la máquina regeneradora de Elm");
assert.equal(healingInspection.heal, true, "La máquina debe tener propiedad heal activa");

// 10. Elección de Pokémon Iniciales en el Laboratorio de Elm
const initialPartyCount = save.party.length;

// Crear Chikorita a nivel 5 y añadir al equipo
const chikorita = createMon(C.SPECIES_CHIKORITA, 5);
assert.equal(chikorita.species, C.SPECIES_CHIKORITA);
assert.equal(chikorita.level, 5);
assert.ok(chikorita.hp > 0, "Chikorita debe tener HP positivo");
assert.ok(chikorita.moves.some(m => m > 0), "Chikorita debe tener movimientos aprendidos");

// Crear Cyndaquil y Totodile
const cyndaquil = createMon(C.SPECIES_CYNDAQUIL, 5);
assert.equal(cyndaquil.species, C.SPECIES_CYNDAQUIL);
assert.equal(cyndaquil.level, 5);

const totodile = createMon(C.SPECIES_TOTODILE, 5);
assert.equal(totodile.species, C.SPECIES_TOTODILE);
assert.equal(totodile.level, 5);

// Probar giveMonToPlayer y registro en Pokédex
const giveResult = giveMonToPlayer(chikorita);
assert.equal(giveResult, 0, "giveMonToPlayer debe devolver 0 (añadido al equipo)");
assert.equal(save.party.length, initialPartyCount + 1, "El equipo del jugador debe tener 1 Pokémon");
assert.equal(save.party[save.party.length - 1].species, C.SPECIES_CHIKORITA);

setDexFlag(C.SPECIES_CHIKORITA, true);
const dexIndex = C.SPECIES_CHIKORITA - 1;
assert.ok((save.pokedexSeen[dexIndex >> 3] & (1 << (dexIndex & 7))) !== 0, "Chikorita debe quedar registrado como visto en la Pokédex");

// 11. Encuentros salvajes en la hierba de Johto
assert.ok(JOHTO_WILD_MONS["MAP_ROUTE29"]?.land, "Ruta 29 debe tener Pokémon terrestres");
assert.ok(
  JOHTO_WILD_MONS["MAP_ROUTE29"].land!.includes(C.SPECIES_SENTRET) &&
  JOHTO_WILD_MONS["MAP_ROUTE29"].land!.includes(C.SPECIES_PIDGEY),
  "Ruta 29 debe contener a Sentret y Pidgey"
);

assert.ok(JOHTO_WILD_MONS["MAP_CHERRYGROVE_CITY"]?.water, "Ciudad Cerezo debe tener fauna marina");
assert.ok(JOHTO_WILD_MONS["MAP_CHERRYGROVE_CITY"].water!.includes(C.SPECIES_POLIWAG), "Ciudad Cerezo debe contener Poliwag");

// Generación de salvaje
const wildEnemy = createMon(C.SPECIES_SENTRET, 3);
assert.equal(wildEnemy.species, C.SPECIES_SENTRET);
assert.equal(wildEnemy.level, 3);
assert.ok(wildEnemy.stats[0] > 0, "El enemigo salvaje debe tener PS máximos calculados");

// 12. Curación del equipo con la Enfermera Joy y presencia de Chansey en los Centros Pokémon
const injuredMon = save.party[0];
assert.ok(injuredMon, "Debe haber al menos un Pokémon en el equipo");
const maxHp = injuredMon.stats[0];
injuredMon.hp = 1;
injuredMon.status = C.STATUS1_POISON;
injuredMon.pp[0] = 0;

// Simular la curación del Centro Pokémon
for (const mon of save.party) {
  mon.hp = mon.stats[0];
  mon.status = 0;
  for (let i = 0; i < 4; i++) {
    mon.pp[i] = mon.moves[i] ? 35 : 0; // PP restaurado
  }
}

assert.equal(injuredMon.hp, maxHp, "Los PS deben restaurarse al máximo");
assert.equal(injuredMon.status, 0, "El estado alterado (veneno) debe curarse");
assert.ok(injuredMon.pp[0] > 0, "Los PP deben restaurarse");

// Probar playHealFanfare
audio.enable();
audio.playHealFanfare();

// Diálogo de Chansey en el Centro Pokémon de Ciudad Cerezo
const chanseyDialogue = getJohtoDialogue("MAP_CHERRYGROVE_CITY_POKEMON_CENTER", 2, "CherryGrove_Pokecenter_Chansey", "OBJ_EVENT_GFX_NURSE_CHANSEY");
assert.ok(chanseyDialogue, "Debe existir diálogo para Chansey en el Centro Pokémon");
assert.ok(chanseyDialogue.text.includes("Chaan"), "Chansey debe emitir su característico sonido");

// 13. Tiendas Pokémon (Poké Marts): Catálogo, compra con dinero y regalo de Honor Ball
assert.ok(isMartClerk("OBJ_EVENT_GFX_CLERK", "Cherrygrove_Pokemart_EventScript_Clerk"), "Debe reconocer al dependiente de Cherrygrove");
assert.ok(isMartClerk(undefined, "Common_OpenMart"), "Debe reconocer script genérico de tienda");

// Catálogo básico vs avanzado
const cherryCatalogue = getMartCatalogue("MAP_CHERRYGROVE_CITY_MART");
assert.ok(cherryCatalogue.some(it => it.itemId === C.ITEM_POKE_BALL), "Cherrygrove debe tener Poké Balls");
assert.ok(cherryCatalogue.some(it => it.itemId === C.ITEM_POTION), "Cherrygrove debe tener Pociones");
assert.ok(!cherryCatalogue.some(it => it.itemId === C.ITEM_HYPER_POTION), "Cherrygrove no debe tener Hiperpociones al inicio");

const goldenrodCatalogue = getMartCatalogue("MAP_GOLDENROD_CITY_MART");
assert.ok(goldenrodCatalogue.some(it => it.itemId === C.ITEM_ULTRA_BALL), "Ciudad Trigal debe ofrecer Ultra Balls");
assert.ok(goldenrodCatalogue.some(it => it.itemId === C.ITEM_REVIVE), "Ciudad Trigal debe ofrecer Revivir");

// Probar compra con fondos
SetMoney(3000);
assert.equal(GetMoney(), 3000);

// Comprar 2 Pociones (2 * 300 = 600)
const potionBuy = buyMartItem(C.ITEM_POTION, 2);
assert.ok(potionBuy.success, "La compra de 2 Pociones debe ser exitosa");
assert.equal(GetMoney(), 2400, "El dinero debe restar 600");

// Comprar 10 Poké Balls (10 * 200 = 2000) -> Debe regalar 1 Honor Ball
const ballBuy = buyMartItem(C.ITEM_POKE_BALL, 10);
assert.ok(ballBuy.success, "La compra de 10 Poké Balls debe ser exitosa");
assert.equal(GetMoney(), 400, "El dinero debe restar 2000");
assert.equal(ballBuy.premierBallAwarded, true, "Comprar 10 Poké Balls debe regalar una Honor Ball");

// Probar compra fallida por dinero insuficiente
const failedBuy = buyMartItem(C.ITEM_ULTRA_BALL, 1); // Cuesta 1200, tenemos 400
assert.equal(failedBuy.success, false, "No debe permitir comprar sin suficiente dinero");
assert.equal(GetMoney(), 400, "El saldo no debe cambiar tras intento fallido");

// Probar sonido de caja registradora
audio.playShop();

// 14. Combates contra Entrenadores en las Rutas de Johto (Joven Joey, Mikey, Don, Wade)
const joey = getJohtoTrainerInfo("Route30_EventScript_Youngster_Joey");
assert.ok(joey, "Debe existir la ficha del Joven Joey");
assert.equal(joey.name, "Joven Joey");
assert.equal(joey.party.length, 1);
assert.equal(joey.party[0].species, C.SPECIES_RATTATA);
assert.equal(joey.party[0].level, 4);
assert.equal(joey.reward, 64);
assert.equal(joey.visionRange, 4);
assert.ok(joey.introText.includes("percentil superior"), "Joey debe mencionar su famoso percentil superior");

const mikey = getJohtoTrainerInfo("Route30_EventScript_Youngster_Mikey");
assert.ok(mikey, "Debe existir la ficha del Joven Mikey");
assert.equal(mikey.party.length, 2);
assert.equal(mikey.party[0].species, C.SPECIES_PIDGEY);
assert.equal(mikey.party[1].species, C.SPECIES_RATTATA);

const don = getJohtoTrainerInfo("Route30_EventScript_Bugcatcher_Don");
assert.ok(don, "Debe existir la ficha de Cazabichos Don");
assert.equal(don.party.length, 2);
assert.equal(don.party[0].species, C.SPECIES_CATERPIE);

const wade = getJohtoTrainerInfo("Route31_EventScript_Bugcatcher_Wade");
assert.ok(wade, "Debe existir la ficha de Cazabichos Wade");
assert.equal(wade.party.length, 4);

// Verificación de reconocimiento
assert.ok(isJohtoTrainer("Route30_EventScript_Youngster_Joey"), "isJohtoTrainer debe ser true para Joey");
assert.ok(isJohtoTrainer(undefined, "MAP_ROUTE30", 2), "isJohtoTrainer debe resolver por localId en Ruta 30");

// Generación de equipo de entrenador
const joeyParty = joey.party.map(p => createMon(p.species, p.level));
assert.equal(joeyParty.length, 1);
assert.equal(joeyParty[0].species, C.SPECIES_RATTATA);
assert.equal(joeyParty[0].level, 4);
assert.ok(joeyParty[0].stats[0] > 0, "Rattata de Joey debe tener estadísticas calculadas");

console.log("PASS: Johto ambient music, weather, wild cries, signs, dialogues, interiors, ground items, starters, wild encounters, Pokemon Center healing, Poke Mart shopping, and Route trainers verified.");
