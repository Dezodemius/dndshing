import type { GeneratedCharacter } from "@/features/characters/domain";
import { GeneratedCharacterSchema } from "@/features/characters/domain";
import type { FormIntake } from "@/features/webhooks/yandex-form.schema";
import { FormIntakeSchema } from "@/features/webhooks/yandex-form.schema";

import type { AiSettings } from "./domain";

const chatCompletionResponseSchema = {
  parse(value: unknown): { choices: { message: { content: string | null } }[] } {
    if (!value || typeof value !== "object") {
      throw new Error("AI response is not an object.");
    }

    const choices = Reflect.get(value, "choices");

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error("AI response does not contain choices.");
    }

    const firstChoice = choices[0];

    if (!firstChoice || typeof firstChoice !== "object") {
      throw new Error("AI choice is not an object.");
    }

    const message = Reflect.get(firstChoice, "message");

    if (!message || typeof message !== "object") {
      throw new Error("AI choice does not contain a message.");
    }

    const content = Reflect.get(message, "content");

    if (content !== null && typeof content !== "string") {
      throw new Error("AI message content is not a string.");
    }

    return {
      choices: [
        {
          message: {
            content
          }
        }
      ]
    };
  }
};

function resolveChatCompletionsUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, "");

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

async function requestJsonWithOpenAiCompatibleApi(input: {
  settings: AiSettings;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}): Promise<unknown> {
  const response = await fetch(resolveChatCompletionsUrl(input.settings.apiBaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.settings.modelName,
      temperature: input.temperature,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: input.systemPrompt
        },
        {
          role: "user",
          content: input.userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI request failed with ${response.status}: ${body}`);
  }

  const payload = chatCompletionResponseSchema.parse(await response.json());
  const content = payload.choices[0]?.message.content;

  if (!content) {
    throw new Error("AI returned an empty message.");
  }

  return JSON.parse(content) as unknown;
}

export async function extractFormIntakeWithOpenAiCompatibleApi(
  settings: AiSettings,
  prompt: string
): Promise<FormIntake> {
  const generatedJson = await requestJsonWithOpenAiCompatibleApi({
    settings,
    systemPrompt:
      "Ты анализируешь ответы из формы игрока и отвечаешь только валидным JSON по запрошенной схеме.",
    userPrompt: prompt,
    temperature: 0
  });

  return FormIntakeSchema.parse(generatedJson);
}

export async function generateCharacterWithOpenAiCompatibleApi(
  settings: AiSettings,
  prompt: string
): Promise<GeneratedCharacter> {
  const generatedJson = await requestJsonWithOpenAiCompatibleApi({
    settings,
    systemPrompt:
      "Ты генерируешь D&D 5e персонажей и отвечаешь только валидным JSON по запрошенной схеме.",
    userPrompt: prompt,
    temperature: 0.7
  });

  return GeneratedCharacterSchema.parse(generatedJson);
}
