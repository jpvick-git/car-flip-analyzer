# --------------------------------------------------
# Base image
# --------------------------------------------------
FROM python:3.12-bullseye

# Prevents tzdata from prompting
ENV DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------
# Install dependencies for ODBC + pyodbc + MS SQL
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y curl gnupg2 apt-transport-https ca-certificates && \
    curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /etc/apt/trusted.gpg.d/microsoft.gpg && \
    curl https://packages.microsoft.com/config/debian/11/prod.list -o /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Create app directory
# --------------------------------------------------
WORKDIR /app
COPY . /app

# --------------------------------------------------
# Install Python requirements
# --------------------------------------------------
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# --------------------------------------------------
# Expose port
# --------------------------------------------------
EXPOSE 10000

# --------------------------------------------------
# Start app
# --------------------------------------------------
CMD ["uvicorn", "backend_api:app", "--host", "0.0.0.0", "--port", "10000"]
