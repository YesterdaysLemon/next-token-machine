FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY package.json server.mjs ./
COPY scripts ./scripts
COPY public ./public
COPY .git ./.git
RUN npm test && git rev-parse HEAD > build-sha.txt

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/server.mjs /app/build-sha.txt ./
COPY --from=build /app/public ./public
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
