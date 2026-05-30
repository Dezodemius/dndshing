import type { YandexFormWebhookPayload } from "@/features/webhooks/yandex-form.schema";

export function buildCharacterPrompt(payload: YandexFormWebhookPayload): string {
  const answers = payload.answers;
  const lines = [
    "Сгенерируй D&D 5e персонажа на основе ответов игрока.",
    "Персонаж должен быть логичным, не overpowered, пригодным для roleplay и соответствовать атмосфере D&D.",
    "Не генерируй spell slots, inventory, combat logic, dice logic или расчёты.",
    "Верни только валидный JSON без markdown.",
    "",
    "Ответ JSON должен иметь поля:",
    "characterName, race, class, level, gender, shortBackstory, appearance, personality, fears, goals, abilityScores, avatarPrompt.",
    "abilityScores должен содержать strength, dexterity, constitution, intelligence, wisdom, charisma.",
    "",
    `Имя игрока: ${payload.playerName}`,
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
