const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const path = require("path");
require('dotenv').config(); // โหลดค่าจาก .env

// 1. ตรวจสอบชื่อไฟล์กุญแจให้ตรงกับในเครื่องคุณ
const serviceAccount = require("./classic-e8ab7-firebase-adminsdk-fbsvc-8c07b33104.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const seedAdminUser = async () => {
    try {
        console.log("⏳ กำลังเริ่มสร้างบัญชี Admin ใน Firebase...");
        
        const adminEmail = "duy.kan1234@gmail.com"; // เมลของคุณ
        const adminPassword = process.env.ADMIN_PASSWORD || "12345678"; // รหัสผ่าน (แนะนำให้ตั้งใน .env)

        const userRef = db.collection('users');
        const snapshot = await userRef.where('username', '==', adminEmail).get();

        if (snapshot.empty) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(adminPassword, salt);

            await userRef.add({
                username: adminEmail,
                password: hashedPassword,
                role: 'admin',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ สร้าง Admin: ${adminEmail} สำเร็จแล้ว!`);
        } else {
            console.log("ℹ️ มีบัญชี Admin นี้อยู่ใน Firebase แล้ว");
        }
        process.exit(0);
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
        process.exit(1);
    }
};

seedAdminUser();