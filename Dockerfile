FROM node:16-alpine

WORKDIR /usr/src/app

# install app dependencies
COPY package.json ./
RUN yarn
RUN yarn global add nodemon

COPY --chown=node:node . .

ENV PATH /backend/node_modules/.bin:$PATH

RUN chown -R node:node node_modules
USER node

# start app
RUN chmod +x entrypoint.sh
ENTRYPOINT "/usr/src/app/entrypoint.sh"
