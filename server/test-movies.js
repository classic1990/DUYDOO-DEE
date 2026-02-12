const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
const ADMIN_CREDENTIALS = {
    username: 'duy.kan1234@gmail.com',
    password: 'Classic1996'
};

let authToken = '';
let createdMovieId = '';

async function runTests() {
    console.log('🎬 เริ่มต้นรัน Unit Test สำหรับระบบจัดการหนัง (Movies CRUD)...\n');

    // 1. Login
    try {
        console.log('[Step 1] กำลังล็อกอินเป็น Admin...');
        const loginRes = await axios.post(`${API_URL}/login`, ADMIN_CREDENTIALS);
        authToken = loginRes.data.accessToken;
        console.log('✅ Login สำเร็จ ได้รับ Token แล้ว\n');
    } catch (error) {
        console.error('❌ Login ไม่สำเร็จ (ตรวจสอบว่า Server รันอยู่หรือไม่)');
        console.error(error.response ? error.response.data : error.message);
        return;
    }

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    // 2. Create Movie
    try {
        console.log('[Step 2] กำลังสร้างหนังตัวอย่าง...');
        const newMovie = {
            title: 'Unit Test Movie',
            year: 2024,
            rating: 9.9,
            ytId: 'dQw4w9WgXcQ',
            posterUrl: 'https://placehold.co/600x400',
            category: 'inter',
            totalEpisodes: 1,
            description: 'หนังเรื่องนี้สร้างโดยระบบทดสอบอัตโนมัติ',
            isVip: false
        };

        const createRes = await axios.post(`${API_URL}/movies`, newMovie, { headers });
        if (createRes.data.success) {
            createdMovieId = createRes.data.id;
            console.log(`✅ สร้างหนังสำเร็จ ID: ${createdMovieId}\n`);
        } else {
            throw new Error('Create failed');
        }
    } catch (error) {
        console.error('❌ สร้างหนังไม่สำเร็จ');
        console.error(error.response ? error.response.data : error.message);
    }

    // 3. Get Movies (Verify creation)
    if (createdMovieId) {
        try {
            console.log('[Step 3] กำลังดึงรายการหนังทั้งหมด...');
            const getRes = await axios.get(`${API_URL}/movies`);
            const movies = getRes.data.data;
            const found = movies.find(m => m.id === createdMovieId);
            
            if (found) {
                console.log(`✅ พบหนังที่สร้างในรายการ: ${found.title}\n`);
            } else {
                console.error('❌ ไม่พบหนังที่สร้างในรายการ\n');
            }
        } catch (error) {
            console.error('❌ ดึงข้อมูลหนังไม่สำเร็จ');
            console.error(error.response ? error.response.data : error.message);
        }

        // 4. Update Movie
        try {
            console.log('[Step 4] กำลังแก้ไขข้อมูลหนัง...');
            const updateData = {
                title: 'Unit Test Movie (Updated)',
                rating: 10.0
            };
            
            const updateRes = await axios.put(`${API_URL}/movies/${createdMovieId}`, updateData, { headers });
            if (updateRes.data.success) {
                console.log('✅ แก้ไขหนังสำเร็จ\n');
            }
        } catch (error) {
            console.error('❌ แก้ไขหนังไม่สำเร็จ');
            console.error(error.response ? error.response.data : error.message);
        }

        // 5. Delete Movie
        try {
            console.log('[Step 5] กำลังลบหนังตัวอย่าง...');
            const deleteRes = await axios.delete(`${API_URL}/movies/${createdMovieId}`, { headers });
            if (deleteRes.data.success) {
                console.log('✅ ลบหนังสำเร็จ (Clean up)\n');
            }
        } catch (error) {
            console.error('❌ ลบหนังไม่สำเร็จ');
            console.error(error.response ? error.response.data : error.message);
        }
    }

    console.log('🏁 การทดสอบเสร็จสิ้น');
}

runTests();