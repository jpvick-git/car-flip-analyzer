#!/usr/bin/env bash
set -e

echo "🚀 Starting Render build setup..."

# Install Microsoft ODBC Driver 18 for SQL Server (Ubuntu 22.04)
echo "📦 Downloading and installing Microsoft ODBC Driver 18 for SQL Server..."
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list

apt-get update
ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev

echo "✅ ODBC Driver 18 installed."

# Install Python dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

echo "✅ Build complete!"
