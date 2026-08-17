FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/hardware/package.json packages/hardware/
COPY packages/citrine-client/package.json packages/citrine-client/

RUN pnpm install --frozen-lockfile --filter @letscharge/web...

COPY tsconfig.base.json ./
COPY apps/web apps/web

RUN pnpm --filter @letscharge/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
