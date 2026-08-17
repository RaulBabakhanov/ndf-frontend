# Build stage
FROM node:22-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install a simple HTTP server
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port 80
EXPOSE 80

# Set environment to production
ENV NODE_ENV=production

# Start server on port 80
CMD ["serve", "-s", "dist", "-l", "80"]
