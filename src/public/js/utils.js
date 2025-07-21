/**
 * Utility functions for Release Log application
 * Centralized common functions used across admin, public, and details pages
 */

// API base URL
const API_BASE = '/api';

/**
 * Toast Notification System
 * Provides consistent toast notifications across all pages
 */
class ToastManager {
    static showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle';
        
        toast.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-md shadow-lg z-50 flex items-center space-x-2 transform transition-all duration-300 translate-x-full`;
        toast.innerHTML = `
            <i class="${icon}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" class="ml-2 hover:opacity-75">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    }

    static showSuccess(message) {
        this.showToast(message, 'success');
    }

    static showError(message) {
        this.showToast(message, 'error');
    }

    static showInfo(message) {
        this.showToast(message, 'info');
    }
}

/**
 * Date Formatting Utilities
 * Handles date formatting with fallbacks and error handling
 */
class DateUtils {
    static formatDate(dateString, includeTime = false) {
        if (!dateString) return 'Unknown date';
        
        try {
            // Handle MySQL date format
            let date;
            if (dateString instanceof Date) {
                date = dateString;
            } else {
                date = new Date(dateString);
            }
            
            if (isNaN(date.getTime())) {
                console.error('Invalid date value:', dateString);
                return 'Invalid date';
            }
            
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };

            if (includeTime) {
                options.hour = '2-digit';
                options.minute = '2-digit';
            }
            
            return date.toLocaleDateString('en-US', options);
        } catch (error) {
            console.error('Date formatting error:', error, 'for date:', dateString);
            return 'Invalid date';
        }
    }

    static formatDateWithFallback(dateString, fallbackDateString = null, includeTime = false) {
        const primaryDate = this.formatDate(dateString, includeTime);
        if (primaryDate !== 'Unknown date' && primaryDate !== 'Invalid date') {
            return primaryDate;
        }
        
        if (fallbackDateString) {
            const fallbackDate = this.formatDate(fallbackDateString, includeTime);
            return fallbackDate !== 'Unknown date' && fallbackDate !== 'Invalid date' 
                ? `${fallbackDate} (draft)` 
                : 'Unknown date';
        }
        
        return primaryDate;
    }
}

/**
 * Label Styling Utilities
 * Provides consistent label colors and icons across the application
 */
class LabelUtils {
    static getLabelColor(label) {
        const colors = {
            feature: 'bg-green-100 text-green-800',
            bug: 'bg-red-100 text-red-800',
            optimization: 'bg-blue-100 text-blue-800'
        };
        return colors[label] || 'bg-gray-100 text-gray-800';
    }

    static getLabelIcon(label) {
        const icons = {
            feature: 'fas fa-star',
            bug: 'fas fa-bug',
            optimization: 'fas fa-rocket'
        };
        return icons[label] || 'fas fa-circle';
    }

    static getStatusColor(status) {
        return status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
    }
}

/**
 * API Request Utilities
 * Handles API requests with consistent error handling and authentication
 */
class ApiUtils {
    static async apiRequest(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };

        // Don't set Content-Type for FormData (let browser set it with boundary)
        if (options.body instanceof FormData) {
            delete defaultOptions.headers['Content-Type'];
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });

        if (response.status === 401) {
            // Handle session expiration
            if (typeof logout === 'function') {
                logout();
            }
            throw new Error('Session expired');
        }

        return response;
    }

    static async handleApiResponse(response, errorMessage = 'API request failed') {
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || errorMessage);
        }

        return data;
    }
}

/**
 * UI State Management Utilities
 * Handles loading states and UI visibility
 */
class UIUtils {
    static showLoading(loadingId = 'loadingState', emptyId = 'emptyState', contentId = null) {
        const loadingElement = document.getElementById(loadingId);
        const emptyElement = document.getElementById(emptyId);
        
        if (loadingElement) loadingElement.classList.remove('hidden');
        if (emptyElement) emptyElement.classList.add('hidden');
        if (contentId) {
            const contentElement = document.getElementById(contentId);
            if (contentElement) contentElement.classList.add('hidden');
        }
    }

