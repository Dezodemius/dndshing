import { z } from "zod";

export const AbilityScoresSchema = z.object({
  strength: z.number().int().min(1).max(30),
  dexterity: z.number().int().min(1).max(30),
  constitution: z.number().int().min(1).max(30),
  intelligence: z.number().int().min(1).max(30),
  wisdom: z.number().int().min(1).max(30),
  charisma: z.number().int().min(1).max(30)
});

export const GeneratedCharacterSchema = z.object({
  characterName: z.string().min(1).max(120),
  race: z.string().min(1).max(80),
  class: z.string().min(1).max(80),
  level: z.number().int().min(1).max(20).default(1),
  gender: z.string().min(1).max(80).nullable().default(null),
  shortBackstory: z.string().min(1).max(4000),
  appearance: z.string().min(1).max(2000),
  personality: z.string().min(1).max(2000),
  fears: z.string().min(1).max(1000),
  goals: z.string().min(1).max(1000),
  abilityScores: AbilityScoresSchema,
  avatarPrompt: z.string().max(1000).nullable().default(null)
});

export const InternalCharacterSchema = z.object({
  schemaVersion: z.literal("internal.character.v1"),
  identity: z.object({
    characterName: z.string().min(1).max(120),
    playerName: z.string().min(1).max(120),
    race: z.string().min(1).max(80),
    class: z.string().min(1).max(80),
    level: z.number().int().min(1).max(20),
    gender: z.string().nullable()
  }),
  roleplay: z.object({
    shortBackstory: z.string().min(1),
    appearance: z.string().min(1),
    personality: z.string().min(1),
    fears: z.string().min(1),
    goals: z.string().min(1)
  }),
  mechanics: z.object({
    edition: z.literal("dnd-5e"),
    abilityScores: AbilityScoresSchema,
    proficiencyBonus: z.number().int().min(2).max(6)
  }),
  assets: z.object({
    avatarUrl: z.string().url().nullable(),
    avatarPrompt: z.string().nullable()
  }),
  metadata: z.object({
    source: z.enum(["ai", "import", "manual"]),
    rawPrompt: z.string(),
    createdAt: z.string().datetime()
  })
});

export const CharacterSummarySchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid(),
  playerName: z.string(),
  characterName: z.string(),
  race: z.string(),
  class: z.string(),
  level: z.number().int(),
  gender: z.string().nullable(),
  shortBackstory: z.string(),
  appearance: z.string(),
  personality: z.string(),
  fears: z.string(),
  goals: z.string(),
  avatarUrl: z.string().nullable(),
  generatedJsonPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userId: z.string().uuid()
});

export type AbilityScores = z.infer<typeof AbilityScoresSchema>;
export type GeneratedCharacter = z.infer<typeof GeneratedCharacterSchema>;
export type InternalCharacter = z.infer<typeof InternalCharacterSchema>;
export type CharacterSummary = z.infer<typeof CharacterSummarySchema>;
