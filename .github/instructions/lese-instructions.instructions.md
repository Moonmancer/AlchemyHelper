---
applyTo: "**"
---

# Instructions vor Bearbeitung lesen

Bevor du mit einer Aufgabe beginnst, **prüfe welche der vorhandenen Instruction-Dateien auf den Request zutreffen** und lade deren Inhalt mit `read_file`, sofern er nicht bereits im Kontext steht.

## Pflicht-Prüfung bei jedem Request

1. Alle Instructions mit `applyTo: "**"` gelten immer – deren Inhalt **muss** vor der ersten Code-Änderung bekannt sein.
2. Instructions mit eingeschränktem `applyTo` (z. B. `**/*.js`) müssen gelesen werden, wenn die betroffenen Dateien in den Scope fallen.
3. Wenn der Request ein Thema berührt, das von einer Instruction abgedeckt wird (Git, Dokumentation, Plan-Freigabe, Rückfragen, Fortschritt), ist die jeweilige Instruction zu lesen **bevor** gehandelt wird.

## Konsequenz bei Nicht-Einhaltung

Das Überspringen dieses Schritts führt typischerweise dazu, dass:
- Implementierungen ohne Planfreigabe stattfinden (`plan-approval`)
- Destructive Git-Operationen ohne Rückfrage ausgeführt werden (`git-sicherheit`)
- Unaufgeforderte Dokumentation erstellt wird (`no-auto-docs`)

## Vorhandene Instructions in diesem Projekt

| Datei | Wann relevant |
|---|---|
| `plan-approval.instructions.md` | Mehr als 1 Codeänderung oder Design-Entscheidung |
| `git-sicherheit.instructions.md` | Jeder Git-Befehl |
| `rueckfragen.instructions.md` | Unklares Design oder irreversible Änderungen |
| `no-auto-docs.instructions.md` | Immer (Dokumentation nie unaufgefordert) |
| `no-jsx.instructions.md` | Änderungen an `.js`-Dateien |
| `progress-updates.instructions.md` | Lange oder mehrstufige Aufgaben |
