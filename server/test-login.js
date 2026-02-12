const axios = require('axios');

// URL ของ API (ตรวจสอบ Port ให้ตรงกับที่รันอยู่)
const API_URL = 'http://localhost:5000/api';

async function runTests() {
    console.log('🧪 เริ่มต้นรัน Unit Test สำหรับระบบ Login...\n');

    // --- Test Case 1: Login ด้วยบัญชี Admin จาก Seed ---
    // ข้อมูลนี้มาจากไฟล์ server/seed.js
    const adminUser = {
        username: 'duy.kan1234@gmail.com',
        password: '12345678'
    };

    console.log(`[Test 1] ทดสอบ Login ด้วยบัญชี: ${adminUser.username}`);
    try {
        const res = await axios.post(`${API_URL}/login`, adminUser);
        if (res.status === 200 && res.data.success) {
            console.log('✅ PASS: เข้าสู่ระบบสำเร็จ');
            console.log(`   Token: ${res.data.accessToken.substring(0, 20)}...`);
            console.log(`   Role: ${res.data.role}`);
        } else {
            console.log('❌ FAIL: สถานะไม่ถูกต้อง', res.data);
        }
    } catch (error) {
        console.log('❌ FAIL: เข้าสู่ระบบไม่สำเร็จ');
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data.message}`);
            if (error.response.status === 401) {
                console.log('   💡 สาเหตุ: ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ลองรัน node seed.js อีกครั้ง)');
            }
        } else {
            console.log(`   Error: ${error.message}`);
            console.log('   💡 สาเหตุ: ไม่สามารถเชื่อมต่อ Server ได้ (ตรวจสอบว่า npm start รันอยู่หรือไม่)');
        }
    }

    console.log('\n---------------------------------------------------\n');

    // --- Test Case 2: Login ด้วยรหัสผ่านผิด ---
    console.log('[Test 2] ทดสอบ Login ด้วยรหัสผ่านผิด');
    try {
        await axios.post(`${API_URL}/login`, {
            username: adminUser.username,
            password: 'wrongpassword123'
        });
        console.log('❌ FAIL: ระบบยอมให้เข้าสู่ระบบทั้งที่รหัสผิด!');
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('✅ PASS: ระบบปฏิเสธการเข้าสู่ระบบถูกต้อง (401 Unauthorized)');
        } else {
            console.log(`❌ FAIL: ได้รับ Status Code ที่ไม่คาดหวัง: ${error.response ? error.response.status : error.message}`);
        }
    }
}

runTests();