    static hideLoading(loadingId = 'loadingState') {
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) loadingElement.classList.add('hidden');
    }

    static showError(message, errorId = 'loginError') {
        const errorElement = document.getElementById(errorId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    static hideError(errorId = 'loginError') {
        const errorElement = document.getElementById(errorId);
        if (errorElement) errorElement.classList.add('hidden');
    }
}

/**
 * Pagination Utilities
 * Handles pagination rendering and navigation
 */
class PaginationUtils {
    static renderPagination(pagination, currentPage, totalPages, onPageChange, containerId = 'pageNumbers') {
        const paginationDiv = document.getElementById('pagination');
        if (totalPages <= 1) {
            if (paginationDiv) paginationDiv.classList.add('hidden');
            return;
        }

        if (paginationDiv) paginationDiv.classList.remove('hidden');

        // Update pagination info if elements exist
        const startItemElement = document.getElementById('startItem');
        const endItemElement = document.getElementById('endItem');
        const totalItemsElement = document.getElementById('totalItems');

        if (startItemElement) {
            startItemElement.textContent = ((pagination.page - 1) * pagination.limit) + 1;
        }
        if (endItemElement) {
            endItemElement.textContent = Math.min(pagination.page * pagination.limit, pagination.total);
        }
        if (totalItemsElement) {
            totalItemsElement.textContent = pagination.total;
        }

        // Render page numbers
        const pageNumbers = document.getElementById(containerId);
        if (!pageNumbers) return;

        pageNumbers.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const button = document.createElement('button');
            button.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                i === currentPage 
                    ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600' 
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`;
            button.textContent = i;
            button.onclick = () => onPageChange(i);
            pageNumbers.appendChild(button);
        }
    }
}

/**
 * Modal Utilities
 * Handles modal show/hide operations
 */
class ModalUtils {
    static showModal(modalId, title = null, onShow = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (title) {
            const titleElement = document.getElementById('modalTitle');
            if (titleElement) titleElement.textContent = title;
        }

        modal.classList.remove('hidden');
        
        if (onShow && typeof onShow === 'function') {
            setTimeout(onShow, 100);
        }
    }

    static hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.add('hidden');
        
        // Reset form if it exists
        const form = modal.querySelector('form');
        if (form) form.reset();
        
        // Clear image preview if it exists
        const imagePreview = document.getElementById('imagePreview');
        if (imagePreview) imagePreview.innerHTML = '';
    }
}

/**
 * Form Validation Utilities
 * Common form validation functions
 */
class ValidationUtils {
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static validateRequired(value, fieldName = 'Field') {
        if (!value || value.trim().length === 0) {
            ToastManager.showError(`${fieldName} is required`);
            return false;
        }
        return true;
    }

    static validateLength(value, minLength, maxLength, fieldName = 'Field') {
        if (value.length < minLength) {
            ToastManager.showError(`${fieldName} must be at least ${minLength} characters`);
            return false;
        }
        if (maxLength && value.length > maxLength) {
            ToastManager.showError(`${fieldName} must be less than ${maxLength} characters`);
            return false;
        }
        return true;
    }
}

// Export utilities for use in other files
window.Utils = {
    Toast: ToastManager,
    Date: DateUtils,
    Label: LabelUtils,
    Api: ApiUtils,
    UI: UIUtils,
    Pagination: PaginationUtils,
    Modal: ModalUtils,
    Validation: ValidationUtils
};

// Global convenience functions for backward compatibility
window.showToast = (message, type) => ToastManager.showToast(message, type);
window.showSuccess = (message) => ToastManager.showSuccess(message);
window.showError = (message) => ToastManager.showError(message);
window.showInfo = (message) => ToastManager.showInfo(message);
window.formatDate = (dateString, includeTime) => DateUtils.formatDate(dateString, includeTime);
window.getLabelColor = (label) => LabelUtils.getLabelColor(label);
window.getLabelIcon = (label) => LabelUtils.getLabelIcon(label);
window.apiRequest = (endpoint, options) => ApiUtils.apiRequest(endpoint, options); 