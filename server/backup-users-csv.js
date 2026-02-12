const admin = require("firebase-admin");
const fs = require('fs');
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 1. โหลดกุญแจ (ใช้ไฟล์เดียวกับ server.js)
let serviceAccount;
try {
    serviceAccount = require("./classic-e8ab7-firebase-adminsdk-fbsvc-8c07b33104.json");
} catch (e) {
    console.error("❌ ไม่พบไฟล์กุญแจ Firebase");
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function backupUsersToCSV() {
    console.log("⏳ กำลังดึงข้อมูลผู้ใช้งาน...");
    try {
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            console.log("❌ ไม่พบข้อมูลผู้ใช้งาน");
            return;
        }

        // กำหนด Header ของ CSV
        const headers = ['id', 'username', 'role', 'createdAt', 'vipExpiresAt'];
        const csvRows = [headers.join(',')];

        snapshot.forEach(doc => {
            const data = doc.data();
            // แปลงวันที่เป็นรูปแบบที่อ่านง่าย
            const createdAt = data.createdAt ? new Date(data.createdAt.toDate()).toISOString() : '';
            const vipExpiresAt = data.vipExpiresAt ? new Date(data.vipExpiresAt.toDate()).toISOString() : '';
            
            // เตรียมข้อมูลแต่ละคอลัมน์ (ใส่เครื่องหมายคำพูดครอบเพื่อป้องกันกรณีมี comma ในข้อมูล)
            const row = [
                doc.id,
                `"${data.username || ''}"`,
                data.role || 'user',
                createdAt,
                vipExpiresAt
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        const filename = `users_backup_${new Date().toISOString().slice(0,10)}.csv`;
        const filePath = path.join(__dirname, filename);

        fs.writeFileSync(filePath, csvContent, 'utf8');
        console.log(`✅ Backup เสร็จสิ้น! บันทึกไฟล์ที่: ${filePath}`);
        console.log(`📊 จำนวนผู้ใช้งาน: ${snapshot.size} คน`);

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

backupUsersToCSV();