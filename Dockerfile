# Copyright (c) 2026 Eduardo Emiliano Alaniz - AllSafe Security Solutions
# SPDX-License-Identifier: AGPL-3.0-only

# Stage 1: build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Stage 2: backend runtime
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production --silent
COPY backend/ ./
COPY --from=frontend-builder /app/dist ./public
EXPOSE 3003
CMD ["node", "server.js"]
