# API image. The frontend is a static Vite build (npm run build --prefix client)
# and is hosted separately; point it at this API with VITE_API_BASE_URL.
#
# Configuration comes from environment variables at run time (see server/.env.example):
#   docker build -t ats-api .
#   docker run -p 5000:5000 --env-file production.env ats-api
# Use a dedicated production env file: never server/.env, which is a development config.
# No .env file is copied into the image (.dockerignore).
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app/server

# Production dependencies only, exactly as locked.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./

# Nothing is written to disk at run time: uploads are processed in memory.
USER node

ENV PORT=5000
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
