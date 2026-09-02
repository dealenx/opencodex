# opencodex proxy in a container: Bun runtime + GUI dashboard built during image build.
# Stage 1 runs the repo's own `bun run build:gui` (gui install -> tsc -b && vite build
# -> prepare:package), stage 2 runs the proxy with the built dashboard in place.
FROM oven/bun:1.4.0-slim AS build

WORKDIR /app
# Deps first for layer caching: root (production) + gui (build toolchain).
COPY package.json bun.lock ./
COPY gui/package.json gui/bun.lock ./gui/
RUN bun install --frozen-lockfile --production \
    && cd gui && bun install --frozen-lockfile

# Source needed by build:gui and by the proxy at runtime.
COPY bin ./bin
COPY src ./src
COPY scripts ./scripts
COPY gui ./gui

# Minimal git shim for scripts/prepare-package.ts: it hashes the working tree through
# `git ls-files -z -- <path>...`, and a Docker build context has no .git (history must
# not enter the image). The shim expands directories to files and prints existing files
# NUL-separated; hashes are computed from real bytes, so the generated compatibility
# manifest (src/generated/compatibility-version.json, untracked metadata) stays accurate.
# The generated file is REMOVED before copying to the runtime stage: the proxy treats its
# presence as "running from a packaged install" and skips its own manifest regeneration.
RUN mkdir -p /usr/local/bin && printf '%s\n' \
    '#!/bin/sh' \
    'if [ "$1" = "ls-files" ]; then' \
    '  shift 3 2>/dev/null || shift $#' \
    '  for p in "$@"; do' \
    '    if [ -d "$p" ]; then find "$p" -type f -print0' \
    '    elif [ -f "$p" ]; then printf "%s\0" "$p"' \
    '    fi' \
    '  done' \
    '  exit 0' \
    'fi' \
    'exec /bin/true' \
    > /usr/local/bin/git && chmod +x /usr/local/bin/git

# The repo's canonical GUI build: tsc -b && vite build -> gui/dist, then prepare:package
# (normalizes file modes, writes the compatibility version manifest).
RUN bun run build:gui

FROM oven/bun:1.4.0-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    OPENCODEX_HOME=/data \
    PORT=10100

# Runtime deps, built GUI, and runnable source from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/bin ./bin
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/gui/dist ./gui/dist

VOLUME ["/data"]

# Bind: config.json "hostname" must be "0.0.0.0" for containers (loopback default would
# be unreachable through the platform proxy). PORT is Railway-injected; Dokploy/free
# deployments can pass --port directly in the command.
EXPOSE 10100

# Foreground process with graceful SIGTERM drain (handlers live in src/cli/index.ts).
# Seed the volume with the image's build provenance so GET /build-info.json reports the
# running image even after volume restorage. The proxy prefers $OPENCODEX_HOME's copy.
CMD ["sh", "-c", "cp -n /app/gui/dist/build-info.json /data/build-info.json 2>/dev/null; exec bun run src/cli/index.ts start"]