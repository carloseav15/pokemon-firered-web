import type { WarpAddress } from "./navigation";
export type ElevatorChoice = { label:string; floor:number; destination:WarpAddress|null; autoExit?:boolean };
export type ElevatorDefinition = { source:string; panels:Array<{x:number;y:number;elevation:number}>;
  choices:ElevatorChoice[]; requiredFlag:string|null; deniedText:string|null; floors:Record<string,number> };
export async function loadElevators():Promise<Record<string,ElevatorDefinition>> {
  const response=await fetch("/viewer/elevators.json");
  if(!response.ok)throw Error(`Elevator source data: HTTP ${response.status}`);
  return (await response.json()).elevators;
}
