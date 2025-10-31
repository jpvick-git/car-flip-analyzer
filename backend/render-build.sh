#!/usr/bin/env bash
set -e

echo "🚀 Starting Render build setup..."

# Install ODBC Driver 18 for SQL Server in user space (works without root)
echo "📦 Downloading Microsoft ODBC Driver 18 for SQL Server..."
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
mv microsoft.gpg /tmp/microsoft.gpg
mkdir -p ~/.local/lib
mkdir -p ~/.local/etc/odbcinst.ini.d

# Download & extract driver
curl -fsSL -o msodbcsql18.tar.gz https://download.microsoft.com/download/d/4/6/d46b9e52-5d0d-4966-8d1d-6f2f490a80e6/msodbcsql18-18.2.2.1.tar.gz
tar -xzf msodbcsql18.tar.gz -C ~/.local/lib/
rm msodbcsql18.tar.gz

echo "✅ ODBC Driver 18 installed to ~/.local/lib"

# Make sure pyodbc can find it
export ODBCINSTINI=~/.local/etc/odbcinst.ini.d/odbcinst.ini

# Install Python dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

echo "✅ Build complete!"
