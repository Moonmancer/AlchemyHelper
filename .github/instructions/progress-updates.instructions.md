---
applyTo: "**"
---

# Fortschritt bei langen Verarbeitungen

Bei Aufgaben die voraussichtlich länger dauern (geschätzt > ~30 Sekunden
Verarbeitungszeit oder viele aufeinander folgende Tool-Calls):

1. **Regelmäßige Status-Meldungen** – Nach jedem abgeschlossenen Teilschritt
   den Fortschritt als Checkbox-Liste melden:
   ```
   - [x] Schritt A erledigt
   - [x] Schritt B erledigt
   - [ ] Schritt C (läuft)
   - [ ] Schritt D (ausstehend)
   ```

2. **Pausieren bei Unklarheiten** – Wenn der Agent eine offene Frage hat,
   die den weiteren Verlauf beeinflusst: **stoppen, fragen, auf Antwort warten**.
   Nicht raten und weitermachen.

3. **Nutzer zu Wort kommen lassen** – Nach größeren Abschnitten fragen:
   *„Hast du Korrekturen oder soll ich so weitermachen?"*
   Dann warten.

## Ausnahmen (kein Progress-Update nötig)

- Kurze Einzeloperationen (z.B. Label umbenennen, eine Zeile ändern)
