const admin = require("firebase-admin");
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

async function checkDuplicateMovies() {
    console.log("⏳ กำลังตรวจสอบหนังซ้ำ (Duplicate Check)...");
    
    try {
        const snapshot = await db.collection('series').get();
        if (snapshot.empty) {
            console.log("❌ ไม่พบข้อมูลหนังในระบบ");
            return;
        }

        const movieMap = new Map();
        let totalMovies = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const ytId = data.ytId;
            
            if (ytId) {
                if (!movieMap.has(ytId)) {
                    movieMap.set(ytId, []);
                }
                movieMap.get(ytId).push({
                    id: doc.id,
                    title: data.title,
                    year: data.year
                });
            }
            totalMovies++;
        });

        console.log(`📊 ตรวจสอบทั้งหมด: ${totalMovies} เรื่อง`);
        console.log("---------------------------------------------------");

        let duplicateCount = 0;

        for (const [ytId, movies] of movieMap.entries()) {
            if (movies.length > 1) {
                duplicateCount++;
                console.log(`⚠️ พบหนังซ้ำ! (YouTube ID: ${ytId})`);
                movies.forEach((m, index) => {
                    console.log(`   ${index + 1}. ${m.title} (${m.year}) [ID: ${m.id}]`);
                });
                console.log("");
            }
        }

        if (duplicateCount === 0) {
            console.log("✅ ไม่พบหนังซ้ำกันเลย (YouTube ID ไม่ซ้ำ)");
        } else {
            console.log(`❌ พบรายการซ้ำทั้งหมด ${duplicateCount} กลุ่ม`);
        }

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

checkDuplicateMovies();