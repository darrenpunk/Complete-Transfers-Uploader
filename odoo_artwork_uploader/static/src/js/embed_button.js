/**
 * Odoo Artwork Uploader Embed Button
 * 
 * This script creates an "Order Transfers" button that can be embedded
 * on any Odoo website page to launch the Artwork Uploader.
 */
odoo.define('artwork_uploader.embed_button', function (require) {
    'use strict';
    
    const publicWidget = require('web.public.widget');
    
    publicWidget.registry.ArtworkUploaderButton = publicWidget.Widget.extend({
        selector: '.artwork-uploader-embed-button',
        events: {
            'click': '_onButtonClick',
        },
        
        /**
         * @override
         */
        start: function () {
            this._super.apply(this, arguments);
            
            // Apply default styling if no custom class
            if (!this.$el.hasClass('custom-styled')) {
                this.$el.addClass('btn btn-primary');
            }
            
            // Set default text if empty
            if (!this.$el.text().trim()) {
                this.$el.text('Order Transfers');
            }
            
            return this._super.apply(this, arguments);
        },
        
        /**
         * Handle button click
         */
        _onButtonClick: function (ev) {
            ev.preventDefault();
            
            const mode = this.$el.data('mode') || 'redirect';
            const url = '/artwork';
            
            if (mode === 'popup') {
                // Open in popup window
                const width = 1200;
                const height = 800;
                const left = (window.screen.width - width) / 2;
                const top = (window.screen.height - height) / 2;
                
                const popup = window.open(
                    url,
                    'ArtworkUploader',
                    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
                );
                
                if (popup) {
                    popup.focus();
                }
            } else {
                // Redirect to artwork page
                window.location.href = url;
            }
        },
    });
    
    // Auto-initialize buttons on page load
    publicWidget.registry.ArtworkUploaderButton.prototype.selector = '[data-artwork-uploader], .artwork-uploader-embed-button';
    
    return publicWidget.registry.ArtworkUploaderButton;
});