FROM node:18-alpine

# ตั้งค่าโฟลเดอร์ทำงานหลัก
WORKDIR /app

# Copy ไฟล์ทั้งหมดเข้า Container
COPY . .

# เข้าไปติดตั้ง Package ในโฟลเดอร์ server
WORKDIR /app/server
RUN npm install

EXPOSE 5000
CMD ["node", "server.js"]