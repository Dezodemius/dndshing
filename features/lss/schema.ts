import { z } from "zod";

import { AbilityScoresSchema } from "@/features/characters/domain";

export const LssCharacterJsonSchema = z.object({
  format: z.literal("longstoryshort.character.v1"),
  name: z.string().min(1),
  player: z.object({
    name: z.string().min(1)
  }),
  profile: z.object({
    race: z.string().min(1),
    class: z.string().min(1),
    level: z.number().int().min(1).max(20),
    gender: z.string().nullable()
  }),
  roleplay: z.object({
    backstory: z.string().min(1),
    appearance: z.string().min(1),
    personality: z.string().min(1),
    fears: z.string().min(1),
    goals: z.string().min(1)
  }),
  mechanics: z.object({
    system: z.literal("dnd-5e"),
    abilityScores: AbilityScoresSchema,
    proficiencyBonus: z.number().int().min(2).max(6)
  }),
  assets: z.object({
    avatarUrl: z.string().url().nullable()
  }),
  exportedAt: z.string().datetime()
});

export type LssCharacterJson = z.infer<typeof LssCharacterJsonSchema>;
