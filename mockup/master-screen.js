const root = document.documentElement;
const themeButton = document.querySelector(".theme-button");
const themeText = document.querySelector(".theme-text");
const gameButtons = document.querySelectorAll(".game-note");
const characterList = document.querySelector("#character-list");
const gameTitle = document.querySelector("#characters-title");
const gameDate = document.querySelector(".selected-game-date");

const games = {
  north: {
    title: "Тени над Северными землями",
    date: "14 июня 2026 · начало в 18:30",
    characterIds: ["elian", "lyra", "brokk", "mira"],
    waitingCount: 1
  },
  forest: {
    title: "Зов Изумрудного леса",
    date: "21 июня 2026 · начало в 16:00",
    characterIds: ["torvi", "selene", "varg"],
    waitingCount: 0
  },
  tower: {
    title: "Башня без дверей",
    date: "5 июля 2026 · время уточняется",
    characterIds: [],
    waitingCount: 4
  }
};

const characters = {
  elian: {
    player: "Алексей",
    name: "Элиан Тихий Шаг",
    summary: "Следопыт · 3 уровень",
    details: "Лесной эльф · Следопыт · 3 ур.",
    portrait: "portrait-ranger",
    status: "Готов к игре",
    statusCopy: "Все этапы генерации завершены.",
    progress: "100%"
  },
  lyra: {
    player: "Анна",
    name: "Лира Ветропевица",
    summary: "Бард · 3 уровень",
    details: "Полуэльф · Бард · 3 ур.",
    portrait: "portrait-bard",
    status: "Готов к игре",
    statusCopy: "LSS JSON и печатный лист сформированы.",
    progress: "100%"
  },
  brokk: {
    player: "Максим",
    name: "Брокк Железнобород",
    summary: "Воин · 3 уровень",
    details: "Горный дворф · Воин · 3 ур.",
    portrait: "portrait-warrior",
    status: "Готов к игре",
    statusCopy: "Все этапы генерации завершены.",
    progress: "100%"
  },
  mira: {
    player: "София",
    name: "Мира из Серых башен",
    summary: "Волшебник · 3 уровень",
    details: "Человек · Волшебник · 3 ур.",
    portrait: "portrait-mage",
    status: "Перо пишет",
    statusCopy: "Формируется история и лист персонажа.",
    progress: "64%"
  },
  torvi: {
    player: "Денис",
    name: "Торви Мшистый Плащ",
    summary: "Друид · 2 уровень",
    details: "Лесной гном · Друид · 2 ур.",
    portrait: "portrait-druid",
    status: "Готов к игре",
    statusCopy: "Лист и LSS JSON сформированы.",
    progress: "100%"
  },
  selene: {
    player: "Мария",
    name: "Селена Лунный След",
    summary: "Плут · 2 уровень",
    details: "Тифлинг · Плут · 2 ур.",
    portrait: "portrait-rogue",
    status: "Перо пишет",
    statusCopy: "Проверяется история происхождения.",
    progress: "72%"
  },
  varg: {
    player: "Роман",
    name: "Варг Каменная Ладонь",
    summary: "Монах · 2 уровень",
    details: "Голиаф · Монах · 2 ур.",
    portrait: "portrait-monk",
    status: "Получены ответы",
    statusCopy: "Персонаж ожидает генерации.",
    progress: "24%"
  }
};

function characterSheetTemplate(characterId) {
  const character = characters[characterId];
  const isGenerating = character.progress !== "100%";

  return `
    <button
      class="character-sheet${isGenerating ? " generating" : ""}"
      type="button"
      data-character-id="${characterId}"
      aria-pressed="false"
    >
      <span class="sheet-clip" aria-hidden="true"></span>
      <span class="pixel-portrait ${character.portrait}" aria-hidden="true">
        <i class="portrait-hair"></i>
        <i class="portrait-face"></i>
        <i class="portrait-body"></i>
      </span>
      <span class="sheet-copy">
        <small>${character.player}</small>
        <strong>${character.name}</strong>
        <span>${character.details}</span>
      </span>
      <span class="sheet-corner${isGenerating ? " magic-corner" : ""}">
        ${isGenerating ? "✦" : "✓"}
      </span>
    </button>
  `;
}

