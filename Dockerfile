# opencodex proxy in a container: Bun runtime + Vite-built GUI dashboard.
# Stage 1 builds the dashboard (tsc -b && vite build → gui/dist);
# stage 2 runs the proxy with the built GUI in place.
FROM oven/bun:1.4.0-slim AS build

WORKDIR /app
# Root deps (runtime) + GUI deps (build toolchain: vite, typescript, plugin-react).
# Cached independently: source edits below do not invalidate these layers.
COPY package.json bun.lock ./
COPY gui/package.json gui/bun.lock ./gui/
RUN bun install --frozen-lockfile --production \
    && cd gui && bun install --frozen-lockfile

# Source needed to build the GUI and to run the proxy afterwards.
COPY bin ./bin
COPY src ./src
COPY gui ./gui
# tsc -b (project refs) then vite build → gui/dist
RUN cd gui && bun run build

FROM oven/bun:1.4.0-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    OPENCODEX_HOME=/data

# Runtime deps and the built GUI from the build stage; source runs as-is on Bun.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/bin ./bin
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/gui/dist ./gui/dist

VOLUME ["/data"]

# Bind: config.json "hostname" must be "0.0.0.0" for containers (loopback default would
# be unreachable through the platform proxy). PORT is Railway-injected; Dokploy/free
# deployments can pass --port directly in the command.
EXPOSE 10100

# Foreground process with graceful SIGTERM drain (handlers live in src/cli/index.ts).
CMD ["bun", "run", "src/cli/index.ts", "start"]