FROM node:22-bookworm AS openclaw-build

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git ca-certificates curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /openclaw

ARG OPENCLAW_GIT_REF=main
RUN git clone --depth 1 --branch "${OPENCLAW_GIT_REF}" https://github.com/openclaw/openclaw.git .

RUN find ./extensions -name 'package.json' -type f -exec \
  sed -i 's/"openclaw": "[^"]*"/"openclaw": "*"/g' {} +

ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm install --no-frozen-lockfile && pnpm build && pnpm ui:install && pnpm ui:build


# Build setup UI
FROM node:22-bookworm AS ui-build

WORKDIR /ui
COPY ui/package.json ./
RUN npm install
COPY ui ./
RUN npm run build


# Install Homebrew
FROM node:22-bookworm AS linuxbrew-install

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential procps curl file git sudo \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -s /bin/bash linuxbrew \
  && echo 'linuxbrew ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER linuxbrew
WORKDIR /home/linuxbrew
RUN NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"


# Runtime image
FROM node:22-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates build-essential procps curl file git tini \
    chromium fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Chromium binary path for OpenClaw browser tool
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

RUN npm install -g clawhub@latest && clawhub install sonoscli

COPY --from=openclaw-build /openclaw /openclaw
COPY --from=linuxbrew-install /home/linuxbrew/.linuxbrew /home/linuxbrew/.linuxbrew

RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /openclaw/dist/entry.js "$@"' > /usr/local/bin/openclaw \
  && chmod +x /usr/local/bin/openclaw \
  && useradd -m -s /bin/bash linuxbrew \
  && chown -R linuxbrew:linuxbrew /home/linuxbrew \
  && printf '%s\n' \
    '#!/bin/bash' \
    'export HOME=/home/linuxbrew' \
    'export HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew' \
    'export HOMEBREW_CELLAR=/home/linuxbrew/.linuxbrew/Cellar' \
    'export HOMEBREW_REPOSITORY=/home/linuxbrew/.linuxbrew/Homebrew' \
    'export PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH' \
    'exec su linuxbrew -s /bin/bash -c "/home/linuxbrew/.linuxbrew/bin/brew $*"' \
    > /usr/local/bin/brew \
  && chmod +x /usr/local/bin/brew

ENV NODE_ENV=production \
    HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew \
    HOMEBREW_CELLAR=/home/linuxbrew/.linuxbrew/Cellar \
    HOMEBREW_REPOSITORY=/home/linuxbrew/.linuxbrew/Homebrew \
    HOMEBREW_NO_AUTO_UPDATE=1 \
    HOMEBREW_NO_ANALYTICS=1 \
    HOMEBREW_NO_INSTALL_CLEANUP=1 \
    PATH=/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH \
    OPENCLAW_PUBLIC_PORT=8080 \
    PORT=8080

COPY --from=ui-build /ui/dist ./ui/dist
COPY scripts ./scripts
COPY src ./src
COPY --chmod=755 scripts/entrypoint.sh /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "src/server.js"]
