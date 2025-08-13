(function() {
  'use strict';
  
  // Configuration
  const ARTWORK_UPLOADER_URL = window.ARTWORK_UPLOADER_URL || window.location.origin;
  const BUTTON_TEXT = window.ARTWORK_UPLOADER_BUTTON_TEXT || 'Order Transfers';
  const BUTTON_CLASS = window.ARTWORK_UPLOADER_BUTTON_CLASS || 'artwork-uploader-button';
  const OPEN_MODE = window.ARTWORK_UPLOADER_OPEN_MODE || 'popup'; // 'popup' or 'redirect'
  
  // Default styles
  const defaultStyles = `
    .artwork-uploader-button-default {
      background-color: #961E75;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .artwork-uploader-button-default:hover {
      background-color: #7a1860;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    
    .artwork-uploader-button-default:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  `;
  
  // Inject default styles
  function injectStyles() {
    if (!document.getElementById('artwork-uploader-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'artwork-uploader-styles';
      styleSheet.textContent = defaultStyles;
      document.head.appendChild(styleSheet);
    }
  }
  
  // Open the artwork uploader
  function openArtworkUploader() {
    if (OPEN_MODE === 'popup') {
      // Calculate center position
      const width = 1200;
      const height = 800;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      
      // Open in popup window
      const popup = window.open(
        ARTWORK_UPLOADER_URL,
        'ArtworkUploader',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );
      
      // Focus the popup if it was already open
      if (popup) {
        popup.focus();
      }
    } else {
      // Redirect to the app
      window.location.href = ARTWORK_UPLOADER_URL;
    }
  }
  
  // Create button element
  function createButton(container) {
    const button = document.createElement('button');
    button.textContent = BUTTON_TEXT;
    button.className = BUTTON_CLASS;
    
    // Add default styling if no custom class is provided
    if (BUTTON_CLASS === 'artwork-uploader-button') {
      button.classList.add('artwork-uploader-button-default');
    }
    
    button.addEventListener('click', openArtworkUploader);
    
    if (container) {
      container.appendChild(button);
    } else {
      // If no container specified, append to body
      document.body.appendChild(button);
    }
    
    return button;
  }
  
  // Initialize when DOM is ready
  function init() {
    injectStyles();
    
    // Look for containers with data-artwork-uploader attribute
    const containers = document.querySelectorAll('[data-artwork-uploader]');
    containers.forEach(container => {
      createButton(container);
    });
    
    // Also create button if there's an element with id="artwork-uploader-button"
    const buttonContainer = document.getElementById('artwork-uploader-button');
    if (buttonContainer) {
      createButton(buttonContainer);
    }
  }
  
  // Expose API for programmatic use
  window.ArtworkUploader = {
    createButton: createButton,
    open: openArtworkUploader
  };
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();