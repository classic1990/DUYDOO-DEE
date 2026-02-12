const admin = require("firebase-admin");
const path = require("path");

// 1. เชื่อมต่อ Firebase (ใช้ชื่อไฟล์ตามในรูปโปรเจคของคุณ)
// --- แก้ไขส่วนนี้เพื่อให้ใช้กุญแจจาก Environment Variables ของ Vercel ---

let serviceAccount;
try {
    // พยายามดึงกุญแจจาก Environment Variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
    // ถ้าไม่มี Environment Variable (เช่น รันในเครื่องตัวเอง) ให้ถอยไปใช้ไฟล์ JSON
    console.log("⚠️ ไม่พบ Environment Variable, กำลังพยายามใช้ไฟล์ Local JSON...");
    try {
        serviceAccount = require("./classic-e8ab7-firebase-adminsdk-fbsvc-8c07b33104.json");
    } catch (e) {
        console.error("❌ CRITICAL ERROR: ไม่พบไฟล์กุญแจ Firebase และไม่มี Environment Variable");
        serviceAccount = null;
    }
}

if (!admin.apps.length) {
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.warn("⚠️ Firebase ไม่ได้ถูก Initialize (ระบบฐานข้อมูลจะใช้งานไม่ได้)");
    }
}
// -------------------------------------------------------------------

const db = serviceAccount ? admin.firestore() : { collection: () => ({ where: () => ({ get: () => ({ empty: true }) }), add: () => {}, doc: () => ({ get: () => ({ exists: false }), set: () => {}, update: () => {}, delete: () => {} }) }) }; // Mock DB เพื่อกัน Crash
console.log("🔥 Firebase Admin SDK: ระบบพร้อมทำงานแล้ว!");

const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();

// --- 2. GLOBAL MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(cookieParser());
// ต้องถอยหลัง 1 ก้าวเพื่อออกไปหาโฟลเดอร์ client
app.use(express.static(path.join(__dirname, '../client')));

// --- RATE LIMITING ---
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { success: false, message: 'ทำรายการถี่เกินไป กรุณารอสักครู่' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// --- AI CONFIGURATION (Key Rotation System) ---
// อ่าน Key ทั้งหมดจาก .env (คั่นด้วย comma) หรือใช้ Key เดียวถ้ามีแค่อันเดียว
const apiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
let currentKeyIndex = 0;

console.log(`🤖 AI System Loaded: ${apiKeys.length} API Keys available.`);

async function generateWithRotation(prompt) {
    if (apiKeys.length === 0) throw new Error("ไม่พบ API Key ของ Gemini (กรุณาตั้งค่า GEMINI_API_KEYS)");

    let attempts = 0;
    // ลองวนจนครบทุกคีย์ที่มี (ป้องกัน Infinite Loop)
    while (attempts < apiKeys.length) {
        try {
            const apiKey = apiKeys[currentKeyIndex];
            const genAI = new GoogleGenerativeAI(apiKey);
            
            // 1. ลองใช้ gemini-1.5-flash ก่อน (เร็วและถูก)
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                console.log(`🤖 AI Request: Using 'gemini-1.5-flash' (Key Index: ${currentKeyIndex})...`);
                return await model.generateContent(prompt);
            } catch (modelError) {
                // ถ้าเป็น Error 429 (Quota) หรือ 403 (Permission) ให้ throw ไป catch ด้านล่างเพื่อเปลี่ยน Key
                if (modelError.message.includes("429") || modelError.message.toLowerCase().includes("quota") || modelError.message.includes("403")) {
                    throw modelError;
                }
                // ถ้าไม่ใช่ Quota (เช่น Model หาไม่เจอ) ให้ลอง Fallback ไป gemini-pro (ใช้ Key เดิม)
                console.warn(`⚠️ Model Error, switching to 'gemini-pro'...`);
                const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
                return await modelPro.generateContent(prompt);
            }

        } catch (error) {
            // จับ Error ระดับ Key (Quota Exceeded / Permission Denied)
            if (error.message.includes("429") || error.message.toLowerCase().includes("quota") || error.message.includes("403")) {
                console.warn(`⚠️ Key [${currentKeyIndex}] ใช้งานไม่ได้/โควต้าเต็ม! กำลังสลับ Key ถัดไป...`);
                currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length; // วนไป Key ถัดไป
                attempts++;
            } else {
                // Error อื่นๆ ที่เปลี่ยน Key ก็ไม่หาย (เช่น Prompt ผิด)
                throw error;
            }
        }
    }

    // ถ้าวนลูปครบแล้วยังไม่ได้ผล (Key พังหมด)
    const message = `🚨 CRITICAL: ระบบ AI ล่ม! ทุก API Key ของ Gemini โควต้าเต็มหรือใช้งานไม่ได้ กรุณาเพิ่ม Key ใหม่ทันที`;
    console.error(message);
    
    if (process.env.LINE_NOTIFY_TOKEN) {
        try {
            await axios.post('https://notify-api.line.me/api/notify', 
                new URLSearchParams({ message }), 
                { headers: { 'Authorization': `Bearer ${process.env.LINE_NOTIFY_TOKEN}` } }
            );
        } catch (e) { console.error("Line Notify Error:", e.message); }
    }

    throw new Error("ทุก API Key โควต้าเต็มหรือใช้งานไม่ได้ กรุณาลองใหม่ภายหลัง");
}

