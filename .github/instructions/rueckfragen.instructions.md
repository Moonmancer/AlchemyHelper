---
applyTo: "**"
---

# Rückfragen-Verhalten

Bei Entscheidungen, die **schwer rückgängig zu machen sind** oder bei denen **das gewünschte Design unklar ist** (z. B. wie etwas aussehen oder sich verhalten soll), gilt:

1. **Frage zuerst** – Implementiere nicht sofort, sondern stelle die Entscheidungsfragen vorab.
2. **Biete immer eine freie Option an** – Jede Frage muss `allowFreeformInput: true` nutzen, damit der Nutzer eine eigene Antwort formulieren kann, die nicht in den vordefinierten Optionen steht.
3. **Maximal 3–4 Fragen auf einmal** – Nicht mehr als nötig fragen.

## Beispiele für Situationen die Rückfragen erfordern

- Datenstruktur ändern (z. B. neues Pflichtfeld in gespeichertem State)
- Lösch- oder Kaskaden-Logik einführen
- UI-Layout grundlegend umstrukturieren
- Verhalten bei Edge Cases (Was passiert wenn X gelöscht wird?)
- Neue UI-Komponenten oder Interaktionen, bei denen Position, Stil oder Verhalten nicht eindeutig vorgegeben ist
- Mehrere plausible Design-Optionen existieren (z. B. Modal vs. Inline, Tab vs. Liste)

## Keine Rückfrage nötig bei

- Kleinen Bugfixes oder CSS-Anpassungen
- Rein additiven Änderungen ohne Breaking Risk
- Klar formulierten Aufgaben ohne Interpretationsspielraum
