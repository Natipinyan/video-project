FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
RUN npm install -g ts-node typescript
COPY package*.json ./
RUN npm install
COPY src/ ./src/

EXPOSE 1234/udp

CMD ["ts-node", "--transpile-only", "--compiler-options", "{\"ignoreDeprecations\":\"6.0\"}", "src/index.ts"]