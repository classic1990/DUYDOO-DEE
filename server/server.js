const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();

// Config
const PORT = 3000;
const JWT_SECRET = 'YOUR_SECRET_KEY_HERE'; // ควรเก็บใน .env
const MONGODB_URI = 'mongodb://localhost:27017/duydodee';

// Middleware
app.use(express.json());
app.use(cors());

// Database Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(err));

// --- 1. สร้าง Model สำหรับเก็บ Log ---
const loginLogSchema = new mongoose.Schema({
    username: String,
    role: String,
    ip: String,
    userAgent: String,
    status: { type: String, enum: ['success', 'failed'] },
    timestamp: { type: Date, default: Date.now }
});

const LoginLog = mongoose.model('LoginLog', loginLogSchema);

// --- 2. Middleware ตรวจสอบ Token ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ success: false, message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- 3. API: ดึงข้อมูล Login Logs (สำหรับหน้า logs.html) ---
app.get('/api/login-logs', authenticateToken, async (req, res) => {
    try {
        // ตรวจสอบสิทธิ์ว่าเป็น Admin หรือไม่ (Optional)
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Count total logs
        const totalLogs = await LoginLog.countDocuments();
        const totalPages = Math.ceil(totalLogs / limit);

        // ดึงข้อมูลตาม page
        const logs = await LoginLog.find()
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);

        res.json({ success: true, data: logs, pagination: { currentPage: page, totalPages, totalLogs } });
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- 4. ตัวอย่าง API Login (เพื่อให้เห็นภาพการบันทึก Log) ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // ดึง IP และ User Agent
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // จำลองการตรวจสอบ User (ในระบบจริงต้องเช็คจาก Database)
    // สมมติ: admin / password1234
    if (username === 'admin' && password === 'password1234') {
        const userRole = 'admin';

        // บันทึก Log: สำเร็จ
        await LoginLog.create({
            username,
            role: userRole,
            ip,
            userAgent,
            status: 'success'
        });

        // สร้าง Token
        const token = jwt.sign({ username, role: userRole }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ accessToken: token, role: userRole });

    } else {
        // บันทึก Log: ล้มเหลว
        await LoginLog.create({
            username: username || 'unknown',
            role: 'guest',
            ip,
            userAgent,
            status: 'failed'
        });

        res.status(401).json({ message: 'Username or Password incorrect' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));