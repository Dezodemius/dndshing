#!/usr/bin/env python3
"""Create GitHub issues from .claude/docs/BACKLOG.md.

Usage:
    python .claude/scripts/create-issues.py            # dry run: print what would be created
    python .claude/scripts/create-issues.py --apply    # actually create labels and issues

Requires: gh CLI authenticated in the target repo (run from repo root).
Idempotent-ish: skips issues whose DND-ID already exists in an open/closed issue title.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BACKLOG = Path(".claude/docs/BACKLOG.md")
TASK_RE = re.compile(r"^### (DND-\d+) · (.+)$")

STATIC_LABELS = {
    "agent-ready": ("0E8A16", "Готова к запуску агентом"),
    "in-progress": ("FBCA04", "Агент работает / PR открыт"),
    "blocked": ("B60205", "Заблокирована зависимостями"),
    "backend": ("1D76DB", ""),
    "frontend": ("5319E7", ""),
    "infra": ("C5DEF5", ""),
    "docs": ("BFDADC", ""),
    "security": ("D93F0B", ""),
}


def sh(args: list[str]) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def parse_backlog(text: str) -> list[dict]:
    tasks, cur = [], None
    for line in text.splitlines():
        m = TASK_RE.match(line)
        if m:
            if cur:
                tasks.append(cur)
            cur = {"id": m.group(1), "title": m.group(2).strip(),
                   "labels": [], "depends": [], "body": []}
            continue
        if cur is None:
            continue
        if line.startswith("labels:"):
            cur["labels"] = [l.strip() for l in line[7:].split(",") if l.strip()]
        elif line.startswith("depends:"):
            deps = line[8:].strip()
            cur["depends"] = [] if deps in ("—", "-", "") else \
                [d.strip() for d in deps.split(",")]
        elif line.startswith("## ") and cur["body"]:
            tasks.append(cur)
            cur = None
        else:
            cur["body"].append(line)
    if cur:
        tasks.append(cur)
    for t in tasks:
        t["body"] = "\n".join(t["body"]).strip()
    return tasks


def existing_issue_ids() -> set[str]:
    out = sh(["gh", "issue", "list", "--state", "all", "--limit", "500",
              "--json", "title"])
    ids = set()
    for it in json.loads(out):
        m = re.match(r"(DND-\d+)", it["title"])
        if m:
            ids.add(m.group(1))
    return ids


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

    tasks = parse_backlog(BACKLOG.read_text(encoding="utf-8"))
    print(f"Найдено задач: {len(tasks)}")
    ensure_labels(tasks, args.apply)
    done = existing_issue_ids() if args.apply else set()

    for t in tasks:
        if t["id"] in done:
            print(f"skip (exists): {t['id']}")
            continue
        # agent-ready сразу только у задач без зависимостей;
        # остальным метку выставит планировщик, когда зависимости закроются
        labels = list(t["labels"])
        if not t["depends"] and "agent-ready" not in labels:
            labels.append("agent-ready")
        title = f"{t['id']} · {t['title']}"
        if args.apply:
            sh(["gh", "issue", "create", "--title", title,
                "--body", build_body(t), "--label", ",".join(labels)])
            print(f"created: {title}")
        else:
            print(f"[dry-run] issue: {title}  labels={labels}  "
                  f"depends={t['depends']}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(e.stderr, file=sys.stderr)
        sys.exit(1)