#!/usr/bin/env python3
"""Keep GitHub in sync with the BACKLOG dependency graph.

Without this, nothing ever grants `agent-ready`: create-issues.py only sets it
on tasks that start with no dependencies, and agent.yml merely *reads* the
label. Once those first tasks close, the agent finds an empty queue and stalls.

Three things are reconciled on every run:

  state   open task whose branch is already merged into develop, still marked
          in-progress -> closed. done.yml does this on the merge event; this is
          the net for merges it missed (see close_finished).

  labels  open task with all `depends:` closed -> agent-ready (not blocked)
          open task still waiting               -> blocked (not agent-ready)
          closed task                           -> queue labels stripped
          `in-progress` on an *open* task is never touched: the agent owns it
          while it works. On a closed one it is a leftover and gets stripped.

  board   every DND issue is on the project board with Эпик/Область set, and
          Status reflects reality (closed -> Done, in-progress -> In Progress,
          otherwise Todo).

Usage:
    python .claude/scripts/plan-tasks.py            # dry run: print the diff
    python .claude/scripts/plan-tasks.py --apply    # write labels + board
    python .claude/scripts/plan-tasks.py --apply --no-board   # labels only

Requires: gh CLI authenticated. Board writes need a token with the `project`
scope (GITHUB_TOKEN does not have it) — board failures are reported, not fatal.
"""
from __future__ import annotations

import argparse
import subprocess
import sys

import backlog as bl

READY, BLOCKED, BUSY = "agent-ready", "blocked", "in-progress"
REVIEW, DEFERRED = "in-review", "agent-deferred"
# Labels the night loop owns on an open issue. The planner must not fight it for
# them: yanking in-progress mid-run, or in-review off a task whose PR is still
# open, would put the task back in the queue and hand it to the agent twice.
HOLD = {BUSY, REVIEW}
# Everything the queue hangs on an open issue — all of it goes when it closes.
QUEUE_LABELS = {READY, BLOCKED, BUSY, REVIEW, DEFERRED}
STATUS_DONE, STATUS_BUSY, STATUS_TODO = "Done", "In Progress", "Todo"


def close_finished(tasks: dict, issues: dict, merged: set[str], apply: bool) -> None:
    """Close tasks whose branch is already in develop but whose issue stayed open.

    The merge -> issue handoff is done by done.yml, and before it by the
    `Closes #N` trailer in the PR body. Both live outside the issue, so both can
    be missed: an edited PR body dropped the trailer and left DND-001 open and
    still labelled in-progress after its merge — which stalls the whole queue,
    since agent.yml skips every run while an open issue is in-progress.

    A merged branch plus in-progress is exactly that miss. in-progress is what
    keeps this narrow: done.yml strips it on merge, so a task a human reopened
    for rework no longer carries it and is left alone.
    """
    for task_id, issue in sorted(issues.items()):
        if task_id not in tasks or issue["state"] != "OPEN":
            continue
        if BUSY not in issue["labels"] or task_id not in merged:
            continue
        prefix = "" if apply else "[dry-run] "
        print(f"{prefix}close {task_id} (#{issue['number']}): ветка влита в develop, "
              f"а ишью открыта")
        if apply:
            bl.sh(["gh", "issue", "close", str(issue["number"]),
                   "--reason", "completed",
                   "--comment", "Ветка задачи влита в develop, а ишью осталась "
                                "открытой — закрываю (planner)."])
        # Labels and board are planned off this state below, in the same run.
        issue["state"] = "CLOSED"


def plan_labels(
    tasks: dict,
    issues: dict,
    clear_deferred: bool = False,
) -> list[dict]:
    """Desired label changes, one entry per issue that needs an edit."""
    changes = []

    for task_id, issue in sorted(issues.items()):
        task = tasks.get(task_id)
        if task is None:
            print(f"!! {task_id}: ишью есть, задачи в BACKLOG нет — пропускаю")
            continue

        if issue["state"] == "CLOSED":
            add, remove = set(), QUEUE_LABELS & issue["labels"]

        elif issue["labels"] & HOLD:
            continue

        else:
            missing = [
                d for d in task["depends"]
                if d not in issues or issues[d]["state"] != "CLOSED"
            ]

            ready = not missing

            add = {READY} - issue["labels"] if ready else {BLOCKED} - issue["labels"]
            remove = ({BLOCKED} if ready else {READY}) & issue["labels"]

            if clear_deferred:
                remove |= {DEFERRED} & issue["labels"]

            if missing:
                issue["waiting_on"] = missing

        if add or remove:
            changes.append(
                {
                    "id": task_id,
                    "number": issue["number"],
                    "add": sorted(add),
                    "remove": sorted(remove),
                    "waiting_on": issue.get("waiting_on", []),
                }
            )

    return changes


