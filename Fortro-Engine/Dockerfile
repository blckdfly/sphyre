# Dockerfile for Rust application
# Stage 1: Build the application
FROM rustlang/rust:nightly AS builder

# Add build argument to invalidate cache when needed
# Usage: docker build --build-arg CACHE_BUST=$(date +%s) -t fortro-engine .
ARG CACHE_BUST=1

WORKDIR /app

# Print Rust and Cargo versions for debugging
RUN rustc --version && cargo --version

# Use CACHE_BUST to invalidate cache when needed
RUN echo "Cache bust: ${CACHE_BUST}"

# Install build dependencies
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy Cargo files for dependency caching
COPY Cargo.toml Cargo.lock ./

# Create a minimal project structure for dependency caching
RUN mkdir -p src && \
    echo 'fn main() { println!("Dependency cache initialized"); }' > src/main.rs && \
    # Use --locked flag to ensure Cargo uses the exact versions in Cargo.lock
    cargo build --release --locked && \
    rm -rf src

# Copy the actual source code
COPY . .

# Build the application
RUN cargo build --release --locked

# Stage 2: Create a smaller runtime image
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y libssl3 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy the binary from the builder stage
COPY --from=builder /app/target/release/fortro-engine /app/fortro-engine

# Create an empty .env file (will be overridden by environment variables in docker-compose)
RUN touch .env

# Expose the port the app will run on
EXPOSE 3000

# Run the binary
CMD ["./fortro-engine"]