// --- 3. AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        req.user = user;
        next();
    });
};

const authorizeAdmin = (req, res, next) => {
    // กำหนดให้เมลนี้เป็นแอดมินคนเดียวที่มีสิทธิ์แก้ไขข้อมูล
    const allowedAdmin = 'duy.kan1234@gmail.com';

    if (req.user && req.user.role === 'admin') {
        if (req.user.user.toLowerCase() !== allowedAdmin.toLowerCase()) {
            return res.status(403).json({ success: false, message: 'Access Denied: คุณไม่ใช่เจ้าของระบบตัวจริง' });
        }
        return next();
    }
    return res.status(403).json({ success: false, message: 'เฉพาะแอดมินเท่านั้น' });
};

// --- 4. API ROUTER ---
const apiRouter = express.Router();

// [HEALTH CHECK]
apiRouter.get('/health', (req, res) => {
    res.json({
        success: true,
        server: 'Online',
        database: 'Firestore Connected',
        uptime: process.uptime(),
        timestamp: new Date()
    });
});

// [LOGIN]
apiRouter.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูล' });

        const userSnapshot = await db.collection('users').where('username', '==', username.toLowerCase()).get();
        if (userSnapshot.empty) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

        let finalRole = userData.role;
        // บังคับให้เฉพาะเมลนี้เท่านั้นที่เป็น Admin ได้ (คนอื่นแม้ใน DB เป็น admin ก็จะถูกลดสิทธิ์ตอน Login)
        const superAdminEmail = 'duy.kan1234@gmail.com';
        if (finalRole === 'admin' && userData.username.toLowerCase() !== superAdminEmail.toLowerCase()) {
            finalRole = 'user';
        }

        const payload = { id: userDoc.id, user: userData.username, role: finalRole };
        // Access Token อายุสั้น (เช่น 15 นาที)
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

        // Refresh Token (Rotation Logic)
        const refreshToken = jwt.sign({ id: userDoc.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        // เก็บ Refresh Token ลง DB
        await db.collection('refreshTokens').add({
            token: refreshToken,
            userId: userDoc.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 วัน
        });

        // ส่ง Refresh Token ผ่าน HttpOnly Cookie
        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' });

        res.json({ 
            success: true, 
            accessToken: token, 
            role: finalRole,
            username: userData.username,
            vipExpiresAt: userData.vipExpiresAt ? userData.vipExpiresAt.toDate() : null
        });
    } catch (error) {
        console.error("❌ Login Error:", error); // เพิ่มบรรทัดนี้เพื่อให้เห็น Error ใน Vercel Logs
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
});

// [REFRESH TOKEN ROTATION]
apiRouter.post('/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No Refresh Token' });

    try {
        // 1. ตรวจสอบ Token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // 2. เช็คใน DB ว่ามี Token นี้จริงไหม (และยังไม่ถูกใช้/ลบ)
        const snapshot = await db.collection('refreshTokens').where('token', '==', refreshToken).get();
        
        if (snapshot.empty) {
            // ถ้าตรวจสอบผ่านแต่ไม่เจอใน DB แสดงว่า Token นี้ถูกใช้ไปแล้ว หรือเป็นของปลอม (Security Alert!)
            return res.status(403).json({ success: false, message: 'Token ถูกใช้งานไปแล้ว (Reuse Detected)' });
        }

        const oldTokenDoc = snapshot.docs[0];
        const userId = oldTokenDoc.data().userId;

        // 3. ROTATION: ลบ Token เก่าทิ้งทันที
        await oldTokenDoc.ref.delete();

        // 4. สร้าง Token ชุดใหม่
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        let currentRole = userData.role;
        // [VIP CHECK] ตรวจสอบวันหมดอายุตอน Refresh
        if (currentRole === 'vip' && userData.vipExpiresAt) {
            const now = new Date();
            const expiresAt = userData.vipExpiresAt.toDate();
            if (now > expiresAt) {
                currentRole = 'user';
                await db.collection('users').doc(userId).update({ role: 'user' });
            }
        }
        
        const newAccessToken = jwt.sign(
            { id: userId, user: userData.username, role: currentRole }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        );
        
        const newRefreshToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // 5. เก็บ Token ใหม่ลง DB
        await db.collection('refreshTokens').add({
            token: newRefreshToken,
            userId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        // 6. ส่งกลับ
        res.cookie('refreshToken', newRefreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
        res.json({ success: true, accessToken: newAccessToken });

    } catch (err) {
        res.status(403).json({ success: false, message: 'Invalid Refresh Token' });
    }
});

// [LOGOUT]
apiRouter.post('/logout', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        // ลบออกจาก DB
        const snapshot = await db.collection('refreshTokens').where('token', '==', refreshToken).get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.delete();
        }
    }
    res.clearCookie('refreshToken');
    res.json({ success: true });
});

