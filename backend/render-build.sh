#!/usr/bin/env bash
set -eux

echo "🚀 Starting Render build setup..."

# Update and install system dependencies
apt-get update && apt-get install -y curl gnupg apt-transport-https unixodbc-dev

# Install ODBC Driver 18 for SQL Server
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql18

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
