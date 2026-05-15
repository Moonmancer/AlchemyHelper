// Secret-Rezepte: Werden erkannt, wenn der Kessel im Custom-Modus die passenden
// Kriterien erfüllt (Real-time, kein Speichern nötig).
// Felder:
//   id             - eindeutige ID (string)
//   name           - Anzeigename für Toast (string, wird NICHT für Matching verwendet)
//   ingredients    - Array[4] von Zutatentypen z. B. ["Food", "Wood", "Sand", "Magic"]
//                    Reihenfolge muss exakt übereinstimmen.
//   mainIngredient - Material-ID (integer) in Slot 0 (Hauptzutat)
//   agent          - Agenten-Name (string, exakter Vergleich); undefined = egal
//   minElement     - Dominantes Element z. B. "Fire" | "Earth" | "Air" | "Water" | "None"
//                    Case-insensitiver Vergleich.
//   minQuality     - Angezeigte Qualität (inkl. Agent-Bonus) muss >= diesem Wert sein
//   potionBase     - Potion-Base-ID (integer); Basic=645 | Intermediate=656 | Advanced=657 | Special=610
//   catalyst       - Katalysator-Name-String (exakter Vergleich); "none" für keinen Katalysator
//   product        - Item-ID des Produkts (integer); wird als Icon in "Dein Ergebnis" angezeigt
//   extraItemIds   - Array von IDs aus extra-items.js, die dieses Secret freischaltet
window.SECRET_RECIPES = [
  {
    id: "secret_caelum",
    name: "Caelum",
    ingredients: ["Magic", "Magic", "Magic", "Magic"],
    mainIngredient: 40022,
    product: 40120,
    agent: "Crimson Maxima",
    potionBase: 610,
    minElement: "Fire",
    minQuality: 100,
    catalyst: "Garm's Essence",
    extraItemIds: [40129],
  },
];
