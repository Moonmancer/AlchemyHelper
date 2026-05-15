---
name: secret-recipe
description: 'Erstellt oder bearbeitet Secret Recipes im Alchemie-Projekt. Verwenden wenn: neue Secret Recipes aus Screenshots oder Beschreibungen angelegt werden sollen; Rezept-Felder (element, minScore, catalyst, potionBase, agent, extraItemIds) hinzugefügt oder korrigiert werden; Extra-Items zu extra-items.js hinzugefügt werden; fehlende Icons in db-icons.js festgestellt werden.'
argument-hint: 'Optionaler Name oder ID des Secret Recipe Items'
---

# Secret Recipe erstellen

## Betroffene Dateien

| Datei | Zweck |
|---|---|
| `scripts/recipes-secret.js` | Array `window.SECRET_RECIPES` – alle Secret Recipes |
| `scripts/extra-items.js` | Array `window.EXTRA_ITEMS` – Extra-Items die Secrets freischalten |
| `db-icons.js` | `window.ICON_DB` – Icons nach Item-ID |

## Rezept-Schema

```js
{
  id: 40123,                        // Item-ID des Produkts (integer) – dient als Icon-Key
  name: "Special Nutrient",         // Anzeigename (nur für Toast, kein Matching)
  ingredients: ["Beast","Food","Sand","Wood"], // Reihenfolge exakt, 4 Slots
  mainIngredient: 40015,            // Material-ID in Slot 0 (optional, undefined = egal)
  agent: "Mana Maxima",             // Agenten-Name exakt (optional, undefined = egal)
  potionBase: 656,                  // Basic=645 | Intermediate=656 | Advanced=657 | Special=610
  element: "Water",                 // "Fire"|"Earth"|"Air"|"Water"|"None" (case-insensitiv)
  minScore: 0,                      // Minimaler Element-Score (stats.fire/earth/air/water)
  minQuality: 50,                   // Mindest-Qualität inkl. Agent-Bonus
  catalyst: "Cyfar",                // Katalysator-Name exakt (optional, undefined = egal)
  extraItemIds: [30414],            // IDs aus extra-items.js (optional)
}
```

## ID-Nachschlagen

Bevor Fragen gestellt werden, immer zuerst in diesen Dateien suchen:

| Suche | Datei |
|---|---|
| Zutaten-ID (`mainIngredient`) | `scripts/materials.js` → `name:` |
| Katalysator-Name | `scripts/catalysts.js` → `name:` |
| Agenten-Name | `scripts/agents.js` → `name:` |
| Potion-Base-ID | `scripts/potion-base.js` → `name:` |
| Extra-Item vorhanden? | `scripts/extra-items.js` → `id:` |
| Icon vorhanden? | `db-icons.js` → `<id>:` |

## Informationen aus Screenshots ableiten

| Screenshot-Text | Feld |
|---|---|
| `[Beast][Magic][Wood][Wood]` | `ingredients` – Reihenfolge beachten |
| Dominantes Element (z.B. "Air based") | `element` |
| `score of 270` / `W:250` | `minScore` |
| `quality of 50` / `B:82` | `minQuality` |
| `'Cyfar'` / `'Garm's Essence'` | `catalyst` |
| `Awakening Potion` als Base | `potionBase: 656` |
| `Concentration Potion` als Base | `potionBase: 645` |
| `two Awakening Potion` / Advanced | `potionBase: 657` |
| `(Mana Maxima)` / Agent-Name | `agent` |
| "goes in first as main material" | `mainIngredient` → ID in materials.js suchen |
| "at the end" / "as extra" | `extraItemIds` |

## Pflicht-Fragen (wenn unklar)

Nur fragen was nicht aus dem Screenshot/Beschreibung ableitbar ist:

1. **Produkt-ID** – falls nicht genannt (z.B. "Tome of Distance Farm **40364**")
2. **mainIngredient-ID** – falls Item-Name bekannt aber ID fehlt → zuerst in `materials.js` suchen
3. **Extra-Item-ID** – falls Item-Name bekannt aber ID fehlt
4. **potionBase** – falls "two X" oder mehrdeutig
5. **minScore** – falls nicht erwähnt → Default: `0`
6. **agent** – falls nicht erwähnt → weglassen (undefined)

## Ablauf

1. Aus Screenshot/Text alle bekannten Felder extrahieren
2. Fehlende IDs in den Datei-Quellen nachschlagen (grep_search)
3. Nur bei echten Unklarheiten fragen (vscode_askQuestions, max 4 Fragen)
4. `scripts/recipes-secret.js` – Rezept ans Ende des Arrays einfügen
5. `scripts/extra-items.js` – neue Extra-Items hinzufügen falls noch nicht vorhanden
6. Prüfen ob Icons (`id` des Produkts, Extra-Item-IDs) in `db-icons.js` existieren → fehlende Icons dem Nutzer melden
7. `git add` + `git commit` mit aussagekräftiger Message

## Extra-Item-Schema

```js
{ id: 30414, name: "Timeless Eel", type: "Extra" }
```

`type` ist immer `"Extra"` für Secret-Recipe-Extra-Items.

## Commit-Message-Format

```
feat: add <Name> secret recipe with <ExtraItem> extra item
feat: add icon for <Name> (<id>)
```
