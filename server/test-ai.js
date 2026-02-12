const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ ไม่พบ GEMINI_API_KEY ในไฟล์ .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // --- Step 1: List available models ---
    console.log("🧪 กำลังตรวจสอบโมเดลที่ใช้งานได้จาก API Key ของคุณ...");
    try {
        const result = await genAI.listModels();
        const availableModels = [];
        for await (const m of result) {
            if (m.supportsGenerateContent) {
                availableModels.push(m.name);
            }
        }
        if (availableModels.length > 0) {
            console.log("✅ พบโมเดลที่รองรับ `generateContent`:");
            availableModels.forEach(m => console.log(`   - ${m}`));
        } else {
            console.log("⚠️ ไม่พบโมเดลที่รองรับ `generateContent` จาก API Key นี้");
        }
    } catch (error) {
        console.error("\n❌ เกิดข้อผิดพลาดร้ายแรงในการเชื่อมต่อกับ Google AI");
        if (error.message.includes('API key not valid')) {
            console.error("   สาเหตุ: API Key ไม่ถูกต้อง กรุณาตรวจสอบในไฟล์ .env");
        } else if (error.message.includes('permission')) {
             console.error("   สาเหตุ: API Key ไม่มีสิทธิ์เข้าถึง หรือโปรเจกต์ยังไม่ได้เปิดใช้งาน 'Generative Language API'");
        } else {
            console.error("   รายละเอียด:", error.message);
        }
        return;
    }

    // --- Step 2: Test specific models ---
    const modelsToTest = [
        "gemini-1.5-flash",
        "gemini-pro",
    ];

    console.log("\n🧪 กำลังทดสอบการสร้างเนื้อหาจากโมเดลยอดนิยม...\n");

    for (const modelName of modelsToTest) {
        process.stdout.write(`⏳ Testing ${modelName.padEnd(20)} ... `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Test connection. Reply 'OK'.");
            const response = await result.response;
            const text = response.text();
            console.log(`✅ ใช้งานได้ (ตอบกลับ: ${text.trim()})`);
        } catch (error) {
            let msg = error.message.split('\n')[0]; // เอาแค่บรรทัดแรก
            if (msg.includes("404")) msg = "Not Found (404) - ชื่อโมเดลผิดหรือยังไม่เปิดให้ใช้";
            else if (msg.includes("400")) msg = "Bad Request (400)";
            else if (msg.includes("403")) msg = "Permission Denied (403) - API Key อาจไม่รองรับ";
            
            console.log(`❌ ใช้งานไม่ได้ (${msg})`);
        }
    }
}

run();