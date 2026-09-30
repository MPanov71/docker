FROM alpine:latest

RUN apk update && \
    apk add --no-cache \
        libc6-compat \
        libstdc++ \
        libgcc \
        curl \
        sqlite-libs

COPY sctms/keys.sksn ./
COPY sctms/sctms ./

ENTRYPOINT ["./sctms"]
