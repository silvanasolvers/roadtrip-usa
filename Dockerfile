# Build the Vite board, then serve it from a small Node runtime.
#
# A Node runtime (not static hosting) is required because the board has shared
# state and a documents upload API. It also needs Python with `fast-flights`
# so the "Consultar precios" button and the daily monitor can query Google
# Flights directly — without it the board would only ever show pushed prices.
#
# Debian (glibc), NOT Alpine: fast-flights pulls `primp`, a Rust extension with
# prebuilt manylinux wheels but no musl wheel. On Alpine pip tries to compile it
# from source and the image has no Rust toolchain, so the build fails at the pip
# step. Debian slim installs it as a wheel in seconds.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/ffenv \
    && /opt/ffenv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/ffenv/bin/pip install --no-cache-dir \
         fast-flights typing_extensions primp selectolax \
    && find /opt/ffenv -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && rm -rf /root/.cache
ENV FLIGHT_PYTHON=/opt/ffenv/bin/python
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/data/uploads
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