def queue_after(issues: dict, changes: list[dict]) -> set[str]:
    """Task IDs the agent can actually pick once `changes` land.

    Mirrors the filter in agent.yml so a dry run reports the real queue: ready,
    minus what the night loop has already taken off the board.
    """
    edits = {c["id"]: c for c in changes}
    queue = set()
    for task_id, issue in issues.items():
        if issue["state"] != "OPEN":
            continue
        labels = set(issue["labels"])
        edit = edits.get(task_id)
        if edit:
            labels = (labels | set(edit["add"])) - set(edit["remove"])
        if READY in labels and not labels & (HOLD | {DEFERRED}):
            queue.add(task_id)
    return queue


def apply_labels(changes: list[dict]) -> None:
    for c in changes:
        args = ["gh", "issue", "edit", str(c["number"])]
        for label in c["add"]:
            args += ["--add-label", label]
        for label in c["remove"]:
            args += ["--remove-label", label]
        bl.sh(args)


def sync_board(tasks: dict, issues: dict, apply: bool) -> None:
    board = bl.load_board()
    missing = set()
    for task_id, issue in sorted(issues.items()):
        task = tasks.get(task_id)
        if task is None:
            continue
        number = issue["number"]
        if issue["state"] == "CLOSED":
            status = STATUS_DONE
        elif issue["labels"] & HOLD:
            # In Progress covers both «агент пишет» and «PR ждёт человека»:
            # заводить на доске отдельную колонку под второе — не наша забота,
            # поля там создаются руками, и отсутствующая опция сыпала бы
            # предупреждением в каждый прогон.
            status = STATUS_BUSY
        else:
            status = STATUS_TODO
        want = {bl.EPIC_FIELD: bl.epic_option(task["labels"]),
                bl.AREA_FIELD: bl.area_option(task["labels"]),
                bl.STATUS_FIELD: status}

        item = board["items"].get(number)
        if item is None:
            if not apply:
                print(f"[dry-run] board + {task_id}: {want}")
                continue
            item = {"id": bl.add_to_board(board, bl.issue_node_id(number)), "values": {}}
            board["items"][number] = item
            print(f"board + {task_id}")

        for field, option in want.items():
            if option is None or item["values"].get(field) == option:
                continue
            if bl.board_option_id(board, field, option) is None:
                missing.add((field, option))  # board not configured for it — skip
                continue
            if not apply:
                print(f"[dry-run] board {task_id}: {field} -> {option}")
                continue
            bl.set_board_field(board, item["id"], field, option)
            print(f"board {task_id}: {field} -> {option}")

    for field, option in sorted(missing):
        print(f"!! доска: нет поля «{field}» с опцией «{option}» — не проставлено. "
              f"Создай single-select поле и опцию с точно таким именем.", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--no-board", action="store_true")
    ap.add_argument("--clear-deferred", action="store_true",
                    help="снять agent-deferred: новая ночь — новая попытка "
                         "(plan.yml передаёт этот флаг только на ночном cron)")
    args = ap.parse_args()

    tasks = bl.load_tasks()
    issues = bl.load_issues()
    print(f"задач в BACKLOG: {len(tasks)}, ишью: {len(issues)}")

    for task_id in sorted(set(tasks) - set(issues)):
        print(f"!! {task_id}: есть в BACKLOG, ишью нет — запусти create-issues.py --apply")

    close_finished(tasks, issues, bl.merged_tasks(), args.apply)

    changes = plan_labels(
        tasks,
        issues,
        clear_deferred=args.clear_deferred,
    )
    if not changes:
        print("метки: всё уже сходится")
    for c in changes:
        waiting = f"  (ждёт: {', '.join(c['waiting_on'])})" if c["waiting_on"] else ""
        prefix = "" if args.apply else "[dry-run] "
        print(f"{prefix}labels {c['id']}: +{c['add'] or '—'} -{c['remove'] or '—'}{waiting}")
    if args.apply and changes:
        apply_labels(changes)

    # State after the plan lands, so a dry run reports the same queue as --apply.
    queue = queue_after(issues, changes)
    print(f"готовы к агенту: {', '.join(sorted(queue)) or 'нет'}")

    if not args.no_board:
        # The board is a view, the labels are the queue: a broken board must not
        # fail the run, or every plan.yml run goes red and the agent queue with it.
        try:
            sync_board(tasks, issues, args.apply)
        except subprocess.CalledProcessError as e:
            print(f"!! доска не обновлена (нужен токен со scope `project`): "
                  f"{(e.stderr or '').strip()[:200]}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"!! доска не обновлена: {type(e).__name__}: {e}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(e.stderr, file=sys.stderr)
        sys.exit(1)
