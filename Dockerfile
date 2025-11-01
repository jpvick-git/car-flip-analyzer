# --------------------------------------------------
# Base image
# --------------------------------------------------
FROM python:3.12-bullseye

ENV DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------
# Install Microsoft SQL Server ODBC Driver 18 + dependencies
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y curl gnupg2 apt-transport-https ca-certificates unixodbc unixodbc-dev && \
    curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /etc/apt/trusted.gpg.d/microsoft.gpg && \
    curl https://packages.microsoft.com/config/debian/11/prod.list -o /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y msodbcsql18 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Verify driver install (important for Render)
# --------------------------------------------------
RUN echo "🧩 Checking installed ODBC drivers..." && \
    odbcinst -q -d || echo "⚠️ No drivers found in odbcinst.ini" && \
    ls -l /opt/microsoft/msodbcsql18/lib64/ || echo "⚠️ Driver library missing!"

# --------------------------------------------------
# Environment variables for ODBC
# --------------------------------------------------
ENV ODBCINI=/etc/odbc.ini
ENV ODBCSYSINI=/etc
ENV LD_LIBRARY_PATH=/opt/microsoft/msodbcsql18/lib64:${LD_LIBRARY_PATH}

# --------------------------------------------------
# Create app directory
# --------------------------------------------------
WORKDIR /app
COPY . /app

# --------------------------------------------------
# Install Python dependencies
# --------------------------------------------------
RUN pip install --upgrade pip && pip install -r requirements.txt

# --------------------------------------------------
# Expose API port
# --------------------------------------------------
EXPOSE 10000

# --------------------------------------------------
# Start FastAPI app
# --------------------------------------------------
CMD ["uvicorn", "backend.backend_api:app", "--host", "0.0.0.0", "--port", "10000"]
