import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  YANDEX_FORM_WEBHOOK_SECRET: z.string().min(1).optional(),
  WEBHOOK_DEFAULT_FOLDER_ID: z.string().uuid().optional(),
  WEBHOOK_DEFAULT_USER_ID: z.string().uuid().optional(),
  AI_API_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL_NAME: z.string().min(1).optional()
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
}

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    YANDEX_FORM_WEBHOOK_SECRET: process.env.YANDEX_FORM_WEBHOOK_SECRET,
    WEBHOOK_DEFAULT_FOLDER_ID: process.env.WEBHOOK_DEFAULT_FOLDER_ID || undefined,
    WEBHOOK_DEFAULT_USER_ID: process.env.WEBHOOK_DEFAULT_USER_ID || undefined,
    AI_API_BASE_URL: process.env.AI_API_BASE_URL || undefined,
    AI_API_KEY: process.env.AI_API_KEY || undefined,
    AI_MODEL_NAME: process.env.AI_MODEL_NAME || undefined
  });
}
