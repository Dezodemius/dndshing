import type {
  YandexFormWebhookEnvelope,
  YandexFormWebhookPayload
} from "@/features/webhooks/yandex-form.schema";

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

export function buildFormIntakePrompt(envelope: YandexFormWebhookEnvelope): string {
  const rawBody = stringifyForPrompt(envelope.rawBody);
  const rawAnswers = stringifyForPrompt(envelope.rawAnswers ?? {});

  return [
    "Проанализируй сырой JSON webhook-а Яндекс Форм и приведи ответы игрока к нормализованному intake JSON.",
    "Твоя задача - понять смысл полей формы, даже если в payload нет человекочитаемых названий вопросов.",
    "Если видишь технические question.id/slug и порядок вопросов, используй их как вспомогательный контекст, но не выдумывай факты.",
    "",
    "Верни только валидный JSON без markdown.",
    "JSON должен иметь поля:",
    "{",
    '  "playerName": "string",',
    '  "gameDate": "YYYY-MM-DD или null",',
    '  "answers": {',
    '    "characterName": "string | отсутствует",',
    '    "racePreference": "string | отсутствует",',
    '    "classPreference": "string | отсутствует",',
    '    "gender": "string | отсутствует",',
    '    "age": "string | отсутствует",',
    '    "origin": "string | отсутствует",',
    '    "backstory": "string | отсутствует",',
    '    "appearance": "string | отсутствует",',
    '    "personality": "string | отсутствует",',
    '    "fears": "string | отсутствует",',
    '    "goals": "string | отсутствует",',
    '    "playstyle": "string | отсутствует",',
    '    "reference": "string | отсутствует",',
    '    "extraNotes": "string | отсутствует"',
    "  }",
    "}",
    "",
    "gameDate - это дата игры/сессии, если она есть в ответах формы. Не используй дату отправки формы как дату игры, если из данных не следует, что это дата игры.",
    "Если дату игры невозможно уверенно определить, верни null.",
    "Если playerName невозможно определить, выбери наиболее вероятное имя игрока из коротких текстовых ответов.",
    "",
    `Сырой JSON webhook-а:\n${rawBody}`,
    "",
    `Плоские значения ответов:\n${rawAnswers}`
  ].join("\n");
}

export function buildCharacterPrompt(payload: YandexFormWebhookPayload): string {
  const answers = payload.answers;
  const lines = [
    "Сгенерируй D&D 5e персонажа на основе нормализованных ответов игрока.",
    "Персонаж должен быть логичным, не overpowered, пригодным для roleplay и соответствовать атмосфере D&D.",
    "Не генерируй spell slots, inventory, combat logic, dice logic или расчёты.",
    "Верни только валидный JSON без markdown.",
    "",
    "Ответ JSON должен иметь поля:",
    "characterName, race, class, level, gender, shortBackstory, appearance, personality, fears, goals, abilityScores, avatarPrompt.",
    "abilityScores должен содержать strength, dexterity, constitution, intelligence, wisdom, charisma.",
    "",
    `Имя игрока: ${payload.playerName}`,
    payload.gameDate ? `Дата игры: ${payload.gameDate}` : null,
    answers.characterName ? `Желаемое имя персонажа: ${answers.characterName}` : null,
    answers.racePreference ? `Предпочтение по расе: ${answers.racePreference}` : null,
    answers.classPreference ? `Предпочтение по классу: ${answers.classPreference}` : null,
    answers.gender ? `Пол/гендер: ${answers.gender}` : null,
    answers.age ? `Возраст: ${answers.age}` : null,
    answers.origin ? `Происхождение: ${answers.origin}` : null,
    answers.backstory ? `Идея истории: ${answers.backstory}` : null,
    answers.appearance ? `Внешность: ${answers.appearance}` : null,
    answers.personality ? `Характер: ${answers.personality}` : null,
    answers.fears ? `Страхи: ${answers.fears}` : null,
    answers.goals ? `Цели: ${answers.goals}` : null,
    answers.reference ? `Референс: ${answers.reference}` : null,
    answers.playstyle ? `Желаемый стиль отыгрыша: ${answers.playstyle}` : null,
    answers.extraNotes ? `Дополнительные ответы формы: ${answers.extraNotes}` : null
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function stringifyForPrompt(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2) ?? "null";

  if (serialized.length <= MAX_RAW_WEBHOOK_CHARS) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_RAW_WEBHOOK_CHARS)}\n...truncated`;
}
