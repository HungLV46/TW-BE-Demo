FROM node:16-alpine3.15

RUN mkdir /app
WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --production

COPY . .

CMD docker/entrypoint.sh