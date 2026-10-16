# The Convex backend for local and e2e launches, built from Convex's precompiled release.
# Convex's own ghcr.io images refused anonymous pulls from 16 Oct 2026, so this rebuilds their
# self-hosted image from the same release binary the native hosted-play runner uses
# (scripts/verify-hosted-play-stack.ts). Bump PRECOMPILED_RELEASE and both digests together.
FROM buildpack-deps:noble-curl@sha256:48a80dfb7e2f2d1e93dbfff934fd2f187f306eef36cb5359ef8bba0ffe9205b3 AS fetch
ARG TARGETARCH
ARG PRECOMPILED_RELEASE=precompiled-2026-10-06-a3538c6
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends unzip > /dev/null \
  && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
  case "$TARGETARCH" in \
    amd64) triple=x86_64-unknown-linux-gnu; digest=eba2eeab62632e0c153e83f9f1c5ada9e98834e2db3386e32f825a3a97f8c093 ;; \
    arm64) triple=aarch64-unknown-linux-gnu; digest=d3bf1d8799d91cecabe144ee2c96348c903ec3f5f88199f375004647b037cc35 ;; \
    *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl --fail --location --silent --show-error --retry 3 --output /tmp/backend.zip \
    "https://github.com/get-convex/convex-backend/releases/download/$PRECOMPILED_RELEASE/convex-local-backend-$triple.zip"; \
  echo "$digest  /tmp/backend.zip" | sha256sum -c -; \
  unzip -q /tmp/backend.zip -d /out; \
  chmod 755 /out/convex-local-backend

# Same layout and entrypoint as Convex's self-hosted image, so compose and scripts/provision.ts are unchanged.
FROM buildpack-deps:noble-curl@sha256:48a80dfb7e2f2d1e93dbfff934fd2f187f306eef36cb5359ef8bba0ffe9205b3
WORKDIR /convex
COPY --from=fetch /out/convex-local-backend ./convex-local-backend
COPY --chmod=755 read_credentials.sh run_backend.sh generate_admin_key.sh ./
VOLUME /convex/data
ENTRYPOINT ["./run_backend.sh"]
EXPOSE 3210 3211
