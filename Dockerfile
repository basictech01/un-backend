FROM node:22-alpine

WORKDIR /app

# Install MySQL client (Alpine way)
RUN apk add --no-cache mysql-client

# Install dependencies first (better cache)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Expose API port
EXPOSE 4001

# Dev mode (nodemon + ts-node)
CMD ["npm", "run", "dev"]
