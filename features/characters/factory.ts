import type { GeneratedCharacter, InternalCharacter } from "./domain";
import { InternalCharacterSchema } from "./domain";

function proficiencyBonusForLevel(level: number) {
  return Math.ceil(level / 4) + 1;
}

export function createInternalCharacter(input: {
  generated: GeneratedCharacter;
  playerName: string;
  avatarUrl: string | null;
  rawPrompt: string;
  createdAt: string;
}): InternalCharacter {
  const { generated, playerName, avatarUrl, rawPrompt, createdAt } = input;

  return InternalCharacterSchema.parse({
    schemaVersion: "internal.character.v1",
    identity: {
      characterName: generated.characterName,
      playerName,
      race: generated.race,
      class: generated.class,
      level: generated.level,
      gender: generated.gender
    },
    roleplay: {
      shortBackstory: generated.shortBackstory,
      appearance: generated.appearance,
      personality: generated.personality,
      fears: generated.fears,
      goals: generated.goals
    },
    mechanics: {
      edition: "dnd-5e",
      abilityScores: generated.abilityScores,
      proficiencyBonus: proficiencyBonusForLevel(generated.level)
    },
    assets: {
      avatarUrl,
      avatarPrompt: generated.avatarPrompt
    },
    metadata: {
      source: "ai",
      rawPrompt,
      createdAt
    }
  });
}
