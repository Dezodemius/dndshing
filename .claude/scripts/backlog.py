"""Shared helpers for the BACKLOG.md -> GitHub pipeline.

BACKLOG.md is the only machine-readable source of the task dependency graph
(the `depends:` lines). Issue bodies mention task IDs in prose, so they must
never be parsed for dependencies.

Used by:
    create-issues.py  — BACKLOG -> GitHub issues
    plan-tasks.py     — dependency graph -> agent-ready/blocked labels + board
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

# Anchored to the repo layout, not the cwd: the workflow invokes the scripts
# by path from the repo root, a human might not.
BACKLOG = Path(__file__).resolve().parents[2] / ".claude" / "docs" / "BACKLOG.md"
TASK_RE = re.compile(r"^### (DND-\d+) · (.+)$")
DND_RE = re.compile(r"^(DND-\d+)")

PROJECT_OWNER = "Dezodemius"
PROJECT_NUMBER = 11

# Board grouping mirrors the EPIC sections of BACKLOG.md; several user stories
# share one epic (US-4 + US-5 etc.), so the mapping is many-to-one.
EPIC_OPTION = {
    "epic:e0": "E0 · Инфраструктура",
    "epic:us-1": "US-1 · Регистрация и вход",
    "epic:us-12": "US-12 · Игровой контент",
    "epic:us-2": "US-2 · Создание персонажа",
    "epic:us-3": "US-3 + US-11 · Лист персонажа",
    "epic:us-4": "US-4 + US-5 · Прокачка и откат",
    "epic:us-5": "US-4 + US-5 · Прокачка и откат",
    "epic:us-8": "US-6 + US-8 + US-9 · Кампании",
    "epic:us-9": "US-6 + US-8 + US-9 · Кампании",
    "epic:us-7": "US-7 + US-10 · Торговцы",
    "epic:us-10": "US-7 + US-10 · Торговцы",
    "epic:e9": "E9 · Релиз",
}
# First match wins: a task labelled backend+docs is a backend task.
AREA_ORDER = ["infra", "frontend", "backend", "docs"]

EPIC_FIELD = "Эпик"
AREA_FIELD = "Область"
STATUS_FIELD = "Status"


def sh(args: list[str], stdin: str | None = None) -> str:
    # encoding="utf-8": gh emits UTF-8; on a cp1251 Windows locale the default
    # text decoder chokes on Cyrillic issue titles.
    return subprocess.run(args, check=True, capture_output=True, text=True,
                          encoding="utf-8", input=stdin).stdout


def gql(query: str, **variables) -> dict:
    args = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        flag = "-F" if isinstance(value, int) else "-f"
        args += [flag, f"{key}={value}"]
    return json.loads(sh(args))["data"]


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


def load_tasks() -> dict[str, dict]:
    return {t["id"]: t for t in parse_backlog(BACKLOG.read_text(encoding="utf-8"))}


def load_issues() -> dict[str, dict]:
    """All DND issues, keyed by task ID (DND-NNN)."""
    out = sh(["gh", "issue", "list", "--state", "all", "--limit", "500",
              "--json", "number,title,state,labels"])
    issues = {}
    for it in json.loads(out):
        m = DND_RE.match(it["title"])
        if m:
            issues[m.group(1)] = {
                "number": it["number"],
                "title": it["title"],
                "state": it["state"],           # OPEN | CLOSED
                "labels": {l["name"] for l in it["labels"]},
            }
    return issues


def epic_option(labels) -> str | None:
    return next((EPIC_OPTION[l] for l in labels if l in EPIC_OPTION), None)


def area_option(labels) -> str | None:
    return next((a for a in AREA_ORDER if a in labels), None)


# --- project board (Projects v2) ------------------------------------------
# Needs a token with the `project` scope: GITHUB_TOKEN cannot write user-owned
# projects. Callers should tolerate failure — the board is a view, not state.

_PROJECT_Q = """
query($owner: String!, $number: Int!, $cursor: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 30) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options { id name }
          }
        }
      }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { number } }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
        }
      }
    }
  }
}
"""


def load_board() -> dict:
    """Project id, single-select field/option ids, and current items by issue number."""
    fields, items, cursor = {}, {}, None
    project_id = None
    while True:
        data = gql(_PROJECT_Q, owner=PROJECT_OWNER, number=PROJECT_NUMBER, cursor=cursor or "")
        p = data["user"]["projectV2"]
        project_id = p["id"]
        for f in p["fields"]["nodes"]:
            if f:
                fields[f["name"]] = {"id": f["id"],
                                     "options": {o["name"]: o["id"] for o in f["options"]}}
        for node in p["items"]["nodes"]:
            content = node.get("content") or {}
            if "number" not in content:
                continue  # draft item
            values = {fv["field"]["name"]: fv["name"]
                      for fv in node["fieldValues"]["nodes"] if fv.get("field")}
            items[content["number"]] = {"id": node["id"], "values": values}
        page = p["items"]["pageInfo"]
        if not page["hasNextPage"]:
            break
        cursor = page["endCursor"]
    return {"id": project_id, "fields": fields, "items": items}


def add_to_board(board: dict, issue_node_id: str) -> str:
    q = ('mutation($project: ID!, $content: ID!) { addProjectV2ItemById('
         'input: {projectId: $project, contentId: $content}) { item { id } } }')
    data = gql(q, project=board["id"], content=issue_node_id)
    return data["addProjectV2ItemById"]["item"]["id"]


def set_board_field(board: dict, item_id: str, field: str, option: str) -> None:
    f = board["fields"][field]
    q = ('mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {'
         ' updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item,'
         ' fieldId: $field, value: {singleSelectOptionId: $option}})'
         ' { projectV2Item { id } } }')
    gql(q, project=board["id"], item=item_id, field=f["id"], option=f["options"][option])


def issue_node_id(number: int) -> str:
    return json.loads(sh(["gh", "issue", "view", str(number), "--json", "id"]))["id"]
