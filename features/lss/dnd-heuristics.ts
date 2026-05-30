import type { AbilityScores } from "@/features/characters/domain";

type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type ClassProfile = {
  hitDie: string;
  hitDieSize: number;
  saveProficiencies: StatKey[];
};

const DEFAULT_CLASS_PROFILE: ClassProfile = {
  hitDie: "d8",
  hitDieSize: 8,
  saveProficiencies: ["wis", "cha"]
};

const CLASS_PROFILES: Array<{
  patterns: RegExp[];
  profile: ClassProfile;
}> = [
  {
    patterns: [/варвар/i, /barbarian/i],
    profile: { hitDie: "d12", hitDieSize: 12, saveProficiencies: ["str", "con"] }
  },
  {
    patterns: [/бард/i, /bard/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["dex", "cha"] }
  },
  {
    patterns: [/жрец/i, /клирик/i, /cleric/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["wis", "cha"] }
  },
  {
    patterns: [/друид/i, /druid/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["int", "wis"] }
  },
  {
    patterns: [/воин/i, /fighter/i],
    profile: { hitDie: "d10", hitDieSize: 10, saveProficiencies: ["str", "con"] }
  },
  {
    patterns: [/монах/i, /monk/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["str", "dex"] }
  },
  {
    patterns: [/паладин/i, /paladin/i],
    profile: { hitDie: "d10", hitDieSize: 10, saveProficiencies: ["wis", "cha"] }
  },
  {
    patterns: [/следопыт/i, /рейнджер/i, /ranger/i],
    profile: { hitDie: "d10", hitDieSize: 10, saveProficiencies: ["str", "dex"] }
  },
  {
    patterns: [/плут/i, /разбойник/i, /rogue/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["dex", "int"] }
  },
  {
    patterns: [/чародей/i, /sorcerer/i],
    profile: { hitDie: "d6", hitDieSize: 6, saveProficiencies: ["con", "cha"] }
  },
  {
    patterns: [/колдун/i, /warlock/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["wis", "cha"] }
  },
  {
    patterns: [/волшебник/i, /маг/i, /wizard/i],
    profile: { hitDie: "d6", hitDieSize: 6, saveProficiencies: ["int", "wis"] }
  },
  {
    patterns: [/изобретатель/i, /артифицер/i, /artificer/i],
    profile: { hitDie: "d8", hitDieSize: 8, saveProficiencies: ["con", "int"] }
  }
];

export type LssDerivedMechanics = {
  armorClass: number;
  hitDie: string;
  hitPoints: number;
  saveProficiencies: StatKey[];
  speed: number;
};

export function deriveLssMechanics(input: {
  className: string;
  race: string;
  level: number;
  abilityScores: AbilityScores;
}): LssDerivedMechanics {
  const profile = resolveClassProfile(input.className);
  const constitutionModifier = abilityModifier(input.abilityScores.constitution);
  const dexterityModifier = abilityModifier(input.abilityScores.dexterity);
  const averageHitDieRoll = Math.floor(profile.hitDieSize / 2) + 1;
  const firstLevelHp = Math.max(1, profile.hitDieSize + constitutionModifier);
  const nextLevelHp = Math.max(1, averageHitDieRoll + constitutionModifier);

  return {
    armorClass: Math.max(1, 10 + dexterityModifier),
    hitDie: profile.hitDie,
    hitPoints: firstLevelHp + Math.max(0, input.level - 1) * nextLevelHp,
    saveProficiencies: profile.saveProficiencies,
    speed: resolveSpeed(input.race)
  };
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function resolveClassProfile(className: string): ClassProfile {
  return (
    CLASS_PROFILES.find((entry) =>
      entry.patterns.some((pattern) => pattern.test(className))
    )?.profile ?? DEFAULT_CLASS_PROFILE
  );
}

function resolveSpeed(race: string): number {
  if (/дварф|dwarf|гном|gnome|полурослик|halfling/i.test(race)) {
    return 25;
  }

  return 30;
}
