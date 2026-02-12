@echo off
echo 🧹 Cleaning up temporary files...

:: ลบไฟล์ Log ต่างๆ (เช่น npm-debug.log)
del /s /q *.log 2>nul

:: ลบไฟล์ขยะของระบบปฏิบัติการ (เช่น Thumbs.db)
del /s /q .DS_Store 2>nul
del /s /q Thumbs.db 2>nul

:: ลบโฟลเดอร์ Cache ของ Vercel (ถ้ามี)
if exist .vercel rmdir /s /q .vercel

echo ✅ Cleanup complete!
pause