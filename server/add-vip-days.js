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

const addVipDays = async () => {
    const username = process.argv[2];
    const days = parseInt(process.argv[3]);

    if (!username || isNaN(days)) {
        console.log("Usage: node add-vip-days.js <username> <days>");
        console.log("Example: node add-vip-days.js user1 7");
        process.exit(1);
    }

    console.log(`⏳ กำลังเพิ่มวันใช้งาน ${days} วัน ให้กับ: ${username}...`);

    try {
        const snapshot = await db.collection('users').where('username', '==', username).get();
        
        if (snapshot.empty) {
            console.log("❌ ไม่พบผู้ใช้งานนี้ในระบบ");
            process.exit(1);
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        let newExpireDate = new Date();
        
        // ถ้าเป็น VIP อยู่แล้วและยังไม่หมดอายุ ให้บวกเพิ่มจากวันเดิม
        if (userData.role === 'vip' && userData.vipExpiresAt) {
            const currentExpire = userData.vipExpiresAt.toDate();
            if (currentExpire > newExpireDate) {
                newExpireDate = currentExpire;
            }
        }

        // บวกวันเพิ่ม
        newExpireDate.setDate(newExpireDate.getDate() + days);

        await userDoc.ref.update({
            role: 'vip',
            vipExpiresAt: admin.firestore.Timestamp.fromDate(newExpireDate)
        });

        console.log(`✅ สำเร็จ! สถานะปัจจุบัน: VIP`);
        console.log(`📅 หมดอายุวันที่: ${newExpireDate.toLocaleString('th-TH')}`);

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    } finally {
        process.exit(0);
    }
};

addVipDays();