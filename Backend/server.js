require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- CONFIG AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        // ย้ายการ Start Server มาไว้ตรงนี้ เพื่อให้มั่นใจว่า DB พร้อมก่อนรับ Request
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`🚀 Admin Server Safe & Running on port ${PORT}`));
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        
        if (process.env.MONGO_URI.includes('localhost') || process.env.MONGO_URI.includes('127.0.0.1')) {
            console.log('\n💡 คำแนะนำ: คุณกำลังใช้ฐานข้อมูลในเครื่อง (Localhost)');
            console.log('👉 วิธีแก้: ตรวจสอบว่าโปรแกรม MongoDB Compass เปิดอยู่ หรือ MongoDB Service รันอยู่หรือไม่\n');
        } else if (err.code === 'ECONNREFUSED' && err.syscall === 'querySrv') {
            console.log('\n💡 คำแนะนำ: เน็ตของคุณบล็อกการเชื่อมต่อแบบ SRV (mongodb+srv://)');
            console.log('👉 วิธีแก้: ให้ไปที่ MongoDB Atlas > Connect > Drivers > เลือก Node.js เวอร์ชั่น 2.2.12 เพื่อเอาลิงก์แบบ Standard (mongodb://...) มาใส่ใน .env แทนครับ\n');
        } else if (err.name === 'MongoNetworkError' && (err.message.includes('ECONNREFUSED') || err.message.includes('timed out'))) {
            console.log('\n💡 คำแนะนำ: เน็ตบ้านของคุณอาจบล็อกพอร์ต 27017 (Port Blocking)');
            console.log('👉 วิธีแก้: ให้ลองโหลดโปรแกรม VPN (เช่น Cloudflare WARP 1.1.1.1) มาเปิดใช้งาน แล้วรันใหม่ครับ\n');
        }
    });

// --- SCHEMAS & MODELS ---
const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    year: Number,
    rating: Number,
    description: String,
    category: { type: String, default: 'china' }, // เพิ่มหมวดหมู่เพื่อรองรับหน้า Admin
    posterUrl: String,
    ytId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Movie = mongoose.model('Movie', movieSchema);

// --- AUTH MIDDLEWARE (ตรวจสอบสิทธิ์แอดมิน) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'เซสชั่นหมดอายุ กรุณาล็อกอินใหม่' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

/**
 * 1. AI Fetch Route: ดึงข้อมูลและสรุปเนื้อหา
 * ปรับปรุง: เพิ่มการดักจับ Error กรณี AI ส่ง JSON ผิดรูปแบบ
 */
app.post('/api/fetch-movie-data', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        const ytKey = process.env.YOUTUBE_API_KEY;
        
        if (!ytKey) return res.status(500).json({ success: false, message: 'ไม่พบ YOUTUBE_API_KEY ในไฟล์ .env' });
        if (!process.env.GEMINI_API_KEY) return res.status(500).json({ success: false, message: 'ไม่พบ GEMINI_API_KEY ในไฟล์ .env' });

        if (!videoId) return res.status(400).json({ success: false, message: 'ต้องการ videoId' });

        // A. ดึงข้อมูลจาก YouTube
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${ytKey}`;
        const ytRes = await axios.get(ytUrl);
        
        if (!ytRes.data.items || ytRes.data.items.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบวิดีโอนี้ใน YouTube' });
        }

        const snippet = ytRes.data.items[0].snippet;

        // B. ใช้ Gemini AI วิเคราะห์
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `วิเคราะห์ข้อมูลวิดีโอนี้: "${snippet.title}" 
        รายละเอียด: "${snippet.description}"
        ตอบกลับเป็น JSON เท่านั้น ห้ามมีคำอธิบายอื่น:
        {
          "title": "ชื่อหนังภาษาไทย",
          "year": 20XX,
          "rating": 8.5,
          "description": "เรื่องย่อสั้นๆ 2-3 บรรทัด"
        }`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // ล้าง Markdown Code Blocks ออกถ้ามี
        const cleanedJson = responseText.replace(/```json|```/g, "").trim();
        let aiData;
        try {
            aiData = JSON.parse(cleanedJson);
        } catch (e) {
            throw new Error("AI ประมวลผล JSON ผิดพลาด");
        }

        res.json({
            success: true,
            data: {
                ...aiData,
                posterUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                ytId: videoId
            }
        });

    } catch (err) {
        console.error("❌ AI/API Error:", err.message);
        
        let msg = 'ไม่สามารถดึงข้อมูลอัตโนมัติได้';
        if (err.response && err.response.data) {
            console.error("📌 External API Details:", JSON.stringify(err.response.data, null, 2));
            if (err.response.data.error && err.response.data.error.message) msg += `: ${err.response.data.error.message}`;
        } else if (err.message) msg += `: ${err.message}`;

        res.status(500).json({ success: false, message: msg });
    }
});

/**
 * 2. Login Route
 * ข้อแนะนำ: ค่า ADMIN_PASSWORD ใน .env ควรเป็น Hash ที่สร้างจาก bcrypt
 */
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // เช็ค Username
    if (username !== process.env.ADMIN_USERNAME) {
        return res.status(401).json({ success: false, message: 'สิทธิ์ไม่ถูกต้อง' });
    }

    // เช็ค Password (เปรียบเทียบกับ Hash ใน .env)
    let isMatch = false;
    if (password === process.env.ADMIN_PASSWORD) {
        isMatch = true; // ตรงกันแบบตัวอักษรธรรมดา (Plain text)
    } else {
        isMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD).catch(() => false); // ลองเทียบแบบ Hash
    }

    if (isMatch) {
        const token = jwt.sign({ user: username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, accessToken: token });
    } else {
        res.status(401).json({ success: false, message: 'รหัสผ่านผิด' });
    }
});

/**
 * 3. Movie Management (CRUD) - ป้องกันด้วย authenticateToken
 */

// ดึงหนังทั้งหมด (Public)
app.get('/api/movies', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        res.json({ success: true, data: movies });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// เพิ่มหนัง (Admin Only)
app.post('/api/movies', authenticateToken, async (req, res) => {
    try {
        // 1. ตรวจสอบว่ามีหนังเรื่องนี้อยู่แล้วหรือไม่ (เช็คจาก ytId)
        const { ytId } = req.body;
        const existingMovie = await Movie.findOne({ ytId });
        if (existingMovie) {
            return res.status(400).json({ success: false, message: 'มีหนังเรื่องนี้ในระบบแล้ว (Duplicate ytId)' });
        }

        // 2. บันทึกหนังใหม่
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        console.error("Error saving movie:", err);
        res.status(400).json({ success: false, message: 'ไม่สามารถบันทึกข้อมูลได้: ' + err.message });
    }
});

// ลบหนัง (Admin Only)
app.delete('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        await Movie.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'ลบข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// แก้ไขหนัง (Admin Only)
app.put('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        const updated = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});