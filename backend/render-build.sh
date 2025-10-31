#!/usr/bin/env bash
set -e

echo "🚀 Starting Render build setup..."

# Create a local ODBC install folder
ODBC_DIR="/opt/render/project/src/backend/odbc"
mkdir -p "$ODBC_DIR"
cd "$ODBC_DIR"

echo "📦 Downloading Microsoft ODBC Driver 18 for SQL Server (Debian package)..."
curl -L -o msodbcsql18.deb https://packages.microsoft.com/ubuntu/22.04/prod/pool/main/m/msodbcsql18/msodbcsql18_18.3.3.1-1_amd64.deb

echo "📂 Extracting files from the .deb package..."
dpkg-deb -x msodbcsql18.deb "$ODBC_DIR"
rm msodbcsql18.deb

echo "✅ Driver extracted locally to $ODBC_DIR"

# Export local path so pyodbc can find it
export LD_LIBRARY_PATH="$ODBC_DIR/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
export ODBCINSTINI="$ODBC_DIR/usr/share/msodbcsql18/odbcinst.ini"

# Move back to backend root
cd /opt/render/project/src/backend

echo "🐍 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
