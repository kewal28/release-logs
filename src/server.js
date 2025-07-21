const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const settingsRoutes = require('./routes/settings');
const emailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Release Log API',
      version: '1.0.0',
      description: 'API documentation for the Release Log changelog management application',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: process.env.BASE_URL || `http://localhost:${PORT}`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// JSON parsing middleware - skip for multipart form data
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    // Skip JSON parsing for multipart form data
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for accurate IP addresses (only in production)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_PATH || 'uploads')));

// Static file serving for JavaScript files
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Release Log API Documentation'
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', publicRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Admin panel HTML
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Settings page HTML
app.get('/admin/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// Public site HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'public.html'));
});

// Details page HTML
app.get('/details/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'details.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    
    // Initialize database tables and default data
    await initializeDatabase();
    
    // Initialize email service
    await emailService.initialize();
    
    app.listen(PORT, () => {
      console.log(`🚀 Release Log server running on port ${PORT}`);
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`📚 API Documentation: ${baseUrl}/api-docs`);
  console.log(`👨‍💼 Admin Panel: ${baseUrl}/admin`);
  console.log(`🌐 Public Site: ${baseUrl}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 