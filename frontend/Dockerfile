# 1단계: React 빌드
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_RECORDING_EGRESS_ENABLED=false
ENV VITE_RECORDING_EGRESS_ENABLED=${VITE_RECORDING_EGRESS_ENABLED}
RUN npm run build

# 2단계: 정적 파일 제공
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
