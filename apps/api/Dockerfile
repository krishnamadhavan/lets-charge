FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/hardware/package.json packages/hardware/
COPY packages/citrine-client/package.json packages/citrine-client/

RUN pnpm install --frozen-lockfile --filter @letscharge/api...

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages

WORKDIR /app/apps/api
ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

CMD ["pnpm", "start"]
