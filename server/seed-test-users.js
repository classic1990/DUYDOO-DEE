const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
require('dotenv').config();

// 1. โหลดกุญแจ Firebase (ใช้ไฟล์เดียวกับ server.js)
let serviceAccount;
try {
    serviceAccount = require("./classic-e8ab7-firebase-adminsdk-fbsvc-8c07b33104.json");
} catch (e) {
    console.error("❌ ไม่พบไฟล์กุญแจ Firebase (classic-e8ab7-firebase-adminsdk-fbsvc-8c07b33104.json)");
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const createTestUsers = async () => {
    console.log("⏳ กำลังสร้างบัญชีทดสอบ...");

    // รายชื่อ User ที่ต้องการสร้าง
    const users = [
        { username: 'vip_test', password: 'password1234', role: 'vip' },
        { username: 'member_test', password: 'password1234', role: 'user' }
    ];

    for (const u of users) {
        try {
            // เช็คว่ามี User นี้หรือยัง
            const snapshot = await db.collection('users').where('username', '==', u.username).get();
            
            if (snapshot.empty) {
                // เข้ารหัสรหัสผ่าน
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(u.password, salt);

                // บันทึกลง Firestore
                await db.collection('users').add({
                    username: u.username,
                    password: hashedPassword,
                    role: u.role,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ สร้างสำเร็จ: ${u.username} (Role: ${u.role}) / Pass: ${u.password}`);
            } else {
                console.log(`ℹ️ มีอยู่แล้ว: ${u.username} (ข้าม)`);
            }
        } catch (err) {
            console.error(`❌ สร้างไม่สำเร็จ (${u.username}):`, err.message);
        }
    }
    
    console.log("\n✨ เสร็จสิ้น! คุณสามารถนำบัญชีเหล่านี้ไปล็อกอินได้เลย");
    process.exit(0);
};

createTestUsers();