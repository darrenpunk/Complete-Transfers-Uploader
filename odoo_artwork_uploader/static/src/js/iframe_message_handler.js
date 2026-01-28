/**
 * Global Iframe Message Handler for Artwork Uploader
 * 
 * This script runs on ALL Odoo website pages to handle postMessage
 * communication from the artwork uploader iframe. It must be loaded
 * globally via website.assets_frontend to work on any page where
 * the artwork uploader iframe might be embedded.
 */

(function() {
    'use strict';

    // Only run on website frontend (not backend)
    if (typeof odoo === 'undefined') {
        console.log('📡 Artwork iframe handler: Not in Odoo context, skipping');
        return;
    }

    function initMessageHandler() {
        console.log('📡 Initializing global artwork uploader iframe message handler');
        
        window.addEventListener('message', function(event) {
            // Only process our specific message types
            if (!event.data || !event.data.type) {
                return;
            }
            
            var messageType = event.data.type;
            
            // Filter to only our message types
            if (['request-user-data', 'claim-cart', 'navigate-to-cart'].indexOf(messageType) === -1) {
                return;
            }
            
            console.log('📨 Artwork iframe message received:', messageType, event.data);
            
            switch (messageType) {
                case 'request-user-data':
                    handleUserDataRequest(event);
                    break;
                    
                case 'claim-cart':
                    handleClaimCart(event);
                    break;
                    
                case 'navigate-to-cart':
                    handleNavigateToCart(event);
                    break;
            }
        });
        
        console.log('✅ Artwork uploader iframe message handler ready');
    }
    
    function handleUserDataRequest(event) {
        // Get current user's email from Odoo session
        var userEmail = '';
        
        // Try multiple sources for user email
        if (window.odoo && odoo.session_info) {
            userEmail = odoo.session_info.partner_email || 
                        odoo.session_info.email || 
                        '';
        }
        
        // Fallback: check if there's a data attribute on the page
        if (!userEmail) {
            var emailEl = document.querySelector('[data-user-email]');
            if (emailEl) {
                userEmail = emailEl.dataset.userEmail;
            }
        }
        
        // If we have email from quick sources, send it immediately
        if (userEmail) {
            if (event.source) {
                event.source.postMessage({
                    type: 'odoo-user-data',
                    email: userEmail
                }, '*');
                console.log('📤 Sent user email to iframe (sync):', userEmail);
            }
            return;
        }
        
        // PRIMARY FALLBACK: Use the dedicated current-user API endpoint
        // This is the most reliable method for portal users
        fetch('/artwork/api/current-user', {
            method: 'GET',
            credentials: 'include'
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            var email = '';
            if (data.success && data.email) {
                email = data.email;
                console.log('✅ Got user email from current-user API:', email);
            }
            if (event.source) {
                event.source.postMessage({
                    type: 'odoo-user-data',
                    email: email
                }, '*');
                console.log('📤 Sent user email to iframe (from API):', email);
            }
        })
        .catch(function(err) {
            console.error('Failed to fetch current user:', err);
            
            // SECONDARY FALLBACK: try old session endpoint
            if (window.odoo && odoo.csrf_token) {
                fetch('/web/session/get_session_info', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {},
                        id: Math.floor(Math.random() * 1000000)
                    }),
                    credentials: 'include'
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    var email = '';
                    if (data.result) {
                        email = data.result.partner_email || data.result.username || '';
                    }
                    if (event.source) {
                        event.source.postMessage({
                            type: 'odoo-user-data',
                            email: email
                        }, '*');
                        console.log('📤 Sent user email to iframe (session fallback):', email);
                    }
                })
                .catch(function(err2) {
                    console.error('Failed to fetch session info:', err2);
                    // Send empty email as last resort
                    if (event.source) {
                        event.source.postMessage({
                            type: 'odoo-user-data',
                            email: ''
                        }, '*');
                    }
                });
            } else {
                // Send empty email
                if (event.source) {
                    event.source.postMessage({
                        type: 'odoo-user-data',
                        email: ''
                    }, '*');
                }
            }
        });
    }
    
    function handleClaimCart(event) {
        var orderId = event.data.orderId;
        var accessToken = event.data.accessToken || '';
        var cartUrl = event.data.cartUrl || '/shop/cart';
        var skipNavigation = event.data.skipNavigation || false;
        
        if (!orderId) {
            console.error('❌ claim-cart message missing orderId');
            return;
        }
        
        console.log('🛒 Claiming cart:', orderId, 'token:', accessToken ? 'present' : 'none', 'skipNav:', skipNavigation);
        
        // Build claim-cart URL with redirect parameter
        // This ensures the session is set BEFORE the cart page loads (avoids race condition)
        var url = '/artwork/claim-cart?order_id=' + orderId;
        if (accessToken) {
            url += '&access_token=' + encodeURIComponent(accessToken);
        }
        
        // If we need to navigate, use redirect mode to avoid race conditions
        if (!skipNavigation) {
            // Add redirect parameter - server will set session then redirect
            url += '&redirect=' + encodeURIComponent(cartUrl);
            console.log('🔄 Using server-side redirect to:', cartUrl);
            
            // Send confirmation back to iframe before navigating
            if (event.source) {
                event.source.postMessage({
                    type: 'cart-claimed',
                    success: true,
                    orderId: orderId
                }, '*');
                console.log('📤 Sent cart-claimed confirmation to iframe');
            }
            
            // Navigate via server redirect (session is set before page loads)
            window.location.href = url;
            return;
        }
        
        // If skipNavigation, use fetch to set session without redirect
        fetch(url, {
            method: 'GET',
            credentials: 'include',
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                console.log('✅ Cart claimed successfully:', data);
            } else {
                console.error('❌ Failed to claim cart:', data.error);
            }
            
            // Send confirmation back to iframe
            if (event.source) {
                event.source.postMessage({
                    type: 'cart-claimed',
                    success: data.success || false,
                    orderId: orderId
                }, '*');
                console.log('📤 Sent cart-claimed confirmation to iframe');
            }
        })
        .catch(function(error) {
            console.error('❌ Error claiming cart:', error);
            
            // Send error confirmation back to iframe
            if (event.source) {
                event.source.postMessage({
                    type: 'cart-claimed',
                    success: false,
                    orderId: orderId,
                    error: error.message
                }, '*');
            }
        });
    }
    
    function handleNavigateToCart(event) {
        var url = event.data.url || '/shop/cart';
        console.log('🔗 Navigating to cart:', url);
        window.location.href = url;
    }
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMessageHandler);
    } else {
        initMessageHandler();
    }
    
})();
