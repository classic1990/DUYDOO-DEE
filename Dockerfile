# ---- Stage 1: Dependencies ----
# สเตจนี้ใช้สำหรับติดตั้ง Production Dependencies โดยเฉพาะ
# การแยกสเตจนี้ออกมาช่วยให้ Docker สามารถ Cache Dependencies ได้
# และไม่ต้องติดตั้งใหม่ทุกครั้งที่มีการแก้ไข Source Code
FROM node:18-alpine AS deps
WORKDIR /app/
# Copy เฉพาะไฟล์ที่จำเป็นต่อการติดตั้ง
COPY server/package.json server/package-lock.json* ./server/
# ติดตั้งเฉพาะ Production Dependencies
RUN cd server && npm install --production

# ---- Stage 2: Production Image ----
# สเตจนี้คือ Image สุดท้ายที่จะนำไปใช้งานจริง มีขนาดเล็กและปลอดภัย
FROM node:18-alpine
WORKDIR /app

# สร้าง Group และ User สำหรับรันแอปพลิเคชัน เพื่อความปลอดภัย (ไม่รันด้วย root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy Dependencies ที่ติดตั้งไว้แล้วจากสเตจ 'deps'
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy Source Code ทั้งหมดของโปรเจค
COPY --chown=appuser:appgroup . .

# กำหนดให้รันด้วย user ที่สร้างขึ้น
USER appuser

EXPOSE 5000
CMD ["node", "server/server.js"]