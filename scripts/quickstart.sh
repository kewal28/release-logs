#!/bin/bash

# Release Log Quick Start Script
# This script helps you get up and running quickly

set -e

echo "🚀 Release Log Quick Start"
echo "=========================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if MySQL is installed
if ! command -v mysql &> /dev/null; then
    echo "⚠️  MySQL is not installed. You'll need to install MySQL 8.0+ or use Docker."
    echo "   For Docker setup, run: docker-compose up -d"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file from template..."
    cp env.example .env
    echo "📝 Please edit .env file with your configuration before continuing."
    echo "   Key settings to configure:"
    echo "   - DB_PASSWORD: Your MySQL password"
    echo "   - JWT_SECRET: A secure random string"
    echo "   - AWS credentials (optional)"
    echo ""
    read -p "Press Enter after you've configured .env file..."
else
    echo "✅ .env file already exists"
fi

# Setup database
echo "🗄️  Setting up database..."
npm run setup

# Create uploads directory
echo "📁 Creating uploads directory..."
mkdir -p uploads

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Open http://localhost:3000 for the public site"
echo "3. Open http://localhost:3000/admin for the admin panel"
echo "4. Login with: admin / admin123"
echo ""
echo "For production deployment:"
echo "- Use Docker: docker-compose up -d"
echo "- Configure environment variables"
echo "- Set up SSL certificates"
echo ""
echo "📚 Documentation: http://localhost:3000/api-docs" 