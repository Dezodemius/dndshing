const layouts = {
  "left-sidebar": {
    index: "01",
    title: "Левый постоянный sidebar",
    summary: "Наиболее предсказуемая схема для рабочего кабинета мастера.",
    placement:
      "Слева находятся разделы, профиль и настройки. Центральная область полностью принадлежит выбранной игре.",
    strength:
      "Пользователь всегда понимает, где он находится, и быстро переключается между играми, журналом и настройками.",
    weakness:
      "Постоянно занимает 220–260 px и немного ослабляет ощущение открытой лагерной сцены.",
    tags: ["Dashboard", "Игры", "Настройки", "Будущий редактор"]
  },
  "right-sidebar": {
    index: "02",
    title: "Правый sidebar",
    summary: "Контент воспринимается раньше навигации, но структура менее привычна.",
    placement:
      "Игры и персонажи занимают левую и центральную части, а навигация и управление аккаунтом находятся справа.",
    strength:
      "Удобен для правшей и может визуально продолжаться в инспектор выбранного персонажа.",
    weakness:
      "Основная навигация справа противоречит большинству web-паттернов и первое время будет ощущаться непривычно.",
    tags: ["Визуальный dashboard", "Инспектор", "Desktop"]
  },
  "top-navigation": {
    index: "03",
    title: "Верхняя навигация",
    summary: "Лёгкая схема с максимальной шириной рабочей области.",
    placement:
      "Все глобальные разделы расположены в верхней панели. Ниже находится полноширинная сцена или сетка приключений.",
    strength:
      "Лучше всего демонстрирует фон лагеря и позволяет разместить больше карточек в одном ряду.",
    weakness:
      "При росте количества разделов верхняя панель быстро перегружается, а вложенная навигация становится сложнее.",
    tags: ["MVP", "Атмосферный dashboard", "Небольшое меню"]
  },
  "dual-sidebar": {
    index: "04",
    title: "Навигация + инспектор",
    summary: "Профессиональный workspace для будущего редактора персонажей.",
    placement:
      "Слева находится узкая глобальная навигация, в центре список или лист персонажа, справа — свойства и действия.",
    strength:
      "Можно выбирать персонажа и сразу видеть характеристики, статусы и экспорт без перехода на отдельную страницу.",
    weakness:
      "Для текущего MVP это слишком тяжёлая схема: она уменьшает контент и создаёт ожидание полноценного редактора.",
    tags: ["Редактор", "Персонажи", "Import/export", "Desktop"]
  },
  "master-detail": {
    index: "05",
    title: "Master-detail",
    summary: "Эффективная схема для десятков игр и персонажей.",
    placement:
      "В левой колонке находится фильтруемый список объектов, а справа открываются подробности выбранной игры или героя.",
    strength:
      "Быстрое переключение без потери контекста и хорошая плотность информации.",
    weakness:
      "Слабее поддерживает метафору уютного лагеря и больше напоминает почтовый клиент или административный инструмент.",
    tags: ["Много игр", "Поиск", "Очередь генерации", "Операционный режим"]
  },
  "bottom-dock": {
    index: "06",
    title: "Нижний dock",
    summary: "Навигация выглядит как набор предметов на столе мастера.",
    placement:
      "Основной контент занимает весь экран, а ключевые разделы закреплены компактной панелью снизу.",
    strength:
      "Освобождает края экрана и позволяет сделать лагерь визуальным центром интерфейса.",
    weakness:
      "На desktop нижнее меню замечают хуже; подписи придётся показывать через tooltip или расширенное состояние.",
    tags: ["Атмосфера", "Планшет", "Компактное меню"]
  },
  "contextual-drawer": {
    index: "07",
    title: "Компактный rail + drawer",
    summary: "Лучший баланс атмосферы, понятности и будущего расширения.",
    placement:
      "Слева всегда видна узкая полоса иконок. Список игр, журнал или настройки открываются во временной панели.",
    strength:
      "Сохраняет большую рабочую область, но не прячет глобальную навигацию полностью. Drawer можно использовать и как журнал pipeline.",
    weakness:
      "Иконки без подписей требуют обучения; на первом визите rail лучше показывать в раскрытом состоянии.",
    tags: ["Рекомендую", "MVP", "Журнал", "Будущий редактор"]
  },
  "camp-map": {
    index: "08",
    title: "Интерактивная карта лагеря",
    summary: "Самая атмосферная, но наименее утилитарная модель.",
    placement:
      "Палатка открывает игры, костёр — события, сумка — персонажей, книга — настройки AI.",
    strength:
      "Создаёт сильную идентичность продукта и делает первый экран запоминающимся.",
    weakness:
      "Предметы не объясняют функции сами по себе. Нужны подписи, tooltips и альтернативное обычное меню.",
    tags: ["Onboarding", "Главная", "Атмосфера", "Не для сложной работы"]
  }
};

const cards = document.querySelectorAll(".layout-card");
const detailIndex = document.querySelector(".detail-index");
const detailTitle = document.querySelector(".detail-title");
const detailSummary = document.querySelector(".detail-summary");
const detailPlacement = document.querySelector(".detail-placement");
const detailStrength = document.querySelector(".detail-strength");
const detailWeakness = document.querySelector(".detail-weakness");
const fitTags = document.querySelector(".fit-tags");

function selectLayout(layoutId) {
  const layout = layouts[layoutId];

  if (!layout) {
    return;
  }

  cards.forEach((card) => {
    const isSelected = card.dataset.layout === layoutId;

    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  detailIndex.textContent = `Вариант ${layout.index}`;
  detailTitle.textContent = layout.title;
  detailSummary.textContent = layout.summary;
  detailPlacement.textContent = layout.placement;
  detailStrength.textContent = layout.strength;
  detailWeakness.textContent = layout.weakness;
  fitTags.replaceChildren(
    ...layout.tags.map((tag, index) => {
      const element = document.createElement("span");

      element.className = `fit-tag${index === layout.tags.length - 1 ? " muted" : ""}`;
      element.textContent = tag;

      return element;
    })
  );
}

cards.forEach((card) => {
  card.addEventListener("click", () => selectLayout(card.dataset.layout));
});
