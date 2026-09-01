#!/usr/bin/env python3
"""Create GitHub issues from .claude/docs/BACKLOG.md.

Usage:
    python .claude/scripts/create-issues.py            # dry run: print what would be created
    python .claude/scripts/create-issues.py --apply    # actually create labels and issues

Create-only: an existing issue is never updated from BACKLOG (skipped by DND-ID).
Queue labels (agent-ready/blocked) and the project board are owned by
plan-tasks.py — run it after this script.

Requires: gh CLI authenticated in the target repo (run from repo root).
"""
from __future__ import annotations

import argparse
import subprocess
import sys

import backlog as bl

# Owned by plan-tasks.py, derived from the dependency graph. If one slips into a
# `labels:` line in BACKLOG it is dropped here, not put on a fresh issue.
QUEUE_LABELS = {"agent-ready", "blocked", "in-progress"}

STATIC_LABELS = {
    "agent-ready": ("0E8A16", "Все зависимости закрыты — можно запускать агента"),
    "in-progress": ("FBCA04", "Агент работает / PR открыт"),
    "blocked": ("B60205", "Ждёт незакрытых зависимостей"),
    "backend": ("1D76DB", ""),
    "frontend": ("5319E7", ""),
    "infra": ("C5DEF5", ""),
    "docs": ("BFDADC", ""),
    "security": ("D93F0B", ""),
    "manual": ("D4C5F9", "Требует ручной проверки; агент не берёт и не закрывает задачу"),
    "manual-approved": ("2DA44E", "Владелец подтвердил ручную приёмку"),
}


def ensure_labels(tasks: list[dict], apply: bool) -> None:
    labels = dict(STATIC_LABELS)
    for t in tasks:
        for l in t["labels"]:
            labels.setdefault(l, ("EDEDED", ""))
    for name, (color, desc) in labels.items():
        if apply:
            subprocess.run(["gh", "label", "create", name, "--color", color,
                            "--description", desc, "--force"],
                           check=False, capture_output=True)
        else:
            print(f"[dry-run] label: {name}")


def build_body(t: dict) -> str:
    deps = ", ".join(t["depends"]) if t["depends"] else "нет"
    header = (
        f"**Depends-on:** {deps}\n\n"
        "Перед работой прочитай: `.claude/docs/CLAUDE.md`, "
        "`.claude/docs/REQUIREMENTS.md`, `.claude/docs/ARCHITECTURE.md`, "
        "свою секцию в `.claude/docs/BACKLOG.md`.\n\n---\n\n"
    )
    footer = (
        "\n\n---\n**Definition of Done:** критерии приёмки выполнены; тесты "
        "написаны и проходят; миграции применяются с нуля; ничего из фазы 2 "
        "(BR §6) не добавлено; ветка `feat/" + t["id"].lower() + "`."
    )
    return header + t["body"] + footer


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    tasks = list(bl.load_tasks().values())
    print(f"Найдено задач: {len(tasks)}")
    ensure_labels(tasks, args.apply)
    done = set(bl.load_issues()) if args.apply else set()

    created = 0
    for t in tasks:
        if t["id"] in done:
            continue
        title = f"{t['id']} · {t['title']}"
        labels = [l for l in t["labels"] if l not in QUEUE_LABELS]
        if args.apply:
            bl.sh(["gh", "issue", "create", "--title", title,
                   "--body", build_body(t), "--label", ",".join(labels)])
            print(f"created: {title}")
        else:
            print(f"[dry-run] issue: {title}  labels={labels}  "
                  f"depends={t['depends']}")
        created += 1

    if not created:
        print("Новых задач нет — все уже в GitHub.")
    elif args.apply:
        # Nothing labels the queue automatically any more: the planner
        # workflow is gone, so this hand-off has to be spelled out.
        print(f"\nСоздано: {created}. Очередную метку никто не выдаст "
              f"автоматически — запусти планировщик:\n"
              f"  python .claude/scripts/plan-tasks.py --apply")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(e.stderr, file=sys.stderr)
        sys.exit(1)
