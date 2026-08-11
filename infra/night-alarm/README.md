# Ночной будильник (Cloudflare Worker)

Крон GitHub Actions в этом репозитории регулярно роняет тики: в ночь на
13.07.2026 тик `00:17` не пришёл вовсе (ночь потеряна при пяти готовых
задачах), в ночь на 14.07.2026 не пришёл ни один из тиков — ни `23:50` у
plan.yml, ни `00:07` у agent.yml, ночь стартовала только ручным
`gh workflow run agent.yml`. Цепочка прогонов (PR #51) держит ночь, если её
завести, но заводить её крону GitHub доверять нельзя.

Этот воркер — внешнее зажигание: крон Cloudflare дёргает `workflow_dispatch`
через GitHub API. Такие события GitHub исполняет надёжно.

Расписание (UTC):

| Крон | Что дёргает | Зачем |
| --- | --- | --- |
| `50 23 * * *` | `plan.yml` c `nightly=true` | метки очереди + снять `agent-deferred` |
| `7 0-5 * * *` | `agent.yml` c `chained=true` | открыть ночь; часовые повторы страхуют умершую цепочку |

Лишние звонки безопасны: ночное окно и все стоп-краны проверяет job `pick`
в agent.yml, а concurrency-группа не даёт прогонам ехать параллельно.

## Деплой (однократно, ~3 минуты)

Из каталога `infra/night-alarm/`:

```sh
npx wrangler login          # браузерный OAuth в аккаунт Cloudflare
npx wrangler deploy
npx wrangler secret put GH_PAT
```

В `GH_PAT` вставить тот же PAT, что лежит в секретах репозитория под именем
`GH_PAT` (classic, scope `repo` + `workflow`). Без него dispatch вернёт 401,
и крон-раны воркера будут падать.

После смены PAT — повторить `npx wrangler secret put GH_PAT`.

## Проверка

Локальная (не ждёт ночи):

```sh
npx wrangler dev --test-scheduled
# в соседнем терминале — «позвонить» нужным кроном:
curl "http://localhost:8787/__scheduled?cron=7+0-5+*+*+*"
```

Должен появиться запуск agent.yml (workflow_dispatch) во вкладке Actions.
ВНИМАНИЕ: это настоящий dispatch — днём прогон отсеется ночным окном
(`chained=true`), это ожидаемо и видно в логе job `pick`.

Боевая: утром во вкладке Actions у первого ночного запуска agent.yml
событие — `workflow_dispatch` (а не `schedule`). История звонков — в
дашборде Cloudflare: Workers → dndshing-night-alarm → Cron Events.
