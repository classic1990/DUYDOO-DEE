const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
const ADMIN_CREDENTIALS = {
    username: 'duy.kan1234@gmail.com',
    password: 'Classic1996'
};

const TEST_USER = {
    username: 'test_user_mgmt',
    password: 'password1234'
};

let authToken = '';
let testUserId = '';

async function runTests() {
    console.log('👤 เริ่มต้นรัน Unit Test สำหรับระบบจัดการผู้ใช้งาน (User Management)...\n');

    // 1. Login as Admin
    try {
        console.log('[Step 1] กำลังล็อกอินเป็น Admin...');
        const loginRes = await axios.post(`${API_URL}/login`, ADMIN_CREDENTIALS);
        authToken = loginRes.data.accessToken;
        console.log('✅ Login Admin สำเร็จ\n');
    } catch (error) {
        console.error('❌ Login Admin ไม่สำเร็จ (ตรวจสอบว่า Server รันอยู่หรือไม่)');
        if (error.response) console.error(error.response.data);
        return;
    }

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    // 2. Register a new user (Simulate Add User)
    try {
        console.log('[Step 2] กำลังสร้างผู้ใช้งานใหม่ (ผ่าน API Register)...');
        // Try to register
        try {
             await axios.post(`${API_URL}/register`, TEST_USER);
             console.log('✅ สร้างผู้ใช้งานสำเร็จ\n');
        } catch (err) {
            if (err.response && err.response.status === 409) {
                console.log('ℹ️ ผู้ใช้งานนี้มีอยู่แล้ว (จะใช้ข้อมูลเดิมทดสอบต่อ)\n');
            } else {
                throw err;
            }
        }
    } catch (error) {
        console.error('❌ สร้างผู้ใช้งานไม่สำเร็จ');
        if (error.response) console.error(error.response.data);
        return;
    }

    // 3. Get Users (Admin API) to find the ID
    try {
        console.log('[Step 3] Admin กำลังดึงรายชื่อผู้ใช้งานทั้งหมด...');
        const res = await axios.get(`${API_URL}/users`, { headers });
        const users = res.data.data;
        const foundUser = users.find(u => u.username === TEST_USER.username);

        if (foundUser) {
            testUserId = foundUser._id;
            console.log(`✅ พบผู้ใช้งานในระบบ ID: ${testUserId} (Role ปัจจุบัน: ${foundUser.role})\n`);
        } else {
            throw new Error('ไม่พบผู้ใช้งานที่เพิ่งสร้างในรายการ');
        }
    } catch (error) {
        console.error('❌ ดึงข้อมูลผู้ใช้ไม่สำเร็จ');
        if (error.response) console.error(error.response.data);
        return;
    }

    // 4. Update User Role (Admin API)
    if (testUserId) {
        try {
            console.log('[Step 4] Admin กำลังเปลี่ยนสิทธิ์ผู้ใช้เป็น VIP...');
            const updateRes = await axios.put(`${API_URL}/users/${testUserId}`, { role: 'vip' }, { headers });
            if (updateRes.data.success) {
                console.log('✅ เปลี่ยนสิทธิ์สำเร็จ\n');
            }
        } catch (error) {
            console.error('❌ เปลี่ยนสิทธิ์ไม่สำเร็จ');
            if (error.response) console.error(error.response.data);
        }

        // 5. Delete User (Admin API)
        try {
            console.log('[Step 5] Admin กำลังลบผู้ใช้งานทดสอบ...');
            const deleteRes = await axios.delete(`${API_URL}/users/${testUserId}`, { headers });
            if (deleteRes.data.success) {
                console.log('✅ ลบผู้ใช้งานสำเร็จ (Clean up)\n');
            }
        } catch (error) {
            console.error('❌ ลบผู้ใช้งานไม่สำเร็จ');
            if (error.response) console.error(error.response.data);
        }
    }

    console.log('🏁 การทดสอบ User Management เสร็จสิ้น');
}

runTests();