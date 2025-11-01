#!/usr/bin/env bash
set -e
echo "🚀 Starting Render build setup..."

# -----------------------------------------------------------
# CREATE LOCAL DRIVER DIRECTORY
# -----------------------------------------------------------
mkdir -p backend/odbc
cd backend/odbc

# -----------------------------------------------------------
# DOWNLOAD AND EXTRACT MS ODBC DRIVER 18 FOR SQL SERVER
# (Render runs on Debian/Ubuntu, no root needed)
# -----------------------------------------------------------
echo "📦 Downloading Microsoft ODBC Driver 18 for SQL Server (Debian package)..."
curl -fsSL -o msodbcsql18.deb \
  https://packages.microsoft.com/ubuntu/22.04/prod/pool/main/m/msodbcsql18/msodbcsql18_18.3.2.1-1_amd64.deb

echo "📂 Extracting files from the .deb package..."
dpkg -x msodbcsql18.deb .

# -----------------------------------------------------------
# EXPORT DRIVER PATH SO PYODBC CAN FIND IT
# -----------------------------------------------------------
echo "📦 Setting ODBC environment paths..."
echo "export LD_LIBRARY_PATH=/opt/render/project/src/backend/odbc/usr/lib/x86_64-linux-gnu:\$LD_LIBRARY_PATH" >> $RENDER_OUTPUT_FILE
echo "export ODBCINSTINI=/opt/render/project/src/backend/odbc/etc/odbcinst.ini" >> $RENDER_OUTPUT_FILE
echo "export ODBCSYSINI=/opt/render/project/src/backend/odbc/etc" >> $RENDER_OUTPUT_FILE

# -----------------------------------------------------------
# VERIFY LIBRARY FILES
# -----------------------------------------------------------
echo "✅ Driver extracted locally to $(pwd)"

# -----------------------------------------------------------
# GO BACK TO ROOT AND INSTALL PYTHON REQUIREMENTS
# -----------------------------------------------------------
cd ../..
echo "🐍 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete!"
