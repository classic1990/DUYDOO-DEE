const admin = require("firebase-admin");
const fs = require('fs');
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

async function backupMoviesToCSV() {
    console.log("⏳ กำลังดึงข้อมูลหนัง...");
    try {
        const snapshot = await db.collection('series').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            console.log("❌ ไม่พบข้อมูลหนัง");
            return;
        }

        const headers = ['title', 'year', 'rating', 'ytId', 'posterUrl', 'category', 'totalEpisodes', 'description', 'isVip'];
        const csvRows = [headers.join(',')];

        snapshot.forEach(doc => {
            const data = doc.data();
            const row = headers.map(header => {
                let val = data[header] || '';
                if (typeof val === 'string') {
                    val = val.replace(/"/g, '""'); // Escape quotes
                    if (val.includes(',') || val.includes('\n')) val = `"${val}"`;
                }
                return val;
            });
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        const filename = `movies_backup_${new Date().toISOString().slice(0,10)}.csv`;
        const filePath = path.join(__dirname, filename);

        fs.writeFileSync(filePath, csvContent, 'utf8');
        console.log(`✅ Backup หนังเสร็จสิ้น! บันทึกไฟล์ที่: ${filePath}`);
        console.log(`📊 จำนวนหนัง: ${snapshot.size} เรื่อง`);

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

backupMoviesToCSV();