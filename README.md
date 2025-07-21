# Release Log - Changelog Management System

A modern, open-source changelog management application built with Node.js, Express, React, and MySQL. Features include admin panel, user management, rich text editing, image uploads, voting, comments, and customizable branding.

## 🚀 Features

### Core Features
- **Changelog Management**: Create, edit, publish, and manage changelogs with draft/published states
- **Rich Text Editor**: WYSIWYG editor with formatting, lists, and image uploads
- **Role-Based Access**: Admin and regular user roles with appropriate permissions
- **Image Support**: Local and AWS S3 storage options with CloudFront CDN support
- **Voting System**: Upvote/downvote changelogs with IP-based tracking
- **Comments**: Public comments with spam prevention and admin moderation
- **Customizable Branding**: Company name, logo, themes, and timezone settings

### Admin Features
- **User Management**: Add, edit, delete team members with role assignment
- **Comment Moderation**: Approve/reject comments with email notifications
- **Settings Management**: SMTP, S3, appearance, and notification settings
- **Analytics**: View changelog statistics and engagement metrics

### Public Features
- **Public Changelog**: Browse published changelogs without login
- **Voting**: Vote on changelogs (no account required)
- **Comments**: Leave comments with email verification
- **Responsive Design**: Mobile-friendly interface

## 📋 Prerequisites

- Node.js 16+ 
- MySQL 8.0+ or MariaDB 10.5+
- npm or yarn
- Git

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd release-log
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=release_log

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development

# File Upload Configuration
UPLOAD_PATH=uploads
MAX_FILE_SIZE=5242880

# SMTP Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_SECURE=true

# AWS S3 Configuration (Optional)
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_CLOUDFRONT_URL=https://your-cloudfront-domain.cloudfront.net

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Spam Prevention
HONEYPOT_FIELD_NAME=_gotcha
MAX_COMMENTS_PER_IP=10
MAX_VOTES_PER_IP=50
```

### 4. Rate Limiting Configuration

The application includes comprehensive rate limiting to protect against abuse while ensuring good user experience. Here are the current limits:

#### Application Level Rate Limits

| **Endpoint Type** | **Window** | **Limit** | **Requests per Minute** |
|-------------------|------------|-----------|-------------------------|
| **General API** | 15 minutes | 1000 requests | ~67 req/min |
| **Voting** | 1 hour | 200 votes | ~3.3 votes/min |
| **Comments** | 1 hour | 20 comments | ~0.33 comments/min |
| **Login** | 15 minutes | 20 attempts | ~1.3 attempts/min |
| **Admin** | 15 minutes | 500 requests | ~33 req/min |

#### Nginx Level Rate Limits

| **Endpoint Type** | **Rate** | **Burst** | **Description** |
|-------------------|----------|-----------|-----------------|
| **API Routes** | 50 req/sec | 100 | General API endpoints |
| **Login** | 20 req/min | 20 | Authentication endpoints |

#### Customizing Rate Limits

To adjust rate limits, update your `.env` file:

```bash
# Increase general API limit
RATE_LIMIT_MAX_REQUESTS=2000

# Adjust time window (in milliseconds)
RATE_LIMIT_WINDOW_MS=1800000  # 30 minutes
```

For more granular control, edit `src/middleware/rateLimit.js`:

```javascript
// Example: Increase voting limit
const voteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // 500 votes per hour
});

// Example: Increase comment limit
const commentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 comments per hour
});
```

#### Rate Limit Headers

The application includes rate limit information in HTTP headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1640995200
```

#### Monitoring Rate Limits

Check rate limit usage:

```bash
# Check current usage
curl -I http://localhost:3000/api/changelogs

# Monitor rate limit violations
tail -f logs/app.log | grep "Too many requests"
```

> **📖 For detailed rate limit configuration and troubleshooting, see [RATE_LIMITS.md](RATE_LIMITS.md)**

### 5. Database Setup

#### Option A: Using MySQL Command Line

