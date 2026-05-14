FROM node:20-alpine

WORKDIR /app

RUN npm install -g ts-node typescript

COPY package*.json ./

COPY tsconfig.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["ts-node", "--project", "tsconfig.json", "src/index.ts"]