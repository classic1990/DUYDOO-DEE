const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimit = require('express-rate-limit');

const app = express();

// --- 1. GLOBAL MIDDLEWARE ---
app.use(cors());
app.use(express.json());
// ส่งไฟล์จากโฟลเดอร์ client (หน้าบ้าน) ออกไป
app.use(express.static(path.join(__dirname, '../client')));
// Trust the first proxy, which is important for rate limiting to work correctly
// when the app is behind a reverse proxy (like Nginx or a cloud load balancer).
app.set('trust proxy', 1);

// --- 2. CONFIGURATIONS ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Rate Limiting Policies
const authLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 10, // Limit each IP to 10 login/register requests per window (per hour)
	message: { success: false, message: 'มีการพยายามเข้าสู่ระบบจาก IP นี้มากเกินไป กรุณาลองใหม่ในอีก 1 ชั่วโมง' },
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per window (per 15 minutes)
	message: { success: false, message: 'มีการเรียกใช้งาน API จาก IP นี้มากเกินไป กรุณาลองใหม่ในอีก 15 นาที' },
	standardHeaders: true,
	legacyHeaders: false,
});

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log(`✅ MongoDB Connected to: ${mongoose.connection.name}`);
        // Seed admin user after connection
        seedAdminUser();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- 4. SCHEMAS & MODELS ---

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'vip', 'user'], default: 'user' },
    passwordResetToken: String,
    passwordResetExpires: Date,
});

// Middleware to hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Method to generate password reset token
userSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
};

const User = mongoose.model('User', userSchema);

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    year: { type: Number, default: 2026 },
    rating: { type: Number, default: 0.0 },
    description: String,
    actors: String,
    lessons: String,
    category: { type: String, default: 'china' },
    posterUrl: String,
    ytId: { type: String, required: true }, 
    totalEpisodes: { type: Number, default: 1 },
    isVip: { type: Boolean, default: false }, // รองรับสถานะ VIP
    episodes: [{
        epTitle: String,
        ytId: String
    }],
    createdAt: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// บังคับให้ใช้คอลเลกชันชื่อ 'series' ตามที่มีข้อมูลจริง
const Movie = mongoose.model('Movie', movieSchema, 'series'); 
const Comment = mongoose.model('Comment', commentSchema);

// --- 5. AUTHENTICATION MIDDLEWARE ---
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
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'เฉพาะแอดมินเท่านั้น' });
};

// --- 6. API ROUTER ---
const apiRouter = express.Router();

// [LOGIN] สำหรับ Admin และ VIP
apiRouter.post('/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        // 1. Find user in database
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        // 2. Compare password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        // 3. Create JWT
        const payload = {
            id: user._id,
            user: user.username,
            role: user.role
        };
        const expiresIn = user.role === 'admin' ? '1d' : '7d';
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

        return res.json({ success: true, accessToken: token, role: user.role });
    } catch (error) {
        console.error('Login Error:', error); // Log error ไว้สำหรับนักพัฒนา
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
});

// [REGISTER] สำหรับผู้ใช้ทั่วไป
apiRouter.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
        }

        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        }

        const newUser = new User({
            username: username,
            password: password, // Hashing is handled by the pre-save hook
        });

        await newUser.save();
        res.status(201).json({ success: true, message: 'ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ' });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
    }
});

