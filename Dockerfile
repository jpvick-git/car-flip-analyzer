# Use a small base image that supports Microsoft ODBC
FROM python:3.12-slim

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------
# Install dependencies and the Microsoft ODBC driver
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y curl gnupg2 apt-transport-https && \
    curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    curl https://packages.microsoft.com/config/debian/12/prod.list \
        -o /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev && \
    rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Install Python packages
# --------------------------------------------------
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# --------------------------------------------------
# Copy the backend code into the container
# --------------------------------------------------
COPY . /app
WORKDIR /app

# --------------------------------------------------
# Expose port and start FastAPI
# --------------------------------------------------
ENV PORT=10000
EXPOSE 10000
CMD ["uvicorn", "backend.backend_api:app", "--host", "0.0.0.0", "--port", "10000"]
