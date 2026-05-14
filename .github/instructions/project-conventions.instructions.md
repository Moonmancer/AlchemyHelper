---
applyTo: "**"
---

# Projekt-Konventionen

## Temporäre Verarbeitungs-Skripte

Wenn du JavaScript-Dateien erstellst, die **nur zur einmaligen Datenverarbeitung** dienen (z. B. Transformations-Skripte, Migrations-Hilfsskripte, Analyse-Skripte), lege sie in den `temp/`-Ordner:

```
temp/mein-skript.js
```

Der `temp/`-Ordner ist in `.gitignore` eingetragen und wird nicht committed.

Nicht betroffen: produktiver Code, Applikations-Logik, Build-Skripte.

## UTF-8 in Hilfs-Skripten

Wenn Hilfs-Skripte Dateien lesen oder schreiben, **immer explizit UTF-8 angeben** – nie die System-Standardkodierung verwenden:

**Node.js:**
```js
// Lesen
const content = fs.readFileSync(filePath, "utf8");

// Schreiben
fs.writeFileSync(filePath, content, "utf8");
```

**PowerShell:**
```powershell
# Lesen
Get-Content $file -Encoding UTF8 -Raw

# Schreiben
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
```

**Warum:** Fehlendes Encoding führt zu doppelt-kodiertem UTF-8 (Mojibake), z. B. `Ã¼` statt `ü`. Das Reparieren dieser Fehler ist aufwändig.
