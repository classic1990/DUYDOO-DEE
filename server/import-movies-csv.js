const admin = require("firebase-admin");
const fs = require('fs');
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 1. โหลดกุญแจ
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

// ฟังก์ชันช่วยแปลง CSV Line เป็น Array (รองรับ comma ใน quotes)
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuote && row[i + 1] === '"') { // Handle escaped quotes
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

async function importMoviesFromCSV() {
    const filePath = process.argv[2]; // รับชื่อไฟล์จาก command line
    if (!filePath) {
        console.log("Usage: npm run import:movies <path_to_csv_file>");
        console.log("Example: npm run import:movies movies.csv");
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`❌ ไม่พบไฟล์: ${filePath}`);
        process.exit(1);
    }

    console.log(`⏳ กำลังอ่านไฟล์ CSV: ${filePath}...`);
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const rows = fileContent.split('\n').filter(row => row.trim() !== '');
        
        // บรรทัดแรกคือ Header: title,year,rating,ytId,posterUrl,category,totalEpisodes,description,isVip
        const headers = parseCSVRow(rows[0]);
        
        let successCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const values = parseCSVRow(rows[i]);
            if (values.length < headers.length) continue;

            const movieData = {};
            headers.forEach((header, index) => {
                let val = values[index];
                // แปลง Type ให้ถูกต้อง
                if (header === 'year' || header === 'totalEpisodes') val = parseInt(val) || 0;
                if (header === 'rating') val = parseFloat(val) || 0;
                if (header === 'isVip') val = (val.toLowerCase() === 'true' || val === '1');
                movieData[header] = val;
            });

            movieData.createdAt = admin.firestore.FieldValue.serverTimestamp();

            await db.collection('series').add(movieData);
            console.log(`✅ นำเข้า: ${movieData.title}`);
            successCount++;
        }

        console.log(`\n✨ นำเข้าเสร็จสิ้นทั้งหมด ${successCount} เรื่อง!`);

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

importMoviesFromCSV();