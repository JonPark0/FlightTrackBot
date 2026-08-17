# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

# sharp needs these at install time to build/fetch its prebuilt binaries
RUN apk add --no-cache python3 make g++ vips-dev

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache vips \
  && addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY db ./db

RUN mkdir -p /app/.tilecache && chown -R app:app /app
USER app

CMD ["node", "dist/index.js"]
