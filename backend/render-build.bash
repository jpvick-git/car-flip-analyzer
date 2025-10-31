#!/usr/bin/env bash
set -eux

# Update package list and install Microsoft ODBC Driver 18 for SQL Server
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update
ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev

# (Optional) confirm install
odbcinst -q -d

# Then install Python deps
pip install -r requirements.txt
