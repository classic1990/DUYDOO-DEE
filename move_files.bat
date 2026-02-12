@echo off
echo 📦 Moving admin.html and login.html to client folder...

move "server\admin.html" "client\admin.html"
move "server\login.html" "client\login.html"

echo ✅ Done! Files moved successfully.
pause