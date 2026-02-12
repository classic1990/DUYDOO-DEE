// --- จำลองข้อมูล ---
const mockApiKeys = ["KEY_1_BROKEN_QUOTA", "KEY_2_WORKING", "KEY_3_SPARE"];
let currentKeyIndex = 0;

// --- สร้าง AI ปลอม (Mock Class) ---
class MockGoogleGenerativeAI {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    getGenerativeModel({ model }) {
        return {
            generateContent: async (prompt) => {
                console.log(`   👉 [MockAI] กำลังยิง Request ด้วย Key: ${this.apiKey} (Model: ${model})`);
                
                // จำลองสถานการณ์: ถ้าเป็น Key แรก ให้แกล้ง Error 429
                if (this.apiKey === "KEY_1_BROKEN_QUOTA") {
                    throw new Error("[429] Resource has been exhausted (e.g. check quota).");
                }
                
                // จำลองสถานการณ์: ถ้าเป็น Key ที่สอง ให้ทำงานสำเร็จ
                if (this.apiKey === "KEY_2_WORKING") {
                    return {
                        response: {
                            text: () => "✅ Success! AI ตอบกลับมาแล้ว (แสดงว่าสลับ Key สำเร็จ)"
                        }
                    };
                }
                
                throw new Error("Unknown Key Error");
            }
        };
    }
}

// --- ฟังก์ชัน Rotation (Logic เดียวกับใน server.js) ---
async function generateWithRotation(prompt) {
    console.log("🔄 เริ่มต้นทดสอบระบบ Key Rotation...\n");
    
    if (mockApiKeys.length === 0) throw new Error("No API Keys");

    let attempts = 0;
    // วนลูปจนกว่าจะครบทุก Key หรือเจอตัวที่ใช้ได้
    while (attempts < mockApiKeys.length) {
        try {
            const apiKey = mockApiKeys[currentKeyIndex];
            
            // ใช้ Mock Class แทนของจริง
            const genAI = new MockGoogleGenerativeAI(apiKey);
            
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                console.log(`🤖 System: กำลังใช้ Key Index: ${currentKeyIndex} (${apiKey})...`);
                return await model.generateContent(prompt);
            } catch (modelError) {
                // ถ้าเจอ Error 429 ให้โยนไป catch ด้านล่างเพื่อสลับ Key
                if (modelError.message.includes("429") || modelError.message.toLowerCase().includes("quota")) {
                    throw modelError; 
                }
                throw modelError;
            }

        } catch (error) {
            if (error.message.includes("429") || error.message.toLowerCase().includes("quota")) {
                console.warn(`⚠️ แจ้งเตือน: Key [${currentKeyIndex}] โควต้าเต็ม! (Error 429) -> กำลังสลับไป Key ถัดไป...\n`);
                currentKeyIndex = (currentKeyIndex + 1) % mockApiKeys.length;
                attempts++;
            } else {
                throw error;
            }
        }
    }
    throw new Error("ทุก API Key โควต้าเต็มหรือใช้งานไม่ได้");
}

// --- รันการทดสอบ ---
(async () => {
    try {
        const result = await generateWithRotation("Test Prompt");
        console.log("\n🎉 ผลลัพธ์สุดท้าย:", result.response.text());
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
})();