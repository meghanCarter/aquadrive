FROM node:24-bookworm-slim AS mobile-web
WORKDIR /build/mobile
COPY aquadrive/package.json aquadrive/package-lock.json ./
RUN npm ci
COPY aquadrive/ ./
# Web calls its own origin. Never place payment or admin secrets in this build.
RUN EXPO_OFFLINE=1 npx expo export --platform web --output-dir /build/public

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/*.mjs ./
COPY --from=mobile-web /build/public ./public
RUN mkdir -p /var/data && chown node:node /var/data
USER node
ENV NODE_ENV=production PORT=4000 DB_PATH=/var/data/aquadrive.sqlite
EXPOSE 4000
CMD ["node", "index.mjs"]
