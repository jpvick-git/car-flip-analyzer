FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------
# Install Microsoft ODBC Driver 18 for SQL Server
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y curl gnupg2 ca-certificates apt-transport-https software-properties-common && \
    curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
      > /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev && \
    rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Python dependencies
# --------------------------------------------------
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# --------------------------------------------------
# Copy app
# --------------------------------------------------
COPY . /app
WORKDIR /app

# --------------------------------------------------
# Start app
# --------------------------------------------------
ENV PORT=10000
EXPOSE 10000
CMD ["uvicorn", "backend.backend_api:app", "--host", "0.0.0.0", "--port", "10000"]
