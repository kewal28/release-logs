#!/bin/bash

# Domain Setup Script for Release Log
# This script helps configure the application for a specific domain

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

print_status "Release Log Domain Setup"
echo "================================"

# Get domain information
read -p "Enter your domain name (e.g., changelog.example.com): " DOMAIN
read -p "Enter your domain without www (e.g., example.com): " DOMAIN_BASE
read -p "Do you want to use HTTPS? (y/n): " USE_HTTPS

if [[ $USE_HTTPS == "y" || $USE_HTTPS == "Y" ]]; then
    PROTOCOL="https"
    BASE_URL="https://${DOMAIN}"
else
    PROTOCOL="http"
    BASE_URL="http://${DOMAIN}"
fi

# Validate domain format
if [[ ! $DOMAIN =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]]; then
    print_error "Invalid domain format"
    exit 1
fi

print_status "Configuring environment variables..."

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp env.example .env
fi

# Update .env file with domain settings
sed -i.bak "s|BASE_URL=.*|BASE_URL=${BASE_URL}|g" .env
sed -i.bak "s|DOMAIN=.*|DOMAIN=${DOMAIN_BASE}|g" .env
sed -i.bak "s|PROTOCOL=.*|PROTOCOL=${PROTOCOL}|g" .env

# Update Nginx configuration
print_status "Updating Nginx configuration..."

# Create nginx directory if it doesn't exist
mkdir -p nginx/ssl

# Update nginx.conf with domain
sed -i.bak "s|\${DOMAIN}|${DOMAIN_BASE}|g" nginx.conf

print_status "Setting up SSL certificates..."

if [[ $USE_HTTPS == "y" || $USE_HTTPS == "Y" ]]; then
    print_warning "SSL certificate setup required:"
    echo "1. Place your SSL certificate at: nginx/ssl/cert.pem"
    echo "2. Place your private key at: nginx/ssl/key.pem"
    echo ""
    echo "Or use Let's Encrypt:"
    echo "sudo certbot certonly --standalone -d ${DOMAIN} -d www.${DOMAIN}"
    echo "sudo cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem nginx/ssl/cert.pem"
    echo "sudo cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem nginx/ssl/key.pem"
fi

print_status "Updating database configuration..."

# Update database host if not using localhost
read -p "Is your database on the same server? (y/n): " DB_LOCAL

if [[ $DB_LOCAL != "y" && $DB_LOCAL != "Y" ]]; then
    read -p "Enter database host: " DB_HOST
    read -p "Enter database port (default: 3306): " DB_PORT
    DB_PORT=${DB_PORT:-3306}
    
    sed -i.bak "s|DB_HOST=.*|DB_HOST=${DB_HOST}|g" .env
    sed -i.bak "s|DB_PORT=.*|DB_PORT=${DB_PORT}|g" .env
fi

print_status "Checking required ports..."

# Check if ports are available
if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null ; then
    print_warning "Port 80 is already in use. Make sure Nginx is configured correctly."
fi

if lsof -Pi :443 -sTCP:LISTEN -t >/dev/null ; then
    print_warning "Port 443 is already in use. Make sure Nginx is configured correctly."
fi

print_success "Domain configuration completed!"
echo ""
echo "=== Configuration Summary ==="
echo "Domain: ${DOMAIN}"
echo "Base URL: ${BASE_URL}"
echo "Protocol: ${PROTOCOL}"
echo "Database Host: $(grep DB_HOST .env | cut -d'=' -f2)"
echo ""
echo "=== Next Steps ==="
echo "1. Update your DNS records to point ${DOMAIN} to this server"
echo "2. If using HTTPS, ensure SSL certificates are in place"
echo "3. Run: docker-compose up -d"
echo "4. Test your site at: ${BASE_URL}"
echo ""
echo "=== Important Notes ==="
echo "- Make sure ports 80 and 443 are open in your firewall"
echo "- Update your JWT_SECRET in .env for production"
echo "- Consider setting up automatic SSL renewal with Let's Encrypt"
echo "- Review and update other environment variables as needed"

# Clean up backup files
rm -f .env.bak nginx.conf.bak

print_success "Setup complete! Review the configuration and start your application." 