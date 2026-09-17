# Build the Vite board, then serve it from a small Node runtime.
#
# A Node runtime (not static hosting) is required because the board has shared
# state and a documents upload API. It also needs Python with `fast-flights`
# so the "Consultar precios" button and the daily monitor can query Google
# Flights directly — without it the board still works but only shows prices
# that were pushed to it.
#
# Debian (glibc), not Alpine: the venv path is then predictable and
# `python3 -m venv` works out of the box (Alpine ships no ensurepip).
#
# ORDERING MATTERS: requirements.txt is COPY'd before the RUN that installs it.
# Referencing a file in a RUN only works if a COPY put it there first — putting
# the pip install above the COPY fails the build with "Could not open
# requirements file".

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Python + the Google Flights bridge. requirements.txt must be present first.
COPY requirements.txt ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/ffenv \
    && /opt/ffenv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/ffenv/bin/pip install --no-cache-dir -r requirements.txt \
    && find /opt/ffenv -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && rm -rf /root/.cache

# The server reads this to invoke the Google Flights bridge.
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