// [REGISTER]
apiRouter.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (password.length < 6) return res.status(400).json({ success: false, message: 'รหัสผ่านสั้นเกินไป' });

        const existingUser = await db.collection('users').where('username', '==', username.toLowerCase()).get();
        if (!existingUser.empty) return res.status(409).json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.collection('users').add({
            username: username.toLowerCase(),
            password: hashedPassword,
            role: 'user',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({ success: true, message: 'ลงทะเบียนสำเร็จ' });
    } catch (error) {
        console.error("❌ Register Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// [MOVIES CRUD]
apiRouter.get('/movies', async (req, res) => {
    try {
        const snapshot = await db.collection('series').orderBy('createdAt', 'desc').get();
        const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: movies });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.post('/movies', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const movieData = { 
            ...req.body, 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        };
        const docRef = await db.collection('series').add(movieData);
        res.status(201).json({ success: true, id: docRef.id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.put('/movies/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await db.collection('series').doc(req.params.id).update(req.body);
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.delete('/movies/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await db.collection('series').doc(req.params.id).delete();
        res.json({ success: true, message: 'ลบสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// [USER MANAGEMENT] - เพิ่มส่วนนี้เพื่อให้แอดมินจัดการสมาชิกได้
apiRouter.get('/users', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            delete data.password; // ปิดบังรหัสผ่าน
            return { _id: doc.id, ...data };
        });
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.put('/users/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        
        // ป้องกันการแก้ไขตัวเอง (Super Admin)
        if (req.params.id === req.user.id) {
             return res.status(400).json({ success: false, message: 'ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้' });
        }

        // ป้องกันการตั้งคนอื่นเป็น Admin (ตามที่คุณขอ: ให้มีเจ้าของคนเดียว)
        if (role === 'admin') {
             return res.status(400).json({ success: false, message: 'ระบบจำกัดให้มี Admin เพียงคนเดียว (เจ้าของ)' });
        }

        await db.collection('users').doc(req.params.id).update({ role });
        res.json({ success: true, message: 'อัปเดตสิทธิ์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.delete('/users/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ success: false, message: 'ไม่สามารถลบตัวเองได้' });
        }
        await db.collection('users').doc(req.params.id).delete();
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// [AI FETCH] - Gemini Logic
apiRouter.post('/fetch-movie-data', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { videoId } = req.body;
        const infoRes = await axios.get(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const videoTitle = infoRes.data.title;

        const prompt = `วิเคราะห์ชื่อคลิป YouTube: "${videoTitle}" สรุปเป็น JSON (ห้ามมี Markdown): { "title": "ชื่อเรื่อง", "year": ปี, "rating": คะแนน, "description": "เรื่องย่อ", "actors": "นักแสดง", "lessons": "ข้อคิด", "category": "china/inter/anime" }`;

        // เรียกใช้ฟังก์ชัน Rotation แทนโค้ดเดิม
        const result = await generateWithRotation(prompt);
        let text = result.response.text().replace(/```json|```/g, "").trim();
        const aiData = JSON.parse(text);

        res.json({ success: true, data: { ...aiData, ytId: videoId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'AI Error: ' + err.message });
    }
});

// [ANNOUNCEMENT]
apiRouter.get('/announcement', async (req, res) => {
    try {
        const doc = await db.collection('settings').doc('announcement').get();
        res.json({ success: true, data: doc.exists ? doc.data() : { text: '', isActive: false } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.post('/announcement', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await db.collection('settings').doc('announcement').set({
            ...req.body,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true, message: 'อัปเดตประกาศสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.use('/api', apiRouter);

// --- CRON JOBS (Vercel Cron) ---
// Endpoint นี้จะถูกเรียกโดย Vercel ตามเวลาที่ตั้งไว้ใน vercel.json
apiRouter.get('/cron/cleanup', async (req, res) => {
    // Security Check: ตรวจสอบว่าเรียกมาจาก Vercel จริงหรือไม่
    // (แนะนำให้ตั้ง Environment Variable ชื่อ CRON_SECRET ใน Vercel Dashboard)
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('🧹 Running Cron Job: Cleaning expired refresh tokens...');
    try {
        const now = new Date();
        // Query หา Token ที่ expiresAt น้อยกว่าเวลาปัจจุบัน
        const snapshot = await db.collection('refreshTokens').where('expiresAt', '<', now).get();
        
        if (snapshot.empty) {
            console.log('✅ No expired tokens found.');
            return res.json({ success: true, message: 'No expired tokens found.' });
        }

        // ใช้ Batch Delete (Firestore จำกัด Batch ละ 500 operations)
        let batch = db.batch();
        let count = 0;
        let totalDeleted = 0;

        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            if (count >= 400) { // Commit ทุกๆ 400 รายการเพื่อความปลอดภัย
                await batch.commit();
                batch = db.batch();
                totalDeleted += count;
                count = 0;
            }
        }
        if (count > 0) {
            await batch.commit();
            totalDeleted += count;
        }
        console.log(`🗑️ Deleted ${totalDeleted} expired tokens.`);
        res.json({ success: true, deleted: totalDeleted });
    } catch (err) {
        console.error('❌ Cron Job Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// [CRON JOB: Daily Summary to Line Notify]
// สรุปยอดผู้ใช้งานใหม่ในรอบ 24 ชม. ส่งเข้า Line
apiRouter.get('/cron/daily-summary', async (req, res) => {
    // Security Check
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        // 1. กำหนดช่วงเวลา (ย้อนหลัง 24 ชม.)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // 2. Query Firestore หา user ที่สมัครใหม่
        const newUsersSnapshot = await db.collection('users')
            .where('createdAt', '>=', yesterday)
            .get();
        
        const newUsersCount = newUsersSnapshot.size;
        
        // 3. นับยอดรวมทั้งหมด (ใช้ count() เพื่อประหยัด read quota)
        const totalUsersSnapshot = await db.collection('users').count().get();
        const totalUsers = totalUsersSnapshot.data().count;

        // 4. ส่งเข้า Line Notify
        const lineToken = process.env.LINE_NOTIFY_TOKEN;
        if (lineToken) {
            const message = `\n📊 สรุปยอดประจำวัน\n📅 วันที่: ${new Date().toLocaleDateString('th-TH')}\n👤 ผู้ใช้งานใหม่: ${newUsersCount} คน\n👥 ผู้ใช้งานทั้งหมด: ${totalUsers} คน`;
            
            await axios.post('https://notify-api.line.me/api/notify', 
                new URLSearchParams({ message }), 
                { headers: { 'Authorization': `Bearer ${lineToken}` } }
            );
            console.log('✅ Line Notification sent.');
        } else {
            console.log('⚠️ No LINE_NOTIFY_TOKEN found.');
        }

        res.json({ success: true, newUsers: newUsersCount, totalUsers });
    } catch (err) {
        console.error('❌ Daily Summary Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// [CRON JOB: Weekly Backup to Email]
// สำรองฐานข้อมูลและส่งเข้า Email ทุกสัปดาห์
apiRouter.get('/cron/backup-email', async (req, res) => {
    // Security Check
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        // 1. ดึงข้อมูลจากทุก Collection ที่สำคัญ
        const collections = ['users', 'series', 'settings']; // เพิ่ม collection อื่นๆ ได้ที่นี่
        const backupData = { timestamp: new Date().toISOString() };

        for (const colName of collections) {
            const snapshot = await db.collection(colName).get();
            backupData[colName] = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        }

        const backupJSON = JSON.stringify(backupData, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];

        // 2. ตั้งค่า Nodemailer (ต้องเพิ่ม EMAIL_USER และ EMAIL_PASS ใน .env)
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error('Email credentials not found in .env');
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail', // หรือใช้ host/port ของผู้ให้บริการอื่น
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // สำหรับ Gmail ต้องใช้ App Password
            }
        });

        // 3. ส่ง Email พร้อมไฟล์แนบ
        await transporter.sendMail({
            from: `"DUYDODEE Backup" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER, // ส่งหาตัวเองหรือ Admin
            subject: `📦 Database Backup - ${dateStr}`,
            text: `ระบบทำการสำรองข้อมูลประจำสัปดาห์เรียบร้อยแล้ว (วันที่ ${dateStr})`,
            attachments: [
                {
                    filename: `backup-${dateStr}.json`,
                    content: backupJSON,
                    contentType: 'application/json'
                }
            ]
        });

        console.log('✅ Backup email sent.');
        res.json({ success: true, message: 'Backup sent to email' });
    } catch (err) {
        console.error('❌ Backup Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 5. START SERVER ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 DUYDODEE 4K Firebase Server: http://localhost:${PORT}`);
});
module.exports = app;