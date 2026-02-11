const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

// นิยาม Schema (ต้องตรงกับ server.js)
const movieSchema = new mongoose.Schema({
    title: String, year: Number, rating: Number, description: String,
    actors: String, lessons: String, category: String, posterUrl: String,
    ytId: String, episodes: Array, isHero: Boolean, isTrending: Boolean
});
const Movie = mongoose.model('Movie', movieSchema);

const seedData = [
    {
        title: "หาญท้าชะตาฟ้า ปริศนายุทธจักร 2",
        year: 2024,
        rating: 9.8,
        description: "การกลับมาของฟ่านเสียนกับการต่อสู้ในราชสำนักที่เข้มข้นกว่าเดิม",
        category: "china",
        posterUrl: "https://image.tmdb.org/t/p/w500/pi6l9j3gWb04fX07XjT4z554qGf.jpg",
        ytId: "pi6l9j3gWb04fX07X", // ID สมมติ
        isHero: true,
        isTrending: true,
        episodes: [
            { epTitle: "ตอนที่ 1", ytId: "videoId_ep1" },
            { epTitle: "ตอนที่ 2", ytId: "videoId_ep2" },
            { epTitle: "ตอนที่ 3", ytId: "videoId_ep3" }
        ]
    }
];

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("🌱 กำลังล้างข้อมูลเก่าและลงข้อมูลใหม่...");
        await Movie.deleteMany({});
        await Movie.insertMany(seedData);
        console.log("✅ ลงข้อมูลเรียบร้อย! ปิด Terminal นี้แล้วไปรัน server.js ได้เลย");
        process.exit();
    });