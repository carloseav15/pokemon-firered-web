// ADAPTATION: the unified world's ferry is not a ship route from FireRed or Emerald.
// Landing tiles are beside the existing port sailors; source NPC coordinates remain unchanged.
import type { RegionalNavigation, RegionId } from './regionSave';

export function ferryDestination(region: RegionId): RegionalNavigation {
  return region === 'hoenn'
    ? { region, mapId: 'MAP_SLATEPORT_CITY', x: 36, y: 41, direction: 'east', dynamic: null }
    : { region, mapId: 'MAP_VERMILION_CITY', x: 24, y: 34, direction: 'north', dynamic: null };
}

export function ferryUrl(region: RegionId): string {
  return `/world.html?region=${region}&ferry=1#modo=explore&mapa=${ferryDestination(region).mapId}`;
}
