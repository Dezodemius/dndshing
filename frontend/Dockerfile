# Build stage: Node compiles the SPA to static assets. Nothing from this stage
# reaches the final image, so neither node nor the dev dependencies ship to prod.
FROM node:22-alpine AS build

WORKDIR /app

ARG APP_COMMIT_SHA=dev

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL is deliberately not passed in: Vite inlines VITE_* variables
# into the bundle at build time, so any value here would pin every deployment to
# one developer's backend URL. Unset, the client falls back to a same-origin
# /api/v1 (see src/api/client.ts) that nginx proxies to the api container.
RUN npm run build \
    && printf '{"commit":"%s"}\n' "$APP_COMMIT_SHA" > dist/version.json

# Runtime stage: nginx serves the built bundle and fronts the API.
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
