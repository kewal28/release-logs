# Contributing to Release Log

Thank you for your interest in contributing to Release Log! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- Git

### Development Setup

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/release-log.git
   cd release-log
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   npm run setup
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 📝 Development Guidelines

### Code Style

- Use consistent indentation (2 spaces)
- Follow JavaScript/Node.js best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(auth): add JWT token refresh functionality
fix(admin): resolve image upload issue with large files
docs(readme): update installation instructions
```

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes**
   - Write clean, well-documented code
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   npm test
   npm run dev  # Test manually
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

6. **Create a Pull Request**
   - Provide a clear description of changes
   - Include any relevant issue numbers
   - Add screenshots for UI changes

### Testing

- Write unit tests for new functionality
- Test API endpoints manually
- Ensure the application works in different environments
- Test with different browsers (for frontend changes)

## 🐛 Reporting Issues

When reporting issues, please include:

1. **Environment details**
   - Operating system
   - Node.js version
   - MySQL version
   - Browser (if applicable)

2. **Steps to reproduce**
   - Clear, step-by-step instructions
   - Expected vs actual behavior

3. **Additional context**
   - Error messages
   - Screenshots
   - Console logs

## 🎯 Areas for Contribution

### High Priority
- [ ] Add comprehensive test suite
- [ ] Improve error handling and logging
- [ ] Add API rate limiting improvements
- [ ] Implement user roles and permissions
- [ ] Add email notifications

### Medium Priority
- [ ] Create React frontend option
- [ ] Add RSS feeds
- [ ] Implement advanced analytics
- [ ] Add multi-language support
- [ ] Create mobile app

### Low Priority
- [ ] Add themes and customization
- [ ] Implement webhooks
- [ ] Add import/export functionality
- [ ] Create CLI tool

## 📚 Documentation

- Keep documentation up to date
- Add JSDoc comments for functions
- Update README.md for new features
- Add examples and use cases

## 🔒 Security

- Report security vulnerabilities privately
- Follow security best practices
- Validate all user inputs
- Use parameterized queries
- Implement proper authentication

## 🏷️ Release Process

1. **Version bump**
   - Update version in `package.json`
   - Update changelog

2. **Create release**
   - Tag the release
   - Write release notes
   - Update documentation

## 📞 Getting Help

- Check existing issues and discussions
- Join our community chat
- Create a new issue for questions
- Reach out to maintainers

## 📄 License

By contributing to Release Log, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🎉 