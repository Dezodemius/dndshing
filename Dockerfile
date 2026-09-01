FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
# Справочный контент едет в образе: при первом старте им наполняется том
# content_data (docker-compose.yml), дальше файл живёт в томе и его правит
# админка импорта.
COPY content ./content

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
