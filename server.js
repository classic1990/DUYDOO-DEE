const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();

// --- 1. FIREBASE ADMIN SETUP ---
let serviceAccount;
try {
    // 1.1 ลองอ่านจาก Environment Variable (สำหรับ Vercel/Production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("☁️ Loaded Firebase Key from Env Var!");
    } else {
        // 1.2 ถ้าไม่มี ให้ลองอ่านจากไฟล์ (สำหรับ Localhost)
        const keyPath = path.join(__dirname, "backend-api", "Movie-Streaming.js"); 
        if (fs.existsSync(keyPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
            console.log("📄 Loaded Firebase Key from File!");
        }
    }
} catch (error) { console.error("❌ Firebase Key Error:", error.message); }

if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("🔥 Firebase Connected!");
}
const db = admin.apps.length ? admin.firestore() : null;

// --- 2. BASIC MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// --- 3. PATH SETUP ---
let appPath = path.join(__dirname, "client");
if (!fs.existsSync(appPath)) appPath = path.join(__dirname, "app");

// --- 4. SECURITY & AUTH SETTINGS ---
const JWT_SECRET = process.env.JWT_SECRET || 'duydodee-super-secret-key-2026';
const OWNER_EMAIL = "YOUR_EMAIL@gmail.com"; // 👈 เปลี่ยนเป็นอีเมลของคุณตรงนี้

// 🛡️ Middleware ตรวจสอบสิทธิ์ (ฉบับแก้ไข)
const authenticate = (req, res, next) => {
    // 1. ยกเว้นหน้าล็อกอินและหน้าแรก ไม่ต้องเช็ค Token
    const publicPaths = ['/login.html', '/index.html', '/', '/api/login-google'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/assets/')) {
        return next();
    }

    const token = req.cookies.token;
    if (!token) {
        // ถ้าไม่มี Token ให้ดีดไปหน้าล็อกอิน
        return res.redirect('/login.html');
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.redirect('/login.html');
        req.user = user; // เก็บข้อมูล user ไว้ใช้ต่อ
        next();
    });
};

const requireOwner = (req, res, next) => {
    if (req.user && req.user.email === OWNER_EMAIL) {
        next();
    } else {
        res.status(403).json({ success: false, message: "⛔ Admin Only" });
    }
};

// --- 5. ROUTES & API ---

// ✅ API Login (ต้องอยู่ก่อน Middleware ที่เช็ค Token)
app.post("/api/login-google", async (req, res) => {
    const { token } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        if (decodedToken.email !== OWNER_EMAIL) {
            return res.status(403).json({ success: false, message: "⛔ เฉพาะเจ้าของเว็บเท่านั้น" });
        }
        const accessToken = jwt.sign({ email: decodedToken.email, role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', accessToken, { httpOnly: true, maxAge: 86400000 });
        res.json({ success: true, redirect: "/admin" });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

// 🔒 ใช้ระบบป้องกันกับทุก Route ด้านล่างนี้
app.use(authenticate);

// 🔒 เข้าหน้า Admin (ต้องล็อกอินก่อนถึงจะมาถึงตรงนี้)
app.get("/admin", requireOwner, (req, res) => {
    res.sendFile(path.join(appPath, "admin.html"));
});

// ✅ API จัดการหนัง
const api = express.Router();
api.get("/movies", async (req, res) => {
    const snapshot = await db.collection("movies").orderBy("createdAt", "desc").get();
    res.json({ success: true, data: snapshot.docs.map(d => ({ _id: d.id, ...d.data() })) });
});
api.post("/movies", requireOwner, async (req, res) => {
    await db.collection("movies").add({ ...req.body, createdAt: new Date() });
    res.json({ success: true });
});

// 🤖 API AI Generator (รวมโค้ดจาก Port 4000 มาไว้ที่นี่)
api.post("/ai/generate-summary", async (req, res) => {
    try {
        const { title: videoUrl } = req.body;
        
        // 1. ดึงชื่อคลิปจาก YouTube oEmbed
        const ytResponse = await fetch(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`);
        if (!ytResponse.ok) throw new Error("หาคลิป YouTube ไม่เจอครับ (ตรวจสอบลิงก์อีกครั้ง)");
        const ytData = await ytResponse.json();
        const videoTitle = ytData.title;

        // 2. เรียกใช้ Google Gemini API
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("Server ไม่พบ GEMINI_API_KEY ในการตั้งค่า");

        const prompt = `Analyze the movie/series title: "${videoTitle}".
        Respond with a raw JSON object (no markdown) containing:
        1. "summary": A short, engaging summary in Thai (3-4 lines).
        2. "tags": A string of 3-5 relevant hashtags (e.g., "#Action #Drama").
        3. "category": One of ["china", "inter", "anime"]. Logic: Chinese series/Wuxia -> "china", Anime/Cartoon/Donghua -> "anime", Western/Thai/Korean/Others -> "inter".
        4. "rating": A number between 7.0 and 9.9 (e.g. 8.5) representing a simulated viewer rating based on popularity.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!geminiRes.ok) throw new Error("Gemini API Error: " + geminiRes.statusText);
        const geminiData = await geminiRes.json();
        const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // Clean up markdown if present (e.g. ```json ... ```)
        const jsonText = textResponse.replace(/```json|```/g, '').trim();
        
        let aiData;
        try {
            aiData = JSON.parse(jsonText);
        } catch (e) {
            // Fallback if AI didn't return valid JSON
            aiData = { summary: textResponse, tags: "", category: "inter", rating: 8.0 };
        }

        res.json(aiData);
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ summary: "ไม่สามารถดึงข้อมูลได้: " + error.message });
    }
});

app.use("/api", api);

// 📁 เสิร์ฟไฟล์หน้าเว็บ (ย้ายมาไว้ตรงนี้เพื่อให้ระบบป้องกันข้างบนทำงานก่อน)
app.use(express.static(appPath));

app.get("*", (req, res) => {
    res.sendFile(path.join(appPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
// ถ้าเป็นการรันในเครื่อง (Local) ให้สั่ง listen
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 DUYDODEE Server on: http://localhost:${PORT}`);
    });
}

// ส่งออก app เพื่อให้ Vercel นำไปรันเป็น Serverless Function
module.exports = app;