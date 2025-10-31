#!/usr/bin/env bash
set -e

echo "🚀 Starting Render build setup..."

# Create a local folder for the ODBC driver
mkdir -p /opt/odbc
cd /opt/odbc

echo "📦 Downloading Microsoft ODBC Driver 18 for SQL Server..."
curl -L -o msodbcsql18.tar.gz https://aka.ms/msodbcsql18/linux/ubuntu/22.04/x64/msodbcsql18.tar.gz

echo "📂 Extracting..."
tar -xzf msodbcsql18.tar.gz
rm msodbcsql18.tar.gz

echo "✅ Driver extracted to /opt/odbc"
export LD_LIBRARY_PATH=/opt/odbc:$LD_LIBRARY_PATH
export ODBCINSTINI=/opt/odbc/odbcinst.ini

# Go back to backend directory
cd /opt/render/project/src/backend

echo "🐍 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
