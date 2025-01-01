# Build stage
##############

FROM node:20-alpine AS build
WORKDIR /app

RUN apk update \
	&& apk add dumb-init
#COPY ../package.json ../pnpm-lock.yaml ../pnpm-workspace.yaml ../tsconfig* ../adapters ../apps ../basic-server ../libs ../server ../shell ./
COPY ../package.json ../pnpm-lock.yaml ../pnpm-workspace.yaml ../tsconfig* ./
COPY ../adapters ./adapters
COPY ../apps ./apps
COPY ../basic-server ./basic-server
COPY ../libs ./libs
COPY ../server ./server
COPY ../shell ./shell

RUN corepack enable pnpm
RUN ls -l /app
RUN pnpm -r install && pnpm -r build

# Production image
###################

FROM node:20-alpine
ENV NODE_ENV=production
#RUN apk update \
#	&& apk add dumb-init
COPY --from=build /use/bin/dumb-init /usr/bin/

USER node
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules /app/
COPY --chown=node:node --from=build /app/basic-server/build /app/basic-server/node-modules /app/basic-server/
CMD ["dumb-init", "node", "basic-server/build/index.js"]
