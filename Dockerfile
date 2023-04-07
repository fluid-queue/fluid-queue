FROM node:19-alpine

# For version information
ARG SOURCE_COMMIT
ARG DOCKER_TAG
ENV SOURCE_COMMIT=$SOURCE_COMMIT
ENV DOCKER_TAG=$DOCKER_TAG

# Run as the node user for security purposes
USER node

# Set the base application directory
WORKDIR /home/node

# The base image should take care of this for us, but it doesn't hurt to specify explicitly
ENV NODE_ENV=production

# Minimize number of layers by copying both files at once
COPY --chown=node:node package.json package-lock.json ./

# Install the dependencies
RUN npm install

# Copy the application itself
COPY --chown=node:node . /home/node

# Run the bot, no need for an entrypoint script
CMD [ "npm", "run", "start"]
