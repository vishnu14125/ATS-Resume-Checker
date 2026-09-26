# Use official Node.js runtime as a parent image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package.json and workspace configuration
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm install --prefix server
RUN npm install --prefix client

# Copy application code
COPY server ./server
COPY client ./client

# Build the frontend client
RUN npm run build --prefix client

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Copy the server directory (including node_modules installed earlier)
COPY --from=builder /app/server ./server
# Copy the built frontend static files to the server's public folder if served statically, 
# or just run it via NGINX. Let's assume server serves the client or they run separately.
# For a full-stack deploy, it's common to copy client build to server/public.
COPY --from=builder /app/client/dist ./server/public

# Environment Configuration
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

WORKDIR /app/server
CMD ["node", "index.js"]
