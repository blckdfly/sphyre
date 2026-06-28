FROM rust:1.90-bookworm AS builder
RUN rustup update stable && rustup default stable
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cargo build --release -p fortro-engine --all-features || \
  cargo build --release --bin fortro-engine --all-features

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/fortro-engine /usr/local/bin/fortro-engine
EXPOSE 3000
ENV RUST_LOG=info
HEALTHCHECK --interval=10s --timeout=3s --retries=15 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["/usr/local/bin/fortro-engine"]
CMD ["serve","--host","0.0.0.0","--port","3000"]
