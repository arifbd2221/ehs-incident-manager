FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install --prefix server
RUN npm install --prefix client
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV JWT_SECRET=sds-incident-mgmt-secret-change-in-production
ENV UPLOAD_DIR=./uploads
ENV DB_PATH=./db/incident_management.db

WORKDIR /app/server

CMD ["node", "index.js"]
