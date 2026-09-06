FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY kumasi_transit ./kumasi_transit
COPY data ./data
RUN pip install --no-cache-dir ".[postgres]"
EXPOSE 8000
CMD ["kumasi-transit", "serve", "--host", "0.0.0.0", "--port", "8000"]
