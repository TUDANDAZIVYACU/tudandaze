cd C:\dev\business.bi
git add .
git commit -m "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push
Write-Host "✅ Projet mis à jour sur GitHub"