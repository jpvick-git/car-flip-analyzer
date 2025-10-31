#!/usr/bin/env bash
set -e

echo "🚀 Render build: Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt

echo "✅ Build complete!"
