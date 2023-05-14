FROM node:20-alpine AS build

# We're building, this needs to be development
ENV NODE_ENV=development

# Set the base application directory
WORKDIR /build

# Minimize number of layers by copying both files at once
COPY package.json package-lock.json ./

# Install the dependencies (optional dependencies are needed for swc)
RUN npm ci --include=optional

# Copy the application itself
COPY . /build

RUN sh -c "npm run build && cp -R /build/package.json /build/build /build/locales /home/node"

FROM node:20-alpine AS app

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
