FROM node:18-bullseye
RUN mkdir app
WORKDIR /app
COPY . ./
RUN npm ci
EXPOSE 3000
CMD node .