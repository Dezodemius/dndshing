// Внешний будильник ночного конвейера (Cloudflare Worker).
//
// Расписание GitHub Actions — best-effort: тики задерживаются и молча
// пропускаются (ночь 14.07.2026 — не пришёл ни один: ни 23:50 у plan.yml,
// ни 00:07 у agent.yml; ночь стартовала только ручным пинком). Крон
// Cloudflare — настоящий: воркер дёргает workflow_dispatch через API,
// а такие события GitHub не роняет.
//
// Будильник — только зажигание. Ночь дальше везёт себя сама (шаг «Chain the
// next run» в agent.yml), а все стоп-краны — в job `pick` (окно, очередь,
// MAX_OPEN_PRS, MAX_DEFERRED). Поэтому лишний звонок безопасен: даже если
// тик GitHub всё-таки долетит, concurrency-группа не даст прогонам ехать
// вдвоём. Отсюда и почасовая частота: звонок в 0x:07 ещё и поднимает ночь,
// умершую посреди (упавший runner, оборванная цепочка).
export default {
  async scheduled(controller, env, ctx) {
    // 50 23 * * *  — планировщик очереди: nightly=true, чтобы прогон снял
    //                agent-deferred, как это делает его собственный cron
    //                («новая ночь — новая попытка»).
    // 7 0-5 * * *  — агент: chained=true, чтобы прогон считался
    //                автоматическим и соблюдал ночное окно, как тик cron.
    const [workflow, inputs] =
      controller.cron === "50 23 * * *"
        ? ["plan.yml", { nightly: "true" }]
        : ["agent.yml", { chained: "true" }];

    const res = await fetch(
      `https://api.github.com/repos/${env.REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GH_PAT}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          // Обязателен: GitHub API отвечает 403 запросам без User-Agent.
          "User-Agent": "dndshing-night-alarm",
        },
        body: JSON.stringify({ ref: env.BRANCH, inputs }),
      },
    );

    // Успешный dispatch — это 204 без тела. Всё прочее — падение крон-рана:
    // так его видно в дашборде Cloudflare (Workers → dndshing-night-alarm →
    // Cron Events), а не в тишине.
    if (res.status !== 204) {
      throw new Error(
        `${workflow}: GitHub ответил ${res.status}: ${await res.text()}`,
      );
    }
  },
};
