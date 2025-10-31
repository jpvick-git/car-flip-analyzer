#!/usr/bin/env bash
set -e

echo "🚀 Starting Render build setup..."

# Work inside the app folder (writeable)
ODBC_DIR="/opt/render/project/src/backend/odbc"
mkdir -p "$ODBC_DIR"
cd "$ODBC_DIR"

echo "📦 Downloading Microsoft ODBC Driver 18 for SQL Server (Ubuntu 22.04)..."
curl -L -o msodbcsql18.tar.gz https://aka.ms/msodbcsql18/linux/ubuntu/22.04/x64/msodbcsql18.tar.gz

echo "📂 Extracting driver..."
tar -xzf msodbcsql18.tar.gz
rm msodbcsql18.tar.gz

echo "✅ Driver extracted to $ODBC_DIR"

# Make sure Python and pyodbc can find the driver at runtime
export LD_LIBRARY_PATH="$ODBC_DIR:$LD_LIBRARY_PATH"
export ODBCINSTINI="$ODBC_DIR/odbcinst.ini"

# Return to backend root for dependency install
cd /opt/render/project/src/backend

echo "🐍 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
