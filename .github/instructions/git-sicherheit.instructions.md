---
applyTo: "**"
---

# Git-Sicherheitsregeln

Folgende Git-Operationen dürfen **niemals selbstständig** ausgeführt werden – immer zuerst den Nutzer fragen und explizite Bestätigung einholen:

## Rückfrage erforderlich

- `git push` (egal ob mit oder ohne Optionen)
- `git push --force` / `git push --force-with-lease`
- `git reset` (insbesondere `--hard`)
- `git rebase` (inklusive interaktiv)
- `git commit --amend`
- `git clean -f` / `git clean -fd`

## Erlaubt ohne Rückfrage

- `git add`
- `git commit` (ohne `--amend`)
- `git status`, `git log`, `git diff`
- `git stash`, `git checkout`, `git branch`

## Verhalten bei Rückfragen

Wenn eine der obigen Operationen sinnvoll wäre, **vorschlagen und erklären warum**, dann fragen – mit der Möglichkeit für den Nutzer, den genauen Befehl selbst anzupassen (`allowFreeformInput: true`).
