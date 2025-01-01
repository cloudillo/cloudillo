FROM node:16-alpine

WORKDIR /app

RUN apk update \
	&& apk add --no-cache curl

COPY package.json /app/
COPY build /app/build
#COPY node_modules_docker /app/node_modules
COPY pruned/node_modules /app/node_modules

CMD [ "node", "build/index" ]
