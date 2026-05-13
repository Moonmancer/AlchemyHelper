---
applyTo: "**/*.js"
---

# Kein JSX – nur React.createElement()

Dieses Projekt hat **keinen JSX-Transpiler**. `app.js` wird direkt vom Browser ausgeführt.

## Harte Regel

- **Niemals JSX-Syntax schreiben** (`<div>`, `<Component />`, etc.)
- Alle React-UI-Elemente müssen als `React.createElement(type, props, ...children)` geschrieben werden
- Kommentare `/*#__PURE__*/` vor createElement-Aufrufen sind erlaubt und erwünscht (Tree-Shaking)

## Beispiel

```js
// ✅ Korrekt
React.createElement("div", { className: "flex gap-2" },
  React.createElement("span", null, "Hallo")
)

// ❌ Verboten – Browser kann das nicht parsen
<div className="flex gap-2">
  <span>Hallo</span>
</div>
```
