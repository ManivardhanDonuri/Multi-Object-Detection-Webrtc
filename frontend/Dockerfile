FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* /app/
RUN npm ci || npm install
COPY . /app
ARG VITE_BACKEND_URL
ARG VITE_DEFAULT_MODE
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_DEFAULT_MODE=$VITE_DEFAULT_MODE
EXPOSE 5173
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","5173"]
