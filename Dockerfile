FROM node:19-alpine AS build

# We're building, this needs to be development
ENV NODE_ENV=development

# Set the base application directory
WORKDIR /build

# Minimize number of layers by copying both files at once
COPY package.json package-lock.json ./

# Install the dependencies
RUN npm install

# Copy the application itself
COPY . /build

RUN sh -c "npm run build && NODE_ENV=production npm prune && cp -R /build/node_modules /build/package.json /build/build /home/node"

FROM node:19-alpine AS app

# For version information
ARG SOURCE_COMMIT
ARG DOCKER_TAG
ENV SOURCE_COMMIT=$SOURCE_COMMIT
ENV DOCKER_TAG=$DOCKER_TAG

ENV NODE_ENV=production

# Run as the node user for security purposes
USER node

# Set the base application directory
WORKDIR /home/node

COPY --from=build --chown=node:node /home/node /home/node

# Run the bot, no need for an entrypoint script
CMD [ "npm", "run", "start"]
