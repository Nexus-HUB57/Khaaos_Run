FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY scripts/operative-synergy-sim.py /app/scripts/operative-synergy-sim.py
COPY tools/operative-synergy-dashboard/ /app/tools/operative-synergy-dashboard/
RUN python -m pip install --no-cache-dir -r tools/operative-synergy-dashboard/requirements.txt

EXPOSE 3000
CMD ["sh", "-c", "exec python -m uvicorn app:app --app-dir tools/operative-synergy-dashboard --host 0.0.0.0 --port ${PORT:-3000}"]
