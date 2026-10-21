// Headless checks for Johto ambient music resolution and map audio controller.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/games/firered/generated/constants.ts";
import { JOHTO_MUSIC_MAP, resolveJohtoMusic } from "../../src/viewer/audio/johtoMusic.ts";
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

console.log("PASS: Johto ambient music resolution and audio controller transitions.");
