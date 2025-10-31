#!/usr/bin/env bash
set -eux

echo "🚀 Starting Render build script..."

# Update package list and install curl/gnupg
apt-get update -y
apt-get install -y curl gnupg apt-transport-https unixodbc-dev

# Add Microsoft’s official ODBC repo
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list

# Install the driver and tools
apt-get update -y
ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18

# Optional: Verify installation
echo "✅ Installed ODBC drivers:"
odbcinst -q -d

# Make sure uvicorn and dependencies are installed
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
