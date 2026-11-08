# Build stage: compile the TypeScript relay.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run check && npm run build

# Run stage: just the built server and its runtime dependencies.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /certs && chown node:node /certs

ENV NODE_ENV=production \
    PORT=8443 \
    CERT_DIR=/certs

USER node
EXPOSE 8443
# Only the TLS certificate is kept here (created on first start), so devices
# don't have to accept a new one after every restart. No messages are stored.
VOLUME ["/certs"]

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require(process.env.TLS==='off'?'http':'https').get({host:'127.0.0.1',port:process.env.PORT,path:'/health',rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
