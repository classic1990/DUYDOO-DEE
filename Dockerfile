# ---- Stage 1: Builder Stage ----
# สเตจนี้ใช้สำหรับเตรียมไฟล์และติดตั้ง dependencies ทั้งหมด
FROM node:18-alpine
WORKDIR /app/
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install
COPY . .

# ---- Stage 2: Production Stage ----
# สเตจนี้คือ Image สุดท้ายที่จะนำไปใช้งานจริง มีขนาดเล็กและปลอดภัย
FROM node:18-alpine

WORKDIR /app

# สร้าง Group และ User สำหรับรันแอปพลิเคชัน เพื่อความปลอดภัย (ไม่รันด้วย root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy เฉพาะไฟล์ที่จำเป็นสำหรับการติดตั้ง production dependencies
COPY --chown=appuser:appgroup server/package.json server/package-lock.json* ./server/

# ติดตั้งเฉพาะ dependencies ที่จำเป็นสำหรับ production
RUN cd server && npm install --production

# Copy source code ทั้งหมดจาก stage 'builder' มายัง stage ปัจจุบัน
COPY --from=0 --chown=appuser:appgroup /app .

# กำหนดให้รันด้วย user ที่สร้างขึ้น
USER appuser

EXPOSE 5000
CMD ["node", "server/server.js"]