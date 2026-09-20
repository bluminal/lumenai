ARG NODE_IMAGE=node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e
FROM ${NODE_IMAGE}

ARG HARNESS_VERSION
RUN test -n "${HARNESS_VERSION}" \
    && npm install --global --no-audit --no-fund "@google/gemini-cli@${HARNESS_VERSION}" \
    && gemini --version \
    && useradd --create-home --home-dir /home/synthex-test --uid 10001 synthex-test

COPY --chown=root:root . /opt/synthex-compat

USER 10001:10001
WORKDIR /workspace

ENTRYPOINT ["node", "/opt/synthex-compat/scenarios/gemini-offline.mjs"]