```bash
mysql -u root -p
```

```sql
CREATE DATABASE release_log CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'release_log_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON release_log.* TO 'release_log_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Option B: Using the Provided SQL File

```bash
mysql -u root -p < database/schema.sql
```

### 6. Start the Application

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The application will be available at:
- **Admin Panel**: http://localhost:3000/admin
- **Public Site**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api-docs

### 7. Default Login

- **Username**: admin
- **Password**: admin123

**Important**: Change the default password after first login!

## 🐳 Docker Setup

### Using Docker Compose (Recommended)

1. Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=db
      - DB_USER=release_log_user
      - DB_PASSWORD=release_log_password
      - DB_NAME=release_log
      - JWT_SECRET=your_super_secret_jwt_key_here
      - NODE_ENV=production
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root_password
      - MYSQL_DATABASE=release_log
      - MYSQL_USER=release_log_user
      - MYSQL_PASSWORD=release_log_password
    volumes:
      - mysql_data:/var/lib/mysql
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "3306:3306"
    restart: unless-stopped

volumes:
  mysql_data:
```

2. Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads logs

EXPOSE 3000

CMD ["npm", "start"]
```

3. Run with Docker Compose:

```bash
docker-compose up -d
```

### Using Docker Only

```bash
# Build the image
docker build -t release-log .

# Run the container
docker run -d \
  --name release-log \
  -p 3000:3000 \
  -e DB_HOST=your_db_host \
  -e DB_USER=your_db_user \
  -e DB_PASSWORD=your_db_password \
  -e DB_NAME=release_log \
  -e JWT_SECRET=your_jwt_secret \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/logs:/app/logs \
  release-log
```

## 🌐 Web Server Setup

### Apache Configuration

1. Install Apache and mod_proxy:

```bash
# Ubuntu/Debian
sudo apt-get install apache2 libapache2-mod-proxy-html

# CentOS/RHEL
sudo yum install httpd mod_proxy_html
```

2. Create Virtual Host Configuration:

```apache
# /etc/apache2/sites-available/release-log.conf
<VirtualHost *:80>
    ServerName your-domain.com
    ServerAlias www.your-domain.com
    
    # Redirect HTTP to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com
    ServerAlias www.your-domain.com
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /path/to/your/certificate.crt
    SSLCertificateKeyFile /path/to/your/private.key
    SSLCertificateChainFile /path/to/your/chain.crt
    
    # Proxy Configuration
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    # File Upload Configuration
    ProxyPass /uploads http://localhost:3000/uploads
    ProxyPassReverse /uploads http://localhost:3000/uploads
    
    # Logs
    ErrorLog ${APACHE_LOG_DIR}/release-log_error.log
    CustomLog ${APACHE_LOG_DIR}/release-log_access.log combined
    
    # Security Headers
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
</VirtualHost>
```

3. Enable the site and modules:

```bash
sudo a2ensite release-log
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod ssl
sudo a2enmod rewrite
sudo systemctl reload apache2
```

### Nginx Configuration

1. Install Nginx:

```bash
# Ubuntu/Debian
sudo apt-get install nginx

# CentOS/RHEL
sudo yum install nginx
```

2. Create Nginx Configuration:

```nginx
# /etc/nginx/sites-available/release-log
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # File Upload Size
    client_max_body_size 10M;
    
    # Proxy Configuration
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # Static Files
    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Logs
    access_log /var/log/nginx/release-log_access.log;
    error_log /var/log/nginx/release-log_error.log;
}
```

3. Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/release-log /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 📊 Database Structure

### Core Tables

```sql
-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Changelogs table
CREATE TABLE changelogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    label ENUM('feature', 'bug', 'optimization') NOT NULL,
    status ENUM('draft', 'published') DEFAULT 'draft',
    author_id INT NOT NULL,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Images table
CREATE TABLE images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INT NOT NULL,
    storage_type ENUM('local', 's3') DEFAULT 'local',
    s3_key VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
);

