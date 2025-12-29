# Dashboard Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
