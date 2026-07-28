# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Public API URLs are baked at build time (NEXT_PUBLIC_*). Pass via build args.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_WS_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_BASE_URL=$NEXT_PUBLIC_WS_BASE_URL

RUN npm run build

# ---- Runtime stage (standalone, spec §1) ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Standalone output bundles a minimal server + only the needed node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
