# Use Node.js as the base image
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application (after dependencies are installed)
COPY . .

# Expose the port the app will run on (React default port is 3000)
EXPOSE 3000

# Command to run the React app in development mode
CMD ["node", "server.js"]
