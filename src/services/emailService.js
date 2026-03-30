const nodemailer = require('nodemailer');
const settingsService = require('./settings');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    try {
      const smtp = settingsService.getSmtpFromEnv();

      if (!smtp.enabled) {
        this.isConfigured = false;
        return false;
      }

      // Validate SMTP settings
      const validation = settingsService.validateSMTPSettings(smtp);
      if (!validation.isValid) {
        console.error('SMTP validation failed:', validation.errors);
        this.isConfigured = false;
        return false;
      }

      // Create transporter with AWS SES optimized configuration
      const transporterConfigs = [
        // Primary: AWS SES with STARTTLS (port 587)
        {
          host: smtp.host,
          port: smtp.port,
          secure: false, // STARTTLS will be used
          auth: {
            user: smtp.user,
            pass: smtp.pass
          },
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        },
        // Fallback: AWS SES with SSL (port 465)
        {
          host: smtp.host,
          port: 465,
          secure: true, // SSL
          auth: {
            user: smtp.user,
            pass: smtp.pass
          },
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        },
        // Fallback: Try with user's original settings
        {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: {
            user: smtp.user,
            pass: smtp.pass
          },
          tls: {
            rejectUnauthorized: false
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        }
      ];

      let lastError = null;
      
      for (const transporterConfig of transporterConfigs) {
        try {
          this.transporter = nodemailer.createTransport(transporterConfig);
          
          // Test connection
          await this.transporter.verify();
          this.isConfigured = true;
          console.log('✅ SMTP configured successfully');
          return true;
        } catch (error) {
          lastError = error;
          console.log(`SMTP config attempt failed, trying next...`);
          continue;
        }
      }

      // If all attempts failed
      console.error('❌ All SMTP configuration attempts failed:', lastError);
      this.isConfigured = false;
      return false;
    } catch (error) {
      console.error('❌ SMTP configuration failed:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Send email
   */
  async sendEmail(to, subject, html, text = null) {
    if (!this.isConfigured || !this.transporter) {
      console.warn('SMTP not configured, skipping email send');
      return false;
    }

    try {
      const config = await settingsService.getAppConfig();
      const smtp = settingsService.getSmtpFromEnv();
      const fromAddr = smtp.from || smtp.user;

      const mailOptions = {
        from: `"${config.company.name || 'Release Log'}" <${fromAddr}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('❌ Email send failed:', error);
      return false;
    }
  }

  /**
   * Send comment notification to admin
   */
  async sendCommentNotification(comment, changelog) {
    try {
      const config = await settingsService.getAppConfig();
      
      if (!config.notifications.comments) {
        return false;
      }

      // Get admin email from settings
      const adminEmail = config.notifications.adminEmail;
      
      if (!adminEmail || adminEmail.trim() === '') {
        console.warn('No admin email configured for comment notifications');
        return false;
      }

      const subject = `New Comment on "${changelog.title}"`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Comment Received</h2>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #666;">Changelog: ${changelog.title}</h3>
            <p style="color: #666; margin-bottom: 15px;">
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}/details/${changelog.id}" 
                 style="color: #4F46E5; text-decoration: none;">
                View Changelog
              </a>
            </p>
          </div>
          
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
            <div style="margin-bottom: 15px;">
              <strong style="color: #333;">From:</strong> ${comment.author_name}
              ${comment.author_email ? `<br><strong style="color: #333;">Email:</strong> ${comment.author_email}` : ''}
            </div>
            
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4F46E5;">
              <p style="margin: 0; color: #333; line-height: 1.6;">${comment.content}</p>
            </div>
            
            <div style="margin-top: 15px; font-size: 12px; color: #666;">
              Commented on: ${new Date(comment.created_at).toLocaleString()}
            </div>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from ${config.company.name || 'Release Log'}
            </p>
          </div>
        </div>
      `;

      return await this.sendEmail(adminEmail, subject, html);
    } catch (error) {
      console.error('Error sending comment notification:', error);
      return false;
    }
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Reinitialize transporter (called when settings change)
   */
  async reinitialize() {
    this.transporter = null;
    this.isConfigured = false;
    return await this.initialize();
  }

  /**
   * Get SMTP status
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      hasTransporter: !!this.transporter
    };
  }
}

module.exports = new EmailService(); 