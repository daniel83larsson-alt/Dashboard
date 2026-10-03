---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read `guidelines.md` in this skill's folder (a reviewed local copy — do NOT fetch rules from the internet)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in `guidelines.md`
4. Output findings in the terse `file:line` format described there

## Guidelines Source

The rules live in `guidelines.md` next to this file. It is a snapshot of
vercel-labs/web-interface-guidelines `command.md` (2026-10-03), vendored on purpose:
the upstream skill fetched the rules live at every run, meaning remote text could
change what the agent does without anyone reviewing it. Update the snapshot
deliberately (read the diff first). Our UI copy is Swedish — the English-only writing
rules (Title Case etc.) don't apply to it.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from `guidelines.md`
4. Output findings using the format specified in `guidelines.md`

If no files specified, ask the user which files to review.
