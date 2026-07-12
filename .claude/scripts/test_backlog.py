"""Unit tests for the BACKLOG parser and the queue planner.

These two are the whole pipeline's brain: parse_backlog reads the dependency
graph, plan_labels turns it into the agent-ready/blocked queue. Everything else
is `gh` calls. Run: python -m pytest .claude/scripts -q
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import backlog as bl

# plan-tasks.py has a dash in the name, so it cannot be imported by name.
_spec = importlib.util.spec_from_file_location(
    "plan_tasks", Path(__file__).with_name("plan-tasks.py"))
plan_tasks = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(plan_tasks)


BACKLOG_SAMPLE = """\
# Бэклог

Вступление, которое парсер обязан пропустить.

## EPIC E0 · Инфраструктура

### DND-000 · Удаление легаси
labels: epic:e0, infra
depends: —

**Скоуп:** удалить старый прототип.
**Приёмка:** репозиторий чист.

### DND-001 · Каркас backend
labels: epic:e0, backend
depends: DND-000

**Скоуп:** FastAPI + Alembic.

## EPIC US-1 · Регистрация

Проза эпика, которая не должна попасть в тело DND-001.

### DND-010 · Auth backend
labels: epic:us-1, backend, security
depends: DND-001, DND-002

**Скоуп:** email + JWT.
"""


def tasks_by_id() -> dict[str, dict]:
    return {t["id"]: t for t in bl.parse_backlog(BACKLOG_SAMPLE)}


def test_parses_every_task_and_nothing_else():
    assert list(tasks_by_id()) == ["DND-000", "DND-001", "DND-010"]


def test_title_labels_and_depends():
    t = tasks_by_id()["DND-010"]
    assert t["title"] == "Auth backend"
    assert t["labels"] == ["epic:us-1", "backend", "security"]
    assert t["depends"] == ["DND-001", "DND-002"]


def test_em_dash_means_no_dependencies():
    assert tasks_by_id()["DND-000"]["depends"] == []


def test_epic_heading_ends_the_task_body():
    # Otherwise the epic's prose (and its DND mentions) would be swallowed into
    # the previous task's issue body.
    body = tasks_by_id()["DND-001"]["body"]
    assert body == "**Скоуп:** FastAPI + Alembic."


def test_body_keeps_the_task_text_and_drops_the_metadata_lines():
    body = tasks_by_id()["DND-000"]["body"]
    assert body.startswith("**Скоуп:**")
    assert "labels:" not in body and "depends:" not in body


def test_real_backlog_parses_and_dependencies_resolve():
    tasks = bl.load_tasks()
    assert tasks, "BACKLOG.md не распарсился"
    for t in tasks.values():
        assert t["title"] and t["body"], f"{t['id']}: пустой заголовок или тело"
        unknown = [d for d in t["depends"] if d not in tasks]
        assert not unknown, f"{t['id']} зависит от несуществующих задач: {unknown}"


# --- queue planner ---------------------------------------------------------

def issue(number: int, state: str = "OPEN", labels=()) -> dict:
    return {"number": number, "state": state, "labels": set(labels)}


def by_id(changes: list[dict]) -> dict[str, dict]:
    return {c["id"]: c for c in changes}


def changes_by_id(tasks: dict, issues: dict) -> dict[str, dict]:
    return by_id(plan_tasks.plan_labels(tasks, issues))


def test_all_dependencies_closed_makes_the_task_ready():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"), "DND-001": issue(2, labels=["blocked"])}
    c = changes_by_id(tasks, issues)["DND-001"]
    assert c["add"] == ["agent-ready"] and c["remove"] == ["blocked"]


def test_an_open_dependency_blocks_the_task():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1), "DND-001": issue(2, labels=["agent-ready"])}
    c = changes_by_id(tasks, issues)["DND-001"]
    assert c["add"] == ["blocked"] and c["remove"] == ["agent-ready"]
    assert c["waiting_on"] == ["DND-000"]


def test_a_dependency_with_no_issue_yet_blocks_the_task():
    # DND-010 depends on DND-002, which nobody has created — not "ready".
    tasks = tasks_by_id()
    issues = {"DND-001": issue(2, "CLOSED"), "DND-010": issue(3)}
    c = changes_by_id(tasks, issues)["DND-010"]
    assert c["add"] == ["blocked"] and c["waiting_on"] == ["DND-002"]


def test_in_progress_is_left_alone_while_the_task_is_open():
    # The agent owns that label; relabelling mid-run would yank the task away.
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1), "DND-001": issue(2, labels=["in-progress"])}
    assert "DND-001" not in changes_by_id(tasks, issues)


def test_closed_issue_loses_its_queue_labels():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED", labels=["agent-ready", "infra"])}
    c = changes_by_id(tasks, issues)["DND-000"]
    assert c["add"] == [] and c["remove"] == ["agent-ready"]


def test_closed_issue_loses_in_progress_too():
    # A run that died after marking the task busy leaves the label behind: the
    # board reads Done off the closed state while the label still says busy.
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED", labels=["in-progress", "infra"])}
    c = changes_by_id(tasks, issues)["DND-000"]
    assert c["remove"] == ["in-progress"]


def test_planner_is_idempotent():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["agent-ready"]),
              "DND-010": issue(3, labels=["blocked"])}
    assert plan_tasks.plan_labels(tasks, issues) == []


def test_issue_without_a_backlog_task_is_skipped():
    issues = {"DND-999": issue(9, labels=["blocked"])}
    assert plan_tasks.plan_labels(tasks_by_id(), issues) == []


# --- night loop -------------------------------------------------------------
# The agent runs task after task through the night, so a task whose PR is up
# must leave the queue *without* being closed — the human merges in the morning.
# in-review does that; agent-deferred parks a task that broke the run.

def test_a_task_awaiting_review_is_left_alone():
    # Its PR is open and the issue is still open: strip in-review (or hand the
    # task back as agent-ready) and the next run of the night redoes it.
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["agent-ready", "in-review"])}
    assert "DND-001" not in changes_by_id(tasks, issues)


def test_a_task_awaiting_review_is_out_of_the_queue():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["agent-ready", "in-review"])}
    assert plan_tasks.queue_after(issues, []) == set()


def test_a_deferred_task_is_out_of_the_queue_until_the_next_night():
    # The run hit the model's usage limit. The task keeps agent-ready (nothing
    # is wrong with it) but must not be picked again tonight.
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["agent-ready", "agent-deferred"])}
    assert plan_tasks.plan_labels(tasks, issues) == []
    assert plan_tasks.queue_after(issues, []) == set()


def test_the_nightly_run_clears_deferred_and_requeues_the_task():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["agent-ready", "agent-deferred"])}
    changes = plan_tasks.plan_labels(tasks, issues, clear_deferred=True)
    assert by_id(changes)["DND-001"]["remove"] == ["agent-deferred"]
    assert plan_tasks.queue_after(issues, changes) == {"DND-001"}


def test_clearing_deferred_does_not_touch_a_task_the_agent_still_holds():
    # A run that hit the limit is deferred *and* still marked busy for the few
    # seconds before cleanup. The planner must not race it.
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED"),
              "DND-001": issue(2, labels=["in-progress", "agent-deferred"])}
    assert plan_tasks.plan_labels(tasks, issues, clear_deferred=True) == []


def test_closed_issue_loses_the_night_loop_labels():
    tasks = tasks_by_id()
    issues = {"DND-000": issue(1, "CLOSED",
                               labels=["agent-ready", "in-review", "agent-deferred"])}
    c = changes_by_id(tasks, issues)["DND-000"]
    assert c["remove"] == ["agent-deferred", "agent-ready", "in-review"]


def test_a_blocked_task_is_not_in_the_queue_even_if_labelled_ready():
    # Belt and braces: queue_after reads the labels the way agent.yml does.
    issues = {"DND-010": issue(3, labels=["blocked"])}
    assert plan_tasks.queue_after(issues, []) == set()


# --- board ------------------------------------------------------------------

def test_board_without_the_custom_fields_is_skipped_not_fatal(monkeypatch, capsys):
    # A board straight out of the GitHub template has Status and nothing else.
    # Writing Эпик/Область there must degrade to a warning: the board is a view,
    # the labels are the queue, and a red plan.yml stalls the whole agent loop.
    board = {"id": "PVT_1",
             "fields": {"Status": {"id": "F_status",
                                   "options": {"Todo": "opt_todo", "Done": "opt_done"}}},
             "items": {2: {"id": "ITEM_2", "values": {}}}}
    written = []
    monkeypatch.setattr(bl, "load_board", lambda: board)
    monkeypatch.setattr(bl, "gql", lambda q, **v: written.append(v) or {})

    plan_tasks.sync_board(tasks_by_id(), {"DND-001": issue(2)}, apply=True)

    assert len(written) == 1 and written[0]["option"] == "opt_todo"
    err = capsys.readouterr().err
    assert "Эпик" in err and "Область" in err
