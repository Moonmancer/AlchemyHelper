// Secret-Rezepte: Werden erkannt, wenn ein Custom-Rezept beim Speichern mit diesen
// Kriterien übereinstimmt. Alle gefundenen Secrets werden in localStorage gespeichert.
// Felder:
//   id           - eindeutige ID (string)
//   name         - Rezeptname; case-insensitiver Vergleich mit Custom-Rezept-Name (string)
//   ingredients  - Array[4] von Zutatentypen z. B. ["Food", "Wood", "Sand", "Magic"]
//                  Reihenfolge muss exakt übereinstimmen.
//   minElement   - Dominantes Element z. B. "Fire" | "Earth" | "Air" | "Water" | "None"
//                  Case-insensitiver Vergleich.
//   minQuality   - Durchschnittsqualität der gespeicherten Zutaten muss >= diesem Wert sein
//   catalyst     - Katalysator-Name-String (exakter Vergleich); "none" für keinen Katalysator
//   extraItemIds - Array von IDs aus extra-items.js, die dieses Secret freischaltet
window.SECRET_RECIPES = [
  // Beispiel:
  // {
  //   id: "secret_1",
  //   name: "Schattentrank",
  //   ingredients: ["Food", "Magic", "Wood", "Sand"],
  //   minElement: "Fire",
  //   minQuality: 80,
  //   catalyst: "none",
  //   extraItemIds: ["extra_1"],
  // },
];
