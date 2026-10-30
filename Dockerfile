FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV PORT=3000 DATA_DIR=/app/data NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
