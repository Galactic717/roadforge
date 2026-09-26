FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ROADFORGE_DATA_DIR=/app/data

WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
COPY web ./web
COPY data/pretrained_model.json ./data/pretrained_model.json
RUN pip install --no-cache-dir .

EXPOSE 8765
CMD ["roadforge", "serve", "--host", "0.0.0.0", "--port", "8765"]
