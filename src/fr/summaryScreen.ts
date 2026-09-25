// pokemon_summary_screen.c faithfully ported in pokemonSummaryScreen.ts.
// Re-export public API here for backward compatibility.

export {
  ShowPokemonSummaryScreen,
  ShowSelectMovePokemonSummaryScreen,
  GetLastViewedMonIndex,
  GetMoveSlotToReplace,
  PokemonSummaryScreenMode,
  preloadSummaryScreen,
} from "./pokemonSummaryScreen";
