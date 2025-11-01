# --------------------------------------------------
# Base image
# --------------------------------------------------
FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------
# Install dependencies and Microsoft ODBC Driver 18 manually
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y curl gnupg2 unixodbc unixodbc-dev libgssapi-krb5-2 && \
    curl -fsSL -o /tmp/msodbcsql18.deb \
        https://packages.microsoft.com/ubuntu/22.04/prod/pool/main/m/msodbcsql18/msodbcsql18_18.3.2.1-1_amd64.deb && \
    dpkg -i /tmp/msodbcsql18.deb || apt-get -f install -y && \
    rm /tmp/msodbcsql18.deb && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Manually register the ODBC driver (critical for Render)
# --------------------------------------------------
RUN echo "[ODBC Drivers]" > /etc/odbcinst.ini && \
    echo "ODBC Driver 18 for SQL Server=Installed" >> /etc/odbcinst.ini && \
    echo "[ODBC Driver 18 for SQL Server]" >> /etc/odbcinst.ini && \
    echo "Description=Microsoft ODBC Driver 18 for SQL Server" >> /etc/odbcinst.ini && \
    echo "Driver=/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.3.so.1.1" >> /etc/odbcinst.ini && \
    echo "UsageCount=1" >> /etc/odbcinst.ini

# --------------------------------------------------
# Verify the driver is visible
# --------------------------------------------------
RUN echo "🧩 Verifying ODBC Driver install..." && \
    cat /etc/odbcinst.ini && \
    ls -l /opt/microsoft/msodbcsql18/lib64/ && \
    odbcinst -q -d || true

# --------------------------------------------------
# Set ODBC environment variables
# --------------------------------------------------
ENV ODBCINI=/etc/odbc.ini
ENV ODBCSYSINI=/etc
ENV LD_LIBRARY_PATH=/opt/microsoft/msodbcsql18/lib64:${LD_LIBRARY_PATH}

# --------------------------------------------------
# App setup
# --------------------------------------------------
WORKDIR /app
COPY . /app

RUN pip install --upgrade pip && pip install -r requirements.txt

EXPOSE 10000

# --------------------------------------------------
# Start your FastAPI backend
# --------------------------------------------------
CMD ["uvicorn", "backend.backend_api:app", "--host", "0.0.0.0", "--port", "10000"]
