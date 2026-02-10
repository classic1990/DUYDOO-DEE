require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- SCHEMAS & MODELS ---

// 1. Movie Schema
const movieSchema = new mongoose.Schema({
    title: String,
    year: Number,
    rating: Number,
    episodes: Number,
    posterUrl: String,
    ytId: String,
    createdAt: { type: Date, default: Date.now }
});
const Movie = mongoose.model('Movie', movieSchema);

// 2. Admin Schema (สำหรับเก็บ User Admin ถ้าต้องการขยายในอนาคต)
// ในที่นี้เราจะใช้ Hardcode จาก .env เพื่อความง่ายก่อน

// --- AUTH MIDDLEWARE ---
// ฟังก์ชันตรวจสอบ Token สำหรับ Route ที่ต้องเป็น Admin เท่านั้น
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) return res.status(401).json({ message: 'Access Denied' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

// 1. Login Route (POST /api/login)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const invalidCredentials = { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };

    // 1. ตรวจสอบ Username
    if (username !== process.env.ADMIN_USERNAME) {
        return res.status(401).json(invalidCredentials);
    }

    // 2. เปรียบเทียบรหัสผ่านที่ส่งมากับ HASH ใน .env
    // สำคัญ: ADMIN_PASSWORD ใน .env ต้องเป็นรหัสผ่านที่ผ่านการ hash ด้วย bcrypt แล้ว
    const isMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD);

    if (isMatch) {
        // 3. ถ้าตรงกัน ก็สร้าง Token
        const user = { name: username, role: 'admin' };
        const accessToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1d' }); // Token หมดอายุใน 1 วัน

        res.json({
            success: true,
            accessToken: accessToken,
            user: user
        });
    } else {
        res.status(401).json(invalidCredentials);
    }
});

// 2. Public Routes (ใครก็ดูได้)
app.get('/api/movies', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        res.json({ success: true, data: movies });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/movies/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: movie });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Protected Routes (ต้อง Login ก่อนถึงจะทำได้)
// ใช้ middleware `authenticateToken` คั่นไว้

app.post('/api/movies', authenticateToken, async (req, res) => {
    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        const updatedMovie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedMovie) return res.status(404).json({ success: false, message: 'Movie not found' });
        res.json({ success: true, data: updatedMovie });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        const deletedMovie = await Movie.findByIdAndDelete(req.params.id);
        if (!deletedMovie) return res.status(404).json({ success: false, message: 'Movie not found' });
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});