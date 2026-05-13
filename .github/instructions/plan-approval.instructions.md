---
applyTo: "**"
---

# Plan vor Implementierung

Bei komplexen oder mehrstufigen Aufgaben (mehr als ~2 Dateien oder ~3 Schritte):

1. **Plan erstellen** – Liste alle geplanten Änderungen auf:
   - Welche Dateien werden geändert
   - Was genau wird geändert (kurz, präzise)
   - In welcher Reihenfolge

2. **Plan präsentieren** – Den Plan dem Nutzer mit dem `vscode_askQuestions`-Tool
   vorlegen. Die Frage lautet „Hast du Korrekturen am Plan?", mit anklickbaren
   Optionen die typische Korrekturen abdecken, z.B.:
   - „Plan ist ok – umsetzen"
   - „Reihenfolge der Schritte ändern"
   - „Andere Dateien betroffen"
   - „Schritt hinzufügen / entfernen"
   - „Anderes" (Freitext)

   Immer `allowFreeformInput: true` setzen damit der Nutzer auch frei antworten kann.

3. **Iterieren** – Korrekturen einarbeiten und den aktualisierten Plan erneut vorlegen.

4. **Warten auf explizite Freigabe** – Erst wenn der Nutzer den Plan bestätigt
   (z.B. „ok", „passt", „mach es"), mit der Implementierung beginnen.

## Ausnahmen (kein Plan nötig)

- Triviale Einzeländerungen (z.B. ein Wort umbenennen, ein Label ändern)
- Explizit einfache Fixes ohne Interpretationsspielraum
