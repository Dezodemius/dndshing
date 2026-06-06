const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");
const themeLabel = document.querySelector(".theme-label");

function applyTheme(theme) {
  root.dataset.theme = theme;

  if (themeLabel) {
    themeLabel.textContent = theme === "night" ? "Ночной лагерь" : "Дневной лагерь";
  }

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      theme === "night" ? "Включить дневную тему" : "Включить ночную тему"
    );
    themeToggle.setAttribute("aria-pressed", String(theme === "night"));
  }
}

const savedTheme = localStorage.getItem("camp-theme");
const preferredTheme =
  savedTheme === "day" || savedTheme === "night"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "night"
      : "day";

applyTheme(preferredTheme);

themeToggle?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "night" ? "day" : "night";

  applyTheme(nextTheme);
  localStorage.setItem("camp-theme", nextTheme);
});
