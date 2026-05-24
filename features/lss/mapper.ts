import type { GeneratedCharacter, InternalCharacter } from "@/features/characters/domain";
import { createInternalCharacter } from "@/features/characters/factory";

import type { LssCharacterJson } from "./schema";
import { LssCharacterJsonSchema } from "./schema";

export function internalToLssJson(
  character: InternalCharacter,
  exportedAt = new Date().toISOString()
): LssCharacterJson {
  return LssCharacterJsonSchema.parse({
    format: "longstoryshort.character.v1",
    name: character.identity.characterName,
    player: {
      name: character.identity.playerName
    },
    profile: {
      race: character.identity.race,
      class: character.identity.class,
      level: character.identity.level,
      gender: character.identity.gender
    },
    roleplay: {
      backstory: character.roleplay.shortBackstory,
      appearance: character.roleplay.appearance,
      personality: character.roleplay.personality,
      fears: character.roleplay.fears,
      goals: character.roleplay.goals
    },
    mechanics: {
      system: "dnd-5e",
      abilityScores: character.mechanics.abilityScores,
      proficiencyBonus: character.mechanics.proficiencyBonus
    },
    assets: {
      avatarUrl: character.assets.avatarUrl
    },
    exportedAt
  });
}

export function lssJsonToInternal(
  json: LssCharacterJson,
  rawPrompt = "Imported from longstoryshort JSON"
): InternalCharacter {
  const generated: GeneratedCharacter = {
    characterName: json.name,
    race: json.profile.race,
    class: json.profile.class,
    level: json.profile.level,
    gender: json.profile.gender,
    shortBackstory: json.roleplay.backstory,
    appearance: json.roleplay.appearance,
    personality: json.roleplay.personality,
    fears: json.roleplay.fears,
    goals: json.roleplay.goals,
    abilityScores: json.mechanics.abilityScores,
    avatarPrompt: null
  };

  return createInternalCharacter({
    generated,
    playerName: json.player.name,
    avatarUrl: json.assets.avatarUrl,
    rawPrompt,
    createdAt: json.exportedAt
  });
}
