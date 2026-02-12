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

async function removeDuplicateMovies() {
    console.log("⏳ กำลังตรวจสอบและลบหนังซ้ำ (เก็บตัวล่าสุดไว้)...");
    
    try {
        const snapshot = await db.collection('series').get();
        if (snapshot.empty) {
            console.log("❌ ไม่พบข้อมูลหนัง");
            return;
        }

        const movieMap = new Map();
        
        // จัดกลุ่มตาม YouTube ID
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
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(0), // ถ้าไม่มีวันที่ ให้ถือว่าเก่าสุด
                    ref: doc.ref
                });
            }
        });

        let deletedCount = 0;
        const batch = db.batch();
        let operationCounter = 0;

        for (const [ytId, movies] of movieMap.entries()) {
            if (movies.length > 1) {
                // เรียงลำดับจาก ใหม่ -> เก่า
                movies.sort((a, b) => b.createdAt - a.createdAt);

                // เก็บตัวแรกไว้ (index 0), ที่เหลือลบทิ้ง
                const toDelete = movies.slice(1);
                
                console.log(`⚠️ พบซ้ำ: ${movies[0].title} (ID: ${ytId})`);
                console.log(`   ✅ เก็บ: ${movies[0].id} (สร้างเมื่อ: ${movies[0].createdAt.toLocaleString()})`);

                for (const movie of toDelete) {
                    console.log(`   🗑️ ลบ:  ${movie.id} (สร้างเมื่อ: ${movie.createdAt.toLocaleString()})`);
                    batch.delete(movie.ref);
                    deletedCount++;
                    operationCounter++;
                }
            }
        }

        if (operationCounter > 0) {
            await batch.commit();
            console.log(`\n✅ ลบหนังซ้ำเสร็จสิ้น! ทั้งหมด ${deletedCount} รายการ`);
        } else {
            console.log("\n✅ ไม่พบหนังซ้ำ หรือไม่มีรายการที่ต้องลบ");
        }

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
}

removeDuplicateMovies();