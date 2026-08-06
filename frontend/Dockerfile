# 1단계: 잠금 파일과 동일한 의존성으로 재현 가능한 React 빌드를 만든다.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
# 이메일 인증은 기본 활성이며, 끄고 싶은 배포에서만 false를 넘긴다.
ARG VITE_ENABLE_EMAIL_VERIFICATION="true"
ENV VITE_ENABLE_EMAIL_VERIFICATION=${VITE_ENABLE_EMAIL_VERIFICATION}
RUN npm run build

# 2단계: 빌드 산출물만 최소 Nginx 이미지에서 제공한다.
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
