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

## Ausnahme: Explizite Anforderung

Wenn der Nutzer **explizit** `git commit & push` (oder gleichbedeutend) fordert, darf ohne Rückfrage committed und gepusht werden – jedoch weiterhin mit kurzer Anzeige der geänderten Dateien und der vorgeschlagenen Commit-Message. Rückfrage nur wenn die Commit-Message unklar ist oder destruktive Optionen (`--force`, `--hard`) nötig wären.

## Nach jedem Push: Deploy-Check

Nach jedem erfolgreichen `git push` **immer** den Deploy-Check asynchron starten:

```powershell
$sha = git rev-parse HEAD
Start-Job { param($s) pwsh -NoProfile -File ".github/scripts/check-deploy.ps1" -Sha $s } -ArgumentList $sha
```

Dann den Job-Output mit `Receive-Job` abrufen sobald die Ergebnisse vorliegen und dem Nutzer melden ob beide Workflows erfolgreich waren.
