FROM node:22-bookworm

ENV PYTHONUNBUFFERED=1 \
    APPLE_BROWSER_CHANNEL=chromium \
    STOCK_INTERVAL_SECONDS=60 \
    PORT=3000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY agent/requirements.txt agent/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r agent/requirements.txt \
    && /opt/venv/bin/playwright install --with-deps chromium

COPY . .
RUN pnpm run build

EXPOSE 3000

CMD ["/opt/venv/bin/python", "agent/cloud_supervisor.py"]
