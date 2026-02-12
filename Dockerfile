FROM node:18-alpine

# ตั้งค่าโฟลเดอร์ทำงานหลัก
WORKDIR /app

# 1. Copy เฉพาะไฟล์ Package ของ Server ก่อนเพื่อทำ Caching
COPY server/package*.json ./server/

# 2. ติดตั้ง Package (ถ้า package.json ไม่เปลี่ยน ขั้นตอนนี้จะใช้ Cache เดิม)
WORKDIR /app/server
RUN npm install

# 3. Copy โค้ดทั้งหมด (Client & Server) เข้า Container
WORKDIR /app
COPY . .

EXPOSE 5000

# รัน Server
WORKDIR /app/server
CMD ["node", "server.js"]