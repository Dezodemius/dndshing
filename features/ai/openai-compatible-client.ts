import type { GeneratedCharacter } from "@/features/characters/domain";
import { GeneratedCharacterSchema } from "@/features/characters/domain";

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

export async function generateCharacterWithOpenAiCompatibleApi(
  settings: AiSettings,
  prompt: string
): Promise<GeneratedCharacter> {
  const response = await fetch(resolveChatCompletionsUrl(settings.apiBaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.modelName,
      temperature: 0.7,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "Ты генерируешь D&D 5e персонажей и отвечаешь только валидным JSON по запрошенной схеме."
        },
        {
          role: "user",
          content: prompt
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

  const generatedJson: unknown = JSON.parse(content);

  return GeneratedCharacterSchema.parse(generatedJson);
}
