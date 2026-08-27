#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing Node dependencies..."
npm install

echo "Installing Python dependencies for the scraper..."
# This correctly reads the pyproject.toml instead of looking for requirements.txt
pip install ./scraper