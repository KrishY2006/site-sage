#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing Node dependencies..."
npm install

echo "Installing Python dependencies for the scraper..."
# Install pip dependencies (assuming your scraper has a requirements.txt)
pip install -r scraper/requirements.txt