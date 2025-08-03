# Artwork Uploader "Order Transfers" Button - Integration Guide

## Overview
The "Order Transfers" button is a simple JavaScript widget that can be embedded on any webpage to launch the Artwork Uploader application. It requires only one line of code and is fully customizable.

## Quick Start

Add this single line to your webpage:

```html
<script src="https://yoursite.com/embed-button.js"></script>
```

That's it! The button will automatically appear where you place the script.

## Installation Methods

### Method 1: Automatic Button
Place a container with the `data-artwork-uploader` attribute:

```html
<div data-artwork-uploader></div>
<script src="https://yoursite.com/embed-button.js"></script>
```

### Method 2: Container by ID
Use a container with `id="artwork-uploader-button"`:

```html
<div id="artwork-uploader-button"></div>
<script src="https://yoursite.com/embed-button.js"></script>
```

### Method 3: Programmatic Creation
Create buttons dynamically using JavaScript:

```html
<script src="https://yoursite.com/embed-button.js"></script>
<script>
// Create button in specific container
const container = document.getElementById('my-container');
ArtworkUploader.createButton(container);

// Or open directly without button
ArtworkUploader.open();
</script>
```

## Configuration Options

Customize the button by setting global variables before loading the script:

```html
<script>
// Configuration options
window.ARTWORK_UPLOADER_URL = 'https://yoursite.com/artwork';
window.ARTWORK_UPLOADER_BUTTON_TEXT = 'Design Your Transfer';
window.ARTWORK_UPLOADER_BUTTON_CLASS = 'my-custom-button';
window.ARTWORK_UPLOADER_OPEN_MODE = 'popup'; // or 'redirect'
</script>
<script src="https://yoursite.com/embed-button.js"></script>
```

### Available Options:
- **ARTWORK_UPLOADER_URL** - URL of your artwork uploader (default: current origin)
- **ARTWORK_UPLOADER_BUTTON_TEXT** - Button text (default: "Order Transfers")
- **ARTWORK_UPLOADER_BUTTON_CLASS** - CSS class for styling (default: "artwork-uploader-button")
- **ARTWORK_UPLOADER_OPEN_MODE** - "popup" or "redirect" (default: "popup")

## Styling the Button

### Default Style
The button comes with a professional default style that matches the Complete Transfers brand:
- Pink background (#961E75)
- White text
- Rounded corners
- Hover effects

### Custom Styling
Apply your own styles by setting a custom class:

```html
<style>
.my-custom-button {
    background: linear-gradient(45deg, #FF6B6B, #C44569);
    color: white;
    border: none;
    padding: 15px 40px;
    font-size: 18px;
    border-radius: 50px;
    cursor: pointer;
    font-weight: bold;
    text-transform: uppercase;
}

.my-custom-button:hover {
    transform: scale(1.05);
    box-shadow: 0 5px 15px rgba(196, 69, 105, 0.4);
}
</style>

<script>
window.ARTWORK_UPLOADER_BUTTON_CLASS = 'my-custom-button';
</script>
<script src="embed-button.js"></script>
```

## Platform Integration Examples

### WordPress
Add to your theme or use a custom HTML widget:

```php
function add_artwork_uploader_button() {
    ?>
    <div data-artwork-uploader></div>
    <script src="https://yoursite.com/embed-button.js"></script>
    <?php
}
add_action('woocommerce_after_add_to_cart_button', 'add_artwork_uploader_button');
```

### Shopify
Add to your product template:

```liquid
<!-- In product.liquid -->
<div class="product-form__buttons">
    <div data-artwork-uploader></div>
</div>
<script src="https://yoursite.com/embed-button.js"></script>
```

### React
Create a component wrapper:

```jsx
import { useEffect } from 'react';

function OrderTransfersButton() {
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://yoursite.com/embed-button.js';
        script.async = true;
        document.body.appendChild(script);
        
        return () => {
            document.body.removeChild(script);
        };
    }, []);
    
    return <div data-artwork-uploader></div>;
}
```

### Vue.js
Create a component:

```vue
<template>
    <div data-artwork-uploader></div>
</template>

<script>
export default {
    mounted() {
        const script = document.createElement('script');
        script.src = 'https://yoursite.com/embed-button.js';
        script.async = true;
        document.body.appendChild(script);
    }
}
</script>
```

## Advanced Usage

### Multiple Buttons
Create multiple buttons with different configurations:

```javascript
// Button for T-Shirts
const tshirtBtn = ArtworkUploader.createButton(document.getElementById('tshirt-section'));
tshirtBtn.textContent = 'Design T-Shirt Transfer';

// Button for Hoodies
const hoodieBtn = ArtworkUploader.createButton(document.getElementById('hoodie-section'));
hoodieBtn.textContent = 'Design Hoodie Transfer';
```

### Event Tracking
Track button clicks with analytics:

```javascript
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('artwork-uploader-button')) {
        // Google Analytics
        gtag('event', 'click', {
            'event_category': 'Artwork Uploader',
            'event_label': 'Order Transfers Button'
        });
        
        // Facebook Pixel
        fbq('track', 'InitiateCheckout');
    }
});
```

### Conditional Display
Show button only for certain products:

```javascript
// Check if product needs custom transfer
if (productRequiresTransfer) {
    ArtworkUploader.createButton(document.getElementById('product-options'));
}
```

## Popup Window Settings

When using popup mode, the window opens with:
- Width: 1200px
- Height: 800px
- Centered on screen
- Resizable
- Scrollable

## Troubleshooting

### Button Not Appearing
1. Check browser console for errors
2. Ensure script loads after DOM elements
3. Verify script URL is accessible
4. Check for JavaScript conflicts

### Popup Blocked
Modern browsers may block popups. Solutions:
1. Use redirect mode instead: `window.ARTWORK_UPLOADER_OPEN_MODE = 'redirect'`
2. Ensure button click is user-initiated
3. Add site to popup exceptions

### Styling Issues
1. Check CSS specificity conflicts
2. Use `!important` if needed
3. Inspect element to debug styles

## Security Considerations

- The script runs in the global scope
- No user data is collected by the button
- All artwork processing happens on your server
- HTTPS recommended for production

## File Sizes

- Full version: `embed-button.js` (~3KB)
- Minified version: `embed-button.min.js` (~1KB)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## API Reference

### Global Methods

```javascript
// Create a button programmatically
ArtworkUploader.createButton(container);

// Open the uploader directly
ArtworkUploader.open();
```

### Configuration Variables

```javascript
window.ARTWORK_UPLOADER_URL = 'string';        // App URL
window.ARTWORK_UPLOADER_BUTTON_TEXT = 'string'; // Button text
window.ARTWORK_UPLOADER_BUTTON_CLASS = 'string'; // CSS class
window.ARTWORK_UPLOADER_OPEN_MODE = 'popup|redirect'; // Open mode
```

## Examples

For a complete working example with all integration methods, open:
```
/embed-example.html
```

This page demonstrates all installation methods, styling options, and configuration examples.

## Support

For integration support or custom requirements, the embed button is designed to be simple and flexible. The script is self-contained and has no external dependencies.