function emptySheetTemplate(count) {
  const message =
    count > 1
      ? `Ожидаем ответы от ${count} игроков`
      : "Лист появится после нового послания от игрока";

  return `
    <article class="empty-sheet">
      <span class="empty-rune" aria-hidden="true">?</span>
      <strong>${count > 1 ? "Пока нет листов" : "Ожидаем ответы"}</strong>
      <small>${message}</small>
    </article>
  `;
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  const isNight = theme === "night";

  themeButton?.setAttribute("aria-pressed", String(isNight));

  if (themeText) {
    themeText.textContent = isNight ? "Ночь" : "День";
  }
}

function renderGameCharacters(game) {
  const sheets = game.characterIds.map(characterSheetTemplate);

  if (game.waitingCount > 0) {
    sheets.push(emptySheetTemplate(game.waitingCount));
  }

  characterList.innerHTML = sheets.join("");

  const readyCount = game.characterIds.filter(
    (characterId) => characters[characterId].progress === "100%"
  ).length;
  const activeCount = game.characterIds.length - readyCount;
  const legend = document.querySelector(".central-footer");

  legend.innerHTML = `
    <span><i class="legend-dot ready-dot"></i> Готово: ${readyCount}</span>
    <span><i class="legend-dot magic-dot"></i> В работе: ${activeCount}</span>
    <span><i class="legend-dot empty-dot"></i> Ожидает: ${game.waitingCount}</span>
  `;

  if (game.characterIds.length > 0) {
    selectCharacter(game.characterIds[0]);
  } else {
    clearCharacterSelection();
  }
}

function selectGame(gameId) {
  const game = games[gameId];

  if (!game) {
    return;
  }

  gameButtons.forEach((button) => {
    const selected = button.dataset.gameId === gameId;

    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  gameTitle.textContent = game.title;
  gameDate.textContent = game.date;
  renderGameCharacters(game);
}

function selectCharacter(characterId) {
  const character = characters[characterId];

  if (!character) {
    return;
  }

  document.querySelectorAll(".character-sheet").forEach((sheet) => {
    const selected = sheet.dataset.characterId === characterId;

    sheet.classList.toggle("selected", selected);
    sheet.setAttribute("aria-pressed", String(selected));
  });

  document.querySelector(".selected-player").textContent = `Игрок: ${character.player}`;
  document.querySelector(".selected-name").textContent = character.name;
  document.querySelector(".selected-summary").textContent = character.summary;
  document.querySelector(".selected-status").textContent = character.status;
  document.querySelector(".selected-status-copy").textContent = character.statusCopy;
  document.querySelector(".generation-bar i").style.width = character.progress;

  const avatar = document.querySelector(".selected-avatar");

  avatar.className = `selected-avatar ${character.portrait}`;
  document.querySelectorAll(".action-button").forEach((button) => {
    button.disabled = false;
  });
}

function clearCharacterSelection() {
  document.querySelector(".selected-player").textContent = "Игрок не выбран";
  document.querySelector(".selected-name").textContent = "Нет персонажей";
  document.querySelector(".selected-summary").textContent = "Ожидаем ответы формы";
  document.querySelector(".selected-status").textContent = "Ожидание";
  document.querySelector(".selected-status-copy").textContent =
    "Действия станут доступны после создания первого персонажа.";
  document.querySelector(".generation-bar i").style.width = "0%";

  const avatar = document.querySelector(".selected-avatar");

  avatar.className = "selected-avatar portrait-empty";
  document.querySelectorAll(".action-button").forEach((button) => {
    button.disabled = true;
  });
}

const savedTheme = localStorage.getItem("master-screen-theme");
applyTheme(savedTheme === "night" ? "night" : "day");

themeButton?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "night" ? "day" : "night";

  applyTheme(nextTheme);
  localStorage.setItem("master-screen-theme", nextTheme);
});

gameButtons.forEach((button) => {
  button.addEventListener("click", () => selectGame(button.dataset.gameId));
});

characterList?.addEventListener("click", (event) => {
  const sheet = event.target.closest(".character-sheet");

  if (sheet) {
    selectCharacter(sheet.dataset.characterId);
  }
});
