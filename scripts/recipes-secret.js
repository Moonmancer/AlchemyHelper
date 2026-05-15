// Secret-Rezepte: Werden erkannt, wenn der Kessel im Custom-Modus die passenden
// Kriterien erfüllt (Real-time, kein Speichern nötig).
// Felder:
//   id             - Item-ID des Produkts (integer); dient auch als Icon in "Dein Ergebnis"
//   name           - Anzeigename für Toast (string, wird NICHT für Matching verwendet)
//   ingredients    - Array[4] von Zutatentypen z. B. ["Food", "Wood", "Sand", "Magic"]
//                    Reihenfolge muss exakt übereinstimmen.
//   mainIngredient - Material-ID (integer) in Slot 0 (Hauptzutat)
//   agent          - Agenten-Name (string, exakter Vergleich); undefined = egal
//   element        - Dominantes Element z. B. "Fire" | "Earth" | "Air" | "Water" | "None"
//                    Case-insensitiver Vergleich.
//   minScore       - Minimaler Element-Score (integer); 0 = kein Schwellwert
//   minQuality     - Angezeigte Qualität (inkl. Agent-Bonus) muss >= diesem Wert sein
//   potionBase     - Potion-Base-ID (integer); Basic=645 | Intermediate=656 | Advanced=657 | Special=610
//   catalyst       - Katalysator-Name-String (exakter Vergleich); "none" für keinen Katalysator
//   extraItemIds   - Array von IDs aus extra-items.js, die dieses Secret freischaltet
window.SECRET_RECIPES = [
  {
    id: 40120,
    name: "Caelum",
    ingredients: ["Magic", "Magic", "Magic", "Magic"],
    mainIngredient: 40022,
    agent: "Crimson Maxima",
    potionBase: 610,
    element: "Fire",
    minScore: 0,
    minQuality: 100,
    catalyst: "Garm's Essence",
    extraItemIds: [40129],
  },
  {
    id: 40121,
    name: "Request Note",
    ingredients: ["Wood", "Beast", "Sand", "Magic"],
    potionBase: 645,
    element: "Air",
    minScore: 0,
    minQuality: 0,
    catalyst: "Blue Gemstone",
  },
  {
    id: 7136,
    name: "Acid Bottle",
    ingredients: ["Alloy", "Wood", "Beast", "Sand"],
    mainIngredient: 40018,
    potionBase: 657,
    element: "Water",
    minScore: 150,
    minQuality: 75,
    catalyst: "Garm's Essence",
    extraItemIds: [730],
  },
  {
    id: 40123,
    name: "Special Nutrient",
    ingredients: ["Beast", "Food", "Sand", "Wood"],
    mainIngredient: 40015,
    potionBase: 656,
    element: "Water",
    minScore: 270,
    minQuality: 40,
    catalyst: "Cyfar",
    extraItemIds: [30414],
  },
  {
    id: 40364,
    name: "Tome of Distance Farm",
    ingredients: ["Beast", "Magic", "Wood", "Wood"],
    potionBase: 656,
    element: "Air",
    minScore: 0,
    minQuality: 50,
    catalyst: "Cyfar",
    extraItemIds: [40363],
  },
  {
    id: 40124,
    name: "Charging Rod",
    ingredients: ["Alloy", "Magic", "Food", "Magic"],
    potionBase: 657,
    element: "Air",
    minScore: 140,
    minQuality: 90,
    catalyst: "Blue Gemstone",
    extraItemIds: [30426],
  },
  {
    id: 40365,
    name: "Mastela Juice",
    ingredients: ["Food", "Wood", "Beast", "Sand"],
    mainIngredient: 40000,
    potionBase: 656,
    element: "Fire",
    minScore: 100,
    minQuality: 90,
    catalyst: "Blue Gemstone",
    extraItemIds: [522],
  },
];
