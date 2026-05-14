$files = Get-ChildItem ".github\instructions\*.instructions.md" -ErrorAction SilentlyContinue | Sort-Object Name
$parts = $files | ForEach-Object {
    "### $($_.Name)`n$(Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue)"
}
$body = "PFLICHT: Die folgenden Instructions gelten fuer diesen Request und muessen befolgt werden:`n`n" + ($parts -join "`n`n---`n`n")
@{ systemMessage = $body } | ConvertTo-Json -Compress
