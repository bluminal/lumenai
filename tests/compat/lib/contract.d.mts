export interface Entrypoint {
  id: string;
  kind: 'command' | 'agent';
  source: string;
  skill: string;
}

export interface SkillTreeValidation {
  missing: string[];
  unexpected: string[];
  invalid: string[];
}

export interface InventoryValidation {
  expected: string[];
  discovered: string[];
  missing: string[];
  unexpected: string[];
}

export function readExpectedEntrypoints(pluginRoot: string): Entrypoint[];

export function validateSkillTree(
  pluginRoot: string,
  entries: Entrypoint[],
): SkillTreeValidation;

export function assertCompleteInventory(
  entries: Entrypoint[],
  discoveredIds: string[],
): InventoryValidation;
