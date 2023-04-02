FROM node:19-alpine

# Run as the node user for security purposes
USER node


# Set the base application directory
WORKDIR /app

# Minimize number of layers by copying both files at once
COPY --chown=node:node package.json package-lock.json ./

# Install the dependencies
RUN npm install

# Copy the application itself
COPY --chown=node:node . /app

# Run the bot, no need for an entrypoint script
CMD [ "npm", "run", "start"]
