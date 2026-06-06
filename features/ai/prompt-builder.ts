const MAX_RAW_WEBHOOK_CHARS = 16000;

export function buildCharacterGenerationPrompt(input: {
  rawWebhookBody: unknown;
  rawWebhookText: string;
}): string {
  const rawBody = stringifyForPrompt(input.rawWebhookBody);

  return [
    "На основе входящего текста/webhook-а с ответами игрока сгенерируй D&D 5e персонажа.",
    "Вход может быть plain text, JSON, экранированный JSON или любой другой текст. Извлеки смысл ответов игрока и создай персонажа.",
    "Персонаж должен быть логичным, не overpowered, пригодным для roleplay и соответствовать атмосфере D&D.",
    "",
    "Верни только валидный JSON без markdown, строго по этой схеме:",
    "{",
    '  "playerName": "имя реального игрока",',
    '  "characterName": "имя персонажа",',
    '  "race": "раса персонажа",',
    '  "class": "класс персонажа",',
    '  "level": 1,',
    '  "gender": "пол или null",',
    '  "shortBackstory": "краткая предыстория (2-5 предложений)",',
    '  "appearance": "внешность персонажа (2-4 предложения)",',
    '  "personality": "характер и личность (2-4 предложения)",',
    '  "fears": "страхи и слабости (1-3 предложения)",',
    '  "goals": "цели и мотивы (1-3 предложения)",',
    '  "abilityScores": {',
    '    "strength": 10,',
    '    "dexterity": 10,',
    '    "constitution": 10,',
    '    "intelligence": 10,',
    '    "wisdom": 10,',
    '    "charisma": 10',
    "  },",
    '  "avatarPrompt": null',
    "}",
    "",
    "Правила:",
    "- Все числовые характеристики от 1 до 30, сумма примерно 70-78",
    "- level от 1 до 20",
    "- Если playerName не указан в ответах, используй \"Игрок\"",
    "- avatarPrompt можно заполнить коротким английским описанием для генерации аватара, или оставить null",
    "",
    "Сырой текст webhook-а:",
    input.rawWebhookText,
    "",
    `Сырой JSON/body:\n${rawBody}`
  ].join("\n");
}

function stringifyForPrompt(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2) ?? "null";

  if (serialized.length <= MAX_RAW_WEBHOOK_CHARS) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_RAW_WEBHOOK_CHARS)}\n...truncated`;
}
