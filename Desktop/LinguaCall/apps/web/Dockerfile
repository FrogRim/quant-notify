FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/ apps/web/

ARG VITE_API_BASE_URL
ARG VITE_TOSS_CLIENT_KEY
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_TOSS_CLIENT_KEY=${VITE_TOSS_CLIENT_KEY}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter lingua-call-web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
