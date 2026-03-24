FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter lingua-call-api build

FROM node:20-alpine AS runtime
RUN npm install -g pnpm
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /app/apps/api/dist /app/apps/api/dist
COPY apps/worker/run.mjs /app/apps/worker/run.mjs

RUN pnpm install --prod --frozen-lockfile

USER app
CMD ["node", "apps/worker/run.mjs"]
