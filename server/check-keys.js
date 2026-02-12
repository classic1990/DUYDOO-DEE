const { GoogleGenerativeAI } = require("@google/generative-ai");

const keysToCheck = [
    "AIzaSyDXuRGce89rg1e2ieKmYMVpunlE-tB4UP8",
    "AIzaSyCNkhAQI7axmEF6MiObPF6Vlsnd3_M7kG4",
    "AIzaSyBUqeNVsBtwWoioVgDQLMbY287XJlt53J4",
    "AIzaSyDqmCXdh13szT-Rt4fgRPcqUzO9E_Mol7k",
    "AIzaSyA22Glio8eOXCmLSgUMq4LE7adebUBYbS0",
    "AIzaSyDquKFgT-UyQoT8f5x39-WNWIoe-2MzDzc",
    "AIzaSyCyViIMg-zMjP6qy7Va-rcJbVu-BTmPHgk"
];

async function checkKeys() {
    console.log("🕵️‍♂️ กำลังตรวจสอบสถานะ API Keys ทั้งหมด...\n");

    for (const apiKey of keysToCheck) {
        const genAI = new GoogleGenerativeAI(apiKey);
        // ใช้ gemini-1.5-flash ในการเทสเพราะเร็วและเป็นรุ่นมาตรฐาน
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        process.stdout.write(`🔑 ${apiKey.substring(0, 10)}... -> `);

        try {
            // ลองยิง request สั้นๆ
            await model.generateContent("Test");
            console.log("✅ ใช้งานได้ (Active)");
        } catch (error) {
            let status = "❌ ใช้งานไม่ได้";
            if (error.message.includes("429")) {
                status = "⚠️ โควต้าเต็ม (Rate Limit Exceeded)";
            } else if (error.message.includes("API key not valid") || error.message.includes("400")) {
                status = "❌ คีย์ไม่ถูกต้อง (Invalid Key)";
            } else if (error.message.includes("403")) {
                status = "❌ ไม่มีสิทธิ์เข้าถึง (Permission Denied)";
            }
            
            console.log(status);
        }
    }
}

checkKeys();