-- Votes table
CREATE TABLE votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    vote_type ENUM('upvote', 'downvote') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vote (changelog_id, ip_address)
);

-- Comments table
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_email VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
);

-- Settings table
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'json', 'boolean', 'number') DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## 🔍 Logging & Monitoring

### Application Logs

```bash
# View application logs
tail -f logs/app.log

# View error logs
tail -f logs/error.log

# View access logs
tail -f logs/access.log
```

### Database Logs

```bash
# MySQL logs
sudo tail -f /var/log/mysql/error.log
sudo tail -f /var/log/mysql/slow.log

# Docker MySQL logs
docker logs release-log_db_1
```

### Web Server Logs

```bash
# Apache logs
sudo tail -f /var/log/apache2/release-log_error.log
sudo tail -f /var/log/apache2/release-log_access.log

# Nginx logs
sudo tail -f /var/log/nginx/release-log_error.log
sudo tail -f /var/log/nginx/release-log_access.log
```

### Docker Logs

```bash
# View all container logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app
docker-compose logs -f db
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Database Connection Issues

```bash
# Check MySQL status
sudo systemctl status mysql

# Test database connection
mysql -u root -p -e "SHOW DATABASES;"

# Check database user permissions
mysql -u root -p -e "SHOW GRANTS FOR 'release_log_user'@'localhost';"
```

#### 2. Port Already in Use

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Or change the port in .env
PORT=3001
```

#### 3. File Upload Issues

```bash
# Check upload directory permissions
ls -la uploads/

# Fix permissions
sudo chown -R www-data:www-data uploads/
sudo chmod -R 755 uploads/
```

#### 4. JWT Token Issues

```bash
# Check JWT secret in .env
echo $JWT_SECRET

# Generate a new JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 5. SMTP Configuration Issues

```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Check SMTP settings in admin panel
# Go to Settings > SMTP and test the connection
```

#### 6. Rate Limit Issues

```bash
# Check current rate limit usage
curl -I http://localhost:3000/api/changelogs
# Look for X-RateLimit-Remaining header

# Monitor rate limit violations
tail -f logs/app.log | grep "Too many requests"

# Temporarily increase limits in .env
RATE_LIMIT_MAX_REQUESTS=2000

# Restart application to apply changes
npm restart
# or
docker-compose restart app
```

### Performance Issues

#### 1. Slow Database Queries

```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- Check slow queries
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;
```

#### 2. Memory Issues

```bash
# Check Node.js memory usage
ps aux | grep node

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

#### 3. File Upload Limits

```bash
# Apache: Increase upload limits
# Add to apache2.conf or virtual host
LimitRequestBody 10485760

# Nginx: Increase client_max_body_size
client_max_body_size 10M;
```

## 🔧 Maintenance

### Database Backup

```bash
# Create backup
mysqldump -u root -p release_log > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
mysql -u root -p release_log < backup_file.sql
```

### File Cleanup

```bash
# Clean old uploads (older than 30 days)
find uploads/ -type f -mtime +30 -delete

# Clean old logs (older than 7 days)
find logs/ -name "*.log" -mtime +7 -delete
```

### SSL Certificate Renewal

```bash
# Let's Encrypt renewal
sudo certbot renew

# Reload web server
sudo systemctl reload apache2
# or
sudo systemctl reload nginx
```

## 📚 API Documentation

The API documentation is available at `/api-docs` when the application is running. It includes:

- Authentication endpoints
- Changelog management
- User management
- Settings management
- Public API endpoints

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

1. Check the [Issues](https://github.com/your-repo/release-log/issues) page
2. Create a new issue with detailed information
3. Include logs and error messages
4. Specify your environment (OS, Node.js version, etc.)

## 🔄 Updates

To update the application:

```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Run database migrations (if any)
npm run migrate

# Restart the application
npm restart
```

---

**Note**: Always backup your database and files before making major changes or updates. 