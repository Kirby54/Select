# syntax=docker/dockerfile:1.7
# Select API and worker (same image, different command).
# Standard minor tags; pin them by digest (e.g. with Renovate) for reproducible production images.
FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN pip install --no-cache-dir uv==0.11.32
WORKDIR /app

# Dependencies first, from the lockfile only, so code changes do not reinstall them.
COPY pyproject.toml uv.lock ./
COPY packages/select-verify/pyproject.toml packages/select-verify/README.md packages/select-verify/
COPY apps/api/pyproject.toml apps/api/
RUN mkdir -p packages/select-verify/select_verify apps/api/select_api \
 && touch packages/select-verify/select_verify/__init__.py apps/api/select_api/__init__.py \
 && uv sync --frozen --no-dev --all-packages --no-install-workspace

COPY packages/select-verify packages/select-verify
COPY apps/api apps/api
COPY contracts contracts
COPY packs packs
RUN uv sync --frozen --no-dev --all-packages

RUN useradd --create-home --uid 10001 select && mkdir -p /data && chown select /data
USER select
ENV PATH="/app/.venv/bin:$PATH" \
    SELECT_DATA_DIR=/data \
    SELECT_CONTRACTS_DIR=/app/contracts \
    SELECT_PACKS_DIR=/app/packs
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"
CMD ["select-api", "serve", "--host", "0.0.0.0", "--port", "8000", "--migrate"]
