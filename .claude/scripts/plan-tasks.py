#!/usr/bin/env python3
"""Keep GitHub in sync with the BACKLOG dependency graph.

Without this, nothing ever grants `agent-ready`: create-issues.py only sets it
on tasks that start with no dependencies, and agent.yml merely *reads* the
label. Once those first tasks close, the agent finds an empty queue and stalls.

Two things are reconciled on every run:

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
STATUS_DONE, STATUS_BUSY, STATUS_TODO = "Done", "In Progress", "Todo"


def plan_labels(tasks: dict, issues: dict) -> list[dict]:
    """Desired label changes, one entry per issue that needs an edit."""
    changes = []
    for task_id, issue in sorted(issues.items()):
        task = tasks.get(task_id)
        if task is None:
            print(f"!! {task_id}: ишью есть, задачи в BACKLOG нет — пропускаю")
            continue
        if issue["state"] == "CLOSED":
            # Closed issues keep their history; strip the queue labels. BUSY is
            # among them: done.yml removes it on merge, but a run that died
            # between `gh issue edit --add-label` and the PR leaves it behind,
            # and a closed task is not in progress — the board (Done, read from
            # the state) and the label would say different things.
            add, remove = set(), {READY, BLOCKED, BUSY} & issue["labels"]
        elif BUSY in issue["labels"]:
            continue  # the agent is working on it — hands off
        else:
            missing = [d for d in task["depends"]
                       if d not in issues or issues[d]["state"] != "CLOSED"]
            ready = not missing
            add = {READY} - issue["labels"] if ready else {BLOCKED} - issue["labels"]
            remove = ({BLOCKED} if ready else {READY}) & issue["labels"]
            if missing:
                issue["waiting_on"] = missing
        if add or remove:
            changes.append({"id": task_id, "number": issue["number"],
                            "add": sorted(add), "remove": sorted(remove),
                            "waiting_on": issue.get("waiting_on", [])})
    return changes


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
        elif BUSY in issue["labels"]:
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
    args = ap.parse_args()

    tasks = bl.load_tasks()
    issues = bl.load_issues()
    print(f"задач в BACKLOG: {len(tasks)}, ишью: {len(issues)}")

    for task_id in sorted(set(tasks) - set(issues)):
        print(f"!! {task_id}: есть в BACKLOG, ишью нет — запусти create-issues.py --apply")

    changes = plan_labels(tasks, issues)
    if not changes:
        print("метки: всё уже сходится")
    for c in changes:
        waiting = f"  (ждёт: {', '.join(c['waiting_on'])})" if c["waiting_on"] else ""
        prefix = "" if args.apply else "[dry-run] "
        print(f"{prefix}labels {c['id']}: +{c['add'] or '—'} -{c['remove'] or '—'}{waiting}")
    if args.apply and changes:
        apply_labels(changes)

    # State after the plan lands, so a dry run reports the same queue as --apply.
    ready = {i for i, s in issues.items()
             if s["state"] == "OPEN" and READY in s["labels"]}
    for c in changes:
        if READY in c["add"]:
            ready.add(c["id"])
        if READY in c["remove"]:
            ready.discard(c["id"])
    print(f"готовы к агенту: {', '.join(sorted(ready)) or 'нет'}")

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
