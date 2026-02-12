const admin = require("firebase-admin");
require('dotenv').config();

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

const unseedAdmin = async () => {
    const adminEmail = "duy.kan1234@gmail.com"; // ต้องตรงกับใน seed.js
    console.log(`⏳ กำลังค้นหาและลบ Admin: ${adminEmail}...`);

    try {
        const snapshot = await db.collection('users').where('username', '==', adminEmail).get();
        
        if (snapshot.empty) {
            console.log("ℹ️ ไม่พบผู้ใช้นี้ในระบบ (อาจจะถูกลบไปแล้ว)");
        } else {
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log("✅ ลบ Admin เรียบร้อยแล้ว! (สามารถรัน node seed.js เพื่อสร้างใหม่ได้)");
        }
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
};

unseedAdmin();