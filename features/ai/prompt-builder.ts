const MAX_RAW_WEBHOOK_CHARS = 16000;

export function buildLssCharacterPrompt(input: {
  rawWebhookBody: unknown;
  rawWebhookText: string;
  rawAnswers?: Record<string, string>;
}): string {
  const rawBody = stringifyForPrompt(input.rawWebhookBody);
  const rawAnswers = stringifyForPrompt(input.rawAnswers ?? {});

  return [
    "На основе входящего текста/webhook-а с ответами игрока сгенерируй D&D 5e персонажа для Long Story Short.",
    "Вход может быть plain text, JSON, экранированный JSON, form-urlencoded или любой другой текст. Сначала извлеки смысл ответов игрока, затем создай персонажа.",
    "Персонаж должен быть логичным, не overpowered, пригодным для roleplay и соответствовать атмосфере D&D.",
    "Не генерируй сложный spellbook, inventory, combat automation или dice logic. Достаточно базового листа и roleplay-секций.",
    "",
    "Верни только валидный JSON без markdown.",
    "Формат ответа - Long Story Short character JSON:",
    "- top-level jsonType должен быть \"character\"",
    "- version должен быть строкой",
    "- edition должен быть строкой",
    "- data должен быть JSON-строкой, а не объектом",
    "- внутри data должны быть jsonType, name, info, stats, saves, skills, text, avatar, createdAt и остальные базовые поля LSS",
    "- если картинки персонажа нет, оставь avatar пустым объектом или пустыми jpeg/webp",
    "- не добавляй PDF, PDF будет формироваться отдельным этапом",
    "",
    "Минимальный top-level shape:",
    "{",
    '  "tags": [],',
    '  "rooms": [],',
    '  "disabledBlocks": { "info-left": [], "info-right": [], "subinfo-left": [], "subinfo-right": [], "notes-left": [], "notes-right": [], "_id": "string" },',
    '  "edition": "2014",',
    '  "spells": { "mode": "text", "prepared": [], "book": [], "edition": "2024" },',
    '  "data": "{...stringified LSS character data...}",',
    '  "lastWriterSessionId": "string",',
    '  "jsonType": "character",',
    '  "version": "2"',
    "}",
    "",
    "Сырой текст webhook-а:",
    input.rawWebhookText,
    "",
    `Сырой JSON/body после лучшего парсинга:\n${rawBody}`,
    "",
    `Плоские извлечённые значения, если удалось:\n${rawAnswers}`
  ].join("\n");
}

function stringifyForPrompt(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2) ?? "null";

  if (serialized.length <= MAX_RAW_WEBHOOK_CHARS) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_RAW_WEBHOOK_CHARS)}\n...truncated`;
}
