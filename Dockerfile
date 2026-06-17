FROM node:22-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace /app
EXPOSE 3000
CMD ["node", "apps/service/dist/index.js"]