// [FORGOT PASSWORD]
apiRouter.post('/forgot-password', async (req, res) => {
    try {
        // 1) Get user based on POSTed username
        const user = await User.findOne({ username: req.body.username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบชื่อผู้ใช้ในระบบ' });
        }

        // 2) Generate the random reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // 3) Send it to user's email
        // Note: In a real app, user schema should have an email field. We use username as a placeholder.
        const resetURL = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;

        const message = `
            คุณได้รับอีเมลนี้เนื่องจากคุณ (หรือใครบางคน) ได้ร้องขอการรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ
            กรุณาคลิกลิงก์ต่อไปนี้เพื่อตั้งรหัสผ่านใหม่: ${resetURL}
            ลิงก์นี้จะหมดอายุใน 10 นาที
            หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาเพิกเฉยอีเมลนี้
        `;

        await transporter.sendMail({
            from: `"DUYDODEE 4K Support" <${process.env.EMAIL_FROM}>`,
            to: req.body.username, // This should be user.email in a real app
            subject: 'คำขอรีเซ็ตรหัสผ่าน (มีผล 10 นาที)',
            text: message,
        });

        res.status(200).json({ success: true, message: 'ลิงก์สำหรับรีเซ็ตรหัสผ่านได้ถูกส่งไปยังอีเมลของคุณแล้ว' });
    } catch (err) {
        // Invalidate token and expiry if something goes wrong
        if (user) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });
        }
        console.error('FORGOT PASSWORD ERROR:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งอีเมล' });
    }
});

// [RESET PASSWORD]
apiRouter.post('/reset-password/:token', async (req, res) => {
    try {
        // 1) Get user based on the token
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });

        // 2) If token has not expired, and there is user, set the new password
        if (!user) {
            return res.status(400).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' });
        }

        if (req.body.password.length < 6) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
        }

        user.password = req.body.password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // 3) Log the user in, send JWT
        // (This part is optional, but good UX)
        res.status(200).json({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ! คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้แล้ว' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
    }
});

// [AI FETCH] - ดึงข้อมูลด้วย Gemini
apiRouter.post('/fetch-movie-data', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { videoId } = req.body;
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`;
        const ytRes = await axios.get(ytUrl);
        
        if (!ytRes.data.items?.length) return res.status(404).json({ success: false, message: 'ไม่พบวิดีโอ' });

        const snippet = ytRes.data.items[0].snippet;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const prompt = `สรุปข้อมูลหนังจากชื่อ "${snippet.title}" และเนื้อหา "${snippet.description}" ตอบเป็น JSON: { "title": "ชื่อไทย", "year": 2024, "rating": 9.0, "description": "เรื่องย่อ", "actors": "ชื่อนักแสดง", "lessons": "ข้อคิด" }`;

        const result = await model.generateContent(prompt);
        const aiData = JSON.parse(result.response.text());

        res.json({
            success: true,
            data: { ...aiData, posterUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, ytId: videoId }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'AI Error: ' + err.message });
    }
});

// [MOVIES CRUD]
apiRouter.get('/movies', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        res.json({ success: true, data: movies });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.post('/movies', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.put('/movies/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const updated = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.delete('/movies/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await Movie.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'ลบสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// [COMMENTS]
apiRouter.get('/comments/:movieId', async (req, res) => {
    try {
        const comments = await Comment.find({ movieId: req.params.movieId }).sort({ createdAt: -1 });
        res.json({ success: true, data: comments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

apiRouter.post('/comments', async (req, res) => {
    try {
        const newComment = new Comment(req.body);
        await newComment.save();
        res.status(201).json({ success: true, data: newComment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Apply the general rate limiter to all requests to /api
app.use('/api', apiLimiter, apiRouter);

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', error: err.message });
});

// --- Helper Functions ---
async function seedAdminUser() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const adminUsername = process.env.ADMIN_USERNAME;
            const adminPassword = process.env.ADMIN_PASSWORD;

            if (!adminUsername || !adminPassword) {
                console.warn('⚠️ ADMIN_USERNAME or ADMIN_PASSWORD not set in .env. Cannot create admin user.');
                return;
            }

            const newAdmin = new User({
                username: adminUsername,
                password: adminPassword, // Password will be hashed by pre-save hook
                role: 'admin'
            });
            await newAdmin.save();
            console.log('✅ Admin user created successfully.');
        }
    } catch (error) {
        console.error('❌ Error seeding admin user:', error);
    }
};
// --- 7. SPA FALLBACK ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// --- 8. START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 DUYDODEE 4K Server: http://localhost:${PORT}`);
});