# 🚦 Rate Limits Configuration

This document explains the rate limiting configuration for the Release Log application.

## 📊 Current Rate Limits (Updated)

### Application Level (Express Rate Limiting)

| Endpoint Type | Window | Limit | Requests per Minute |
|---------------|--------|-------|-------------------|
| **General API** | 15 minutes | 1000 requests | ~67 req/min |
| **Voting** | 1 hour | 200 votes | ~3.3 votes/min |
| **Comments** | 1 hour | 20 comments | ~0.33 comments/min |
| **Login** | 15 minutes | 20 attempts | ~1.3 attempts/min |
| **Admin** | 15 minutes | 500 requests | ~33 req/min |

### Nginx Level (Proxy Rate Limiting)

| Endpoint Type | Rate | Burst | Description |
|---------------|------|-------|-------------|
| **API Routes** | 50 req/sec | 100 | General API endpoints |
| **Login** | 20 req/min | 20 | Authentication endpoints |

## 🔧 Configuration Files

### Environment Variables (`.env`)

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000        # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=1000       # 1000 requests per window
```

### Application Rate Limits (`src/middleware/rateLimit.js`)

```javascript
// General API endpoints
const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
});

// Voting endpoints
const voteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // 200 votes per hour
});

// Comment endpoints
const commentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 comments per hour
});

// Authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per 15 minutes
});

// Admin endpoints
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 admin requests per 15 minutes
});
```

### Nginx Rate Limits (`nginx.conf`)

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=20r/m;

# API endpoints
location /api/ {
    limit_req zone=api burst=100 nodelay;
    # ... proxy configuration
}

# Login endpoints
location /api/auth/login {
    limit_req zone=login burst=20 nodelay;
    # ... proxy configuration
}
```

## 📈 Rate Limit Comparison

### Before (Too Restrictive)
- General API: 100 requests per 15 minutes (~7 req/min)
- Voting: 50 votes per hour (~0.8 votes/min)
- Comments: 5 comments per hour (~0.08 comments/min)
- Login: 5 attempts per 15 minutes (~0.3 attempts/min)
- Admin: 100 requests per 15 minutes (~7 req/min)
- Nginx API: 10 req/sec
- Nginx Login: 5 req/min

### After (More Generous)
- General API: 1000 requests per 15 minutes (~67 req/min) **+570%**
- Voting: 200 votes per hour (~3.3 votes/min) **+313%**
- Comments: 20 comments per hour (~0.33 comments/min) **+300%**
- Login: 20 attempts per 15 minutes (~1.3 attempts/min) **+300%**
- Admin: 500 requests per 15 minutes (~33 req/min) **+371%**
- Nginx API: 50 req/sec **+400%**
- Nginx Login: 20 req/min **+300%**

## 🎯 Use Cases

### High Traffic Scenarios
- **Public changelog browsing**: 1000 requests per 15 minutes should handle most traffic
- **Voting on changelogs**: 200 votes per hour allows for active community engagement
- **Comment discussions**: 20 comments per hour prevents spam while allowing discussion

### Admin Operations
- **Content management**: 500 admin requests per 15 minutes for bulk operations
- **Settings management**: Sufficient for configuration changes
- **User management**: Handles admin panel usage

### Security Considerations
- **Login attempts**: 20 attempts per 15 minutes prevents brute force attacks
- **Comment spam**: 20 comments per hour prevents comment flooding
- **Vote manipulation**: 200 votes per hour prevents vote stuffing

## 🔄 Customization

### Increasing Limits Further

If you need even higher limits, update these files:

1. **Environment Variables** (`.env`):
```bash
RATE_LIMIT_MAX_REQUESTS=2000  # Increase general API limit
```

2. **Application Limits** (`src/middleware/rateLimit.js`):
```javascript
max: 500, // Increase voting limit
max: 50,  // Increase comment limit
max: 50,  // Increase login limit
max: 1000, // Increase admin limit
```

3. **Nginx Limits** (`nginx.conf`):
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=50r/m;
```

### Decreasing Limits

For stricter security, reduce the values in the same files.

## 🚨 Monitoring

### Check Rate Limit Headers

Rate limit information is included in HTTP headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1640995200
```

### Log Monitoring

Monitor these logs for rate limit violations:

```bash
# Application logs
docker-compose logs app | grep "Too many requests"

# Nginx logs
docker-compose logs nginx | grep "429"
```

## 🔧 Troubleshooting

### Rate Limit Errors

If you're hitting rate limits:

1. **Check current usage**:
```bash
curl -I https://yourdomain.com/api/changelogs
# Look for X-RateLimit-Remaining header
```

2. **Temporarily increase limits**:
```bash
# Update .env file and restart
docker-compose restart app
```

3. **Check for abuse**:
```bash
# Monitor logs for suspicious activity
docker-compose logs app | grep "Too many requests"
```

### Performance Impact

Rate limiting adds minimal overhead:
- Application level: ~1-2ms per request
- Nginx level: ~0.1ms per request

## 📝 Notes

- Rate limits are per IP address
- Limits reset after the time window expires
- Burst limits allow temporary spikes above the rate limit
- All limits are configurable via environment variables
- Nginx limits act as a first line of defense
- Application limits provide more granular control 