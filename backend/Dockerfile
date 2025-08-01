FROM node:18
WORKDIR /backend
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "server.js"]
EXPOSE 8080
COPY credentials.json credentials.json
