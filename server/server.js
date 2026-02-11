const express = require('express');
const path = require('path');
// โหลด Config จากไฟล์ .env ที่อยู่ในโฟลเดอร์เดียวกับ server.js
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// --- 1. Middleware ---
app.use(cors());
app.use(express.json());
// ชี้ทางไปหาโฟลเดอร์หน้าบ้าน (Client)
app.use(express.static(path.join(__dirname, '../client')));

// --- 2. CONFIG AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log(`✅ MongoDB Connected to: ${mongoose.connection.name}`);
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`🚀 DUYDODEE 4K Server: http://localhost:${PORT}`);
        });
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- 4. SCHEMAS & MODELS ---

// ตารางหนังและซีรีส์ (รองรับระบบเลือกตอน)
const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    year: { type: Number, default: 2026 },
    rating: { type: Number, default: 0.0 },
    description: String,
    actors: String,
    lessons: String,
    category: { type: String, enum: ['china', 'inter', 'anime'], default: 'china' },
    posterUrl: String,
    ytId: { type: String, required: true }, // YouTube ID หลัก
    
    totalEpisodes: { type: Number, default: 1 }, // เพิ่มฟิลด์นี้เพื่อรับค่าจำนวนตอนจากหน้าเว็บ
    // ระบบซีรีส์ (Episodes)
    episodes: [{
        epTitle: String, // เช่น "ตอนที่ 1"
        ytId: String     // YouTube ID ของตอนนั้นๆ
    }],
    
    isHero: { type: Boolean, default: false },     // แสดงบนสไลด์ใหญ่
    isTrending: { type: Boolean, default: false }, // แสดงในมาแรง
    createdAt: { type: Date, default: Date.now }
});

// ตารางคอมเมนต์ (เชื่อมกับก้อน EIEI_HD)
const commentSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Movie = mongoose.model('Movie', movieSchema);
const Comment = mongoose.model('Comment', commentSchema);

// --- 5. AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'เซสชั่นหมดอายุ' });
        req.user = user;
        next();
    });
};

// --- 6. API ROUTES ---

// [LOGIN]
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    // ตรวจสอบ Username และ Password จาก .env
    const isMatch = (username === process.env.ADMIN_USERNAME) && 
                    (password === process.env.ADMIN_PASSWORD || await bcrypt.compare(password, process.env.ADMIN_PASSWORD).catch(() => false));

    if (isMatch) {
        const token = jwt.sign({ user: username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, accessToken: token });
    } else {
        res.status(401).json({ success: false, message: 'รหัสผ่านผิดพลาด' });
    }
});

// [AI FETCH] ดึงข้อมูลจาก YouTube และสรุปด้วย Gemini
app.post('/api/fetch-movie-data', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        const ytKey = process.env.YOUTUBE_API_KEY;
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${ytKey}`;
        const ytRes = await axios.get(ytUrl);
        
        if (!ytRes.data.items?.length) return res.status(404).json({ success: false, message: 'ไม่พบวิดีโอ' });

        const snippet = ytRes.data.items[0].snippet;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `สรุปข้อมูลหนังจาก: "${snippet.title}" รายละเอียด: "${snippet.description}" 
                        ตอบเป็น JSON เท่านั้น: { "title": "ชื่อไทย", "year": 20XX, "rating": 9.0, "description": "เรื่องย่อ", "actors": "ชื่อนักแสดง", "lessons": "ข้อคิด" }`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const aiData = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

        res.json({
            success: true,
            data: { ...aiData, posterUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, ytId: videoId }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'AI/YouTube API Error' });
    }
});

// [MOVIES CRUD]
app.get('/api/movies', async (req, res) => {
    const movies = await Movie.find().sort({ createdAt: -1 });
    res.json({ success: true, data: movies });
});

app.post('/api/movies', authenticateToken, async (req, res) => {
    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        res.status(400).json({ success: false, message: 'บันทึกไม่สำเร็จ' });
    }
});

app.put('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        // new: true เพื่อให้ส่งข้อมูลล่าสุดกลับไป
        const updatedMovie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: updatedMovie });
    } catch (err) {
        res.status(400).json({ success: false, message: 'แก้ไขไม่สำเร็จ' });
    }
});

app.delete('/api/movies/:id', authenticateToken, async (req, res) => {
    await Movie.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'ลบเรียบร้อย' });
});

// [COMMENTS]
app.get('/api/comments/:movieId', async (req, res) => {
    const comments = await Comment.find({ movieId: req.params.movieId }).sort({ createdAt: -1 });
    res.json({ success: true, data: comments });
});

app.post('/api/comments', async (req, res) => {
    try {
        const newComment = new Comment(req.body);
        await newComment.save();
        res.status(201).json({ success: true, data: newComment });
    } catch (err) {
        res.status(400).json({ success: false, message: 'คอมเมนต์ไม่สำเร็จ' });
    }
});

// --- 7. SPA FALLBACK ---
// ถ้าเปิดหน้าเว็บอื่นๆ ที่ไม่ใช่ API ให้ส่ง index.html กลับไป
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});