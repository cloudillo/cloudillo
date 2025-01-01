# syntax=docker/dockerfile:1

# Build stage
##############

FROM node:22-alpine AS build
WORKDIR /app

#COPY ../package.json ../pnpm-lock.yaml ../pnpm-workspace.yaml ../tsconfig* ../adapters ../apps ../basic-server ../libs ../server ../shell ./
COPY ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./tsconfig* ./
COPY ./adapters ./adapters
COPY ./apps ./apps
COPY ./basic-server ./basic-server
COPY ./libs ./libs
COPY ./server ./server
COPY ./shell ./shell

RUN corepack enable pnpm
RUN apk --no-cache add dumb-init python3 make gcc g++ musl-dev unbound-dev

RUN pnpm -r install && pnpm -r build
#RUN (cd basic-server && pnpm install -r --prod --force)
RUN (cd basic-server && pnpm --filter @cloudillo/basic-server --prod deploy pruned)

# Production image
###################

FROM node:22-alpine
ENV NODE_ENV=production
ENV MODE=standalone
ENV PUBLIC_DATA_DIR=/data/pub
ENV PRIVATE_DATA_DIR=/data/priv

RUN apk --no-cache add dumb-init bash

USER node
WORKDIR /app
#COPY package.json .
#COPY --chown=node:node --from=build /app/node_modules /app/node_modules
#COPY --chown=node:node --from=build /app/basic-server/package.json /app/basic-server/package.json
#COPY --chown=node:node --from=build /app/basic-server/build /app/basic-server/build
COPY --chown=node:node --from=build /app/basic-server/pruned /app
COPY --chown=node:node --from=build /app/shell/dist /app/shell
COPY --chown=node:node --from=build /app/apps/formillo/dist /app/apps/formillo
COPY --chown=node:node --from=build /app/apps/prello/dist /app/apps/prello
COPY --chown=node:node --from=build /app/apps/quillo/dist /app/apps/quillo
#COPY --chown=node:node --from=build /app/basic-server/node_modules /app/basic-server/node_modules
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "build/index.js", "Cloudillo"]
