import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ตั้งค่า AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// API สำหรับเจนเนื้อหาซีรีส์จีน
app.post('/api/ai/generate-summary', async (req, res) => {
    try {
        const { title } = req.body;
        const prompt = `ช่วยเขียนเรื่องย่อสั้นๆ สำหรับซีรีส์จีนแนวตั้งเรื่อง: ${title} ให้ดูน่าติดตาม`;
        
        const result = await model.generateContent(prompt);
        res.json({ summary: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: "AI เอ๋อครับพี่ดุ่ย เช็ก API Key หน่อย" });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ Backend พร้อมรันที่: http://localhost:${PORT}`);
});