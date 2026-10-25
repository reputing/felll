# man-go (github.com/la-lo-go/man-go), a Go manga API, built from source. Mirrors
# the upstream repo's own Dockerfile. wrangler builds + pushes this on
# `npm run mango:container:deploy`.
FROM golang:1.23-alpine

WORKDIR /app
RUN apk add --no-cache git ca-certificates

# Pull the source and build the server.
RUN git clone --depth 1 https://github.com/la-lo-go/man-go.git . \
  && go mod download \
  && go build -o main .

ENV API_PORT=7070
ENV API_IP=0.0.0.0
EXPOSE 7070

CMD ["./main"]
