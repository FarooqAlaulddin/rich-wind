FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY services ./services
EXPOSE 3001
CMD ["npm", "run", "start"]
