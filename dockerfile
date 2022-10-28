from node:18-alpine

# Set the base application directory
WORKDIR /app

COPY package.json package.json
COPY package-lock.json package-lock.json

# Install the dependencies
RUN npm install
COPY . .

CMD [ "npm", "run", "start"]