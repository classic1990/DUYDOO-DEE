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

function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuote && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

async function undoImport() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.log("Usage: npm run undo:import <path_to_csv_file>");
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`❌ ไม่พบไฟล์: ${filePath}`);
        process.exit(1);
    }

    console.log(`⏳ กำลังอ่านไฟล์ CSV เพื่อลบข้อมูล: ${filePath}...`);
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const rows = fileContent.split('\n').filter(row => row.trim() !== '');
        const headers = parseCSVRow(rows[0]);
        
        const titleIndex = headers.indexOf('title');
        if (titleIndex === -1) throw new Error("ไม่พบคอลัมน์ 'title' ในไฟล์ CSV");

        let deletedCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const values = parseCSVRow(rows[i]);
            const title = values[titleIndex];
            
            if (!title) continue;

            const snapshot = await db.collection('series').where('title', '==', title).get();
            if (!snapshot.empty) {
                for (const doc of snapshot.docs) {
                    await doc.ref.delete();
                    console.log(`🗑️ ลบ: ${title}`);
                    deletedCount++;
                }
            }
        }
        console.log(`\n✨ ลบเสร็จสิ้นทั้งหมด ${deletedCount} รายการ!`);
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

undoImport();