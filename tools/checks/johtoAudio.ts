// Headless checks for Johto ambient music resolution and map audio controller.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/games/firered/generated/constants.ts";
import { JOHTO_MUSIC_MAP, resolveJohtoMusic } from "../../src/viewer/audio/johtoMusic.ts";
import { JOHTO_WILD_MONS, getJohtoWildMon } from "../../src/viewer/audio/johtoWildMons.ts";
import { getJohtoSign } from "../../src/viewer/interaction/johtoSigns.ts";
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

console.log("PASS: Johto ambient music, weather, wild cries and sign reading verified.");
