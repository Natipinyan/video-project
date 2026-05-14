FROM node:20-alpine

WORKDIR /app

RUN npm install -g ts-node typescript

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

EXPOSE 3000

CMD ["ts-node", "--transpile-only", "--compiler-options", "{\"ignoreDeprecations\":\"6.0\"}", "src/index.ts"]
