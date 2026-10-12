# Spike for #2078: the stock Convex local backend on SQLite, replicated to R2 by Litestream.
FROM --platform=linux/amd64 ubuntu:24.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip procps \
  && rm -rf /var/lib/apt/lists/*

# The same backend release CI pins in scripts/verify-hosted-play-stack.ts.
ARG CONVEX_RELEASE=precompiled-2026-08-10-c0cb7ae
ARG CONVEX_SHA256=25a5c7c6969b36b382a2651a8e44a30452879b5c8194e89f6e972b5857919d46
RUN curl -fsSL -o /tmp/backend.zip \
    "https://github.com/get-convex/convex-backend/releases/download/${CONVEX_RELEASE}/convex-local-backend-x86_64-unknown-linux-gnu.zip" \
  && echo "${CONVEX_SHA256}  /tmp/backend.zip" | sha256sum -c - \
  && unzip -q /tmp/backend.zip -d /usr/local/bin \
  && chmod 755 /usr/local/bin/convex-local-backend \
  && rm /tmp/backend.zip

ARG LITESTREAM_VERSION=0.5.6
ARG LITESTREAM_SHA256=959f72ef0b28acf2d7785c622df4936f7813a381931366ef732157048a5a45e5
RUN curl -fsSL -o /tmp/litestream.tar.gz \
    "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz" \
  && echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
  && rm /tmp/litestream.tar.gz

COPY litestream-restore.yml litestream-replicate.yml /etc/litestream/
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

# Changing IMAGE_REVISION produces a new image, which is how the rollout test replaces the container.
ARG IMAGE_REVISION=1
ENV IMAGE_REVISION=${IMAGE_REVISION}

EXPOSE 3210 3211
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
