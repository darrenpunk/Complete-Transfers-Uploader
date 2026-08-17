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

        // Auto-retry any claim that was interrupted by a login redirect
        tryRetryPendingClaim();
        
        window.addEventListener('message', function(event) {
            // Only process our specific message types
            if (!event.data || !event.data.type) {
                return;
            }
            
            var messageType = event.data.type;
            
            // Filter to only our message types
            if (['request-user-data', 'claim-cart', 'navigate-to-cart', 'artwork-uploader-refresh'].indexOf(messageType) === -1) {
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

                case 'artwork-uploader-refresh':
                    console.log('🔄 Artwork uploader requested page refresh');
                    window.location.reload();
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
                        odoo.session_info.username ||
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
    
    var PENDING_CLAIM_KEY = 'artwork_pending_claim';

    function showClaimError(message) {
        // Inject a dismissable error banner into the page (recoverable — user can retry)
        var existing = document.getElementById('artwork-claim-error-banner');
        if (existing) existing.parentNode.removeChild(existing);
        
        var banner = document.createElement('div');
        banner.id = 'artwork-claim-error-banner';
        banner.style.cssText = [
            'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
            'background:#b91c1c', 'color:#fff', 'padding:14px 20px',
            'border-radius:8px', 'box-shadow:0 4px 12px rgba(0,0,0,.35)',
            'z-index:999999', 'max-width:480px', 'text-align:center',
            'font-family:sans-serif', 'font-size:14px', 'line-height:1.5',
            'cursor:pointer'
        ].join(';');
        banner.innerHTML = '⚠️ &nbsp;' + message +
            '<br><small style="opacity:.8">Click to dismiss &nbsp;·&nbsp; Please refresh and try again</small>';
        banner.addEventListener('click', function() {
            banner.parentNode.removeChild(banner);
        });
        document.body.appendChild(banner);
        // Auto-dismiss after 12 seconds so it doesn't block the page forever
        setTimeout(function() {
            if (banner.parentNode) banner.parentNode.removeChild(banner);
        }, 12000);
    }

    function showSignInBanner(signInUrl) {
        // Show a persistent banner prompting the user to sign out and sign in again
        var existing = document.getElementById('artwork-claim-error-banner');
        if (existing) existing.parentNode.removeChild(existing);

        var banner = document.createElement('div');
        banner.id = 'artwork-claim-error-banner';
        banner.style.cssText = [
            'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
            'background:#b91c1c', 'color:#fff', 'padding:14px 20px',
            'border-radius:8px', 'box-shadow:0 4px 12px rgba(0,0,0,.35)',
            'z-index:999999', 'max-width:480px', 'text-align:center',
            'font-family:sans-serif', 'font-size:14px', 'line-height:1.5'
        ].join(';');

        var closeBtn = document.createElement('span');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;cursor:pointer;font-size:16px;opacity:.8';
        closeBtn.addEventListener('click', function() {
            if (banner.parentNode) banner.parentNode.removeChild(banner);
        });

        var msgEl = document.createElement('span');
        msgEl.innerHTML = '⚠️ &nbsp;You are not authorised to claim this cart. ' +
            '<a href="' + signInUrl + '" style="color:#fff;font-weight:bold;text-decoration:underline">' +
            'Sign out and sign in again</a>';

        banner.appendChild(closeBtn);
        banner.appendChild(msgEl);
        document.body.appendChild(banner);
    }

    function handleAuthRequired(orderId, accessToken, cartUrl) {
        // Persist the pending claim so it survives the login redirect
        try {
            sessionStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({
                orderId: orderId,
                accessToken: accessToken,
                cartUrl: cartUrl
            }));
        } catch (e) {
            // sessionStorage unavailable — banner still shown, retry won't be automatic
        }

        // Route through logout so that an already-authenticated wrong-account session
        // is cleared before the login form is shown.  Odoo's /web/session/logout accepts
        // a `redirect` GET param and works for both logged-out and logged-in users.
        var returnUrl = window.location.href;
        var loginUrl = '/web/login?redirect=' + encodeURIComponent(returnUrl);
        var signInUrl = '/web/session/logout?redirect=' + encodeURIComponent(loginUrl);

        console.log('🔐 Cart claim rejected (403). Storing pending claim and showing sign-out/sign-in prompt.');
        showSignInBanner(signInUrl);
    }

    function tryRetryPendingClaim() {
        var pendingJson;
        try {
            pendingJson = sessionStorage.getItem(PENDING_CLAIM_KEY);
        } catch (e) { return; }

        if (!pendingJson) return;

        var pending;
        try {
            pending = JSON.parse(pendingJson);
        } catch (e) {
            try { sessionStorage.removeItem(PENDING_CLAIM_KEY); } catch (e2) {}
            return;
        }

        // Clear immediately to prevent retry loops on repeated failures
        try { sessionStorage.removeItem(PENDING_CLAIM_KEY); } catch (e) {}

        if (!pending.orderId) return;

        console.log('🔄 Retrying pending cart claim after sign-in:', pending.orderId);
        handleClaimCart({
            data: {
                orderId: pending.orderId,
                accessToken: pending.accessToken || '',
                cartUrl: pending.cartUrl || '/shop/cart',
                skipNavigation: false
            },
            source: null
        });
    }
    
    function handleClaimCart(event) {
        var orderId = event.data.orderId;
        var accessToken = event.data.accessToken || '';
        var cartUrl = event.data.cartUrl || '/shop/cart';
        var skipNavigation = event.data.skipNavigation || false;
        
        if (!orderId) {
            console.error('❌ claim-cart message missing orderId');
            if (event.source) {
                event.source.postMessage({
                    type: 'cart-claimed',
                    success: false,
                    error: 'Missing orderId'
                }, '*');
            }
            return;
        }
        
        console.log('🛒 Claiming cart:', orderId, 'token:', accessToken ? 'present' : 'none', 'skipNav:', skipNavigation);
        
        // Build claim-cart URL (GET with query params — matches type='http' route)
        var url = '/artwork/claim-cart?order_id=' + orderId;
        if (accessToken) {
            url += '&access_token=' + encodeURIComponent(accessToken);
        }
        
        // Fetch to confirm the claim succeeded before doing anything
        fetch(url, {
            method: 'GET',
            credentials: 'include',
        })
        .then(function(response) {
            // 403 means the session is not authorised — prompt sign-in instead of showing
            // a generic error with no recovery path
            if (response.status === 403) {
                console.warn('⚠️ claim-cart returned 403 — session expired or not authorised');
                if (!skipNavigation) {
                    handleAuthRequired(orderId, accessToken, cartUrl);
                }
                if (event.source) {
                    event.source.postMessage({
                        type: 'cart-claimed',
                        success: false,
                        orderId: orderId,
                        error: 'Session expired — please sign in'
                    }, '*');
                }
                return null; // signal to the next .then() that we already handled this
            }
            return response.json();
        })
        .then(function(data) {
            if (data === null || data === undefined) return; // already handled (403 branch)

            if (data.success) {
                console.log('✅ Cart claimed successfully:', data);
                
                // Send confirmation back to iframe
                if (event.source) {
                    event.source.postMessage({
                        type: 'cart-claimed',
                        success: true,
                        orderId: orderId
                    }, '*');
                    console.log('📤 Sent cart-claimed confirmation to iframe');
                }
                
                // Navigate only after confirmed claim
                if (!skipNavigation) {
                    console.log('🔄 Navigating to cart after confirmed claim:', cartUrl);
                    window.location.href = cartUrl;
                }
            } else {
                var errorMsg = data.error || 'Failed to claim cart';
                console.error('❌ Failed to claim cart:', errorMsg);
                
                // Send failure back to iframe
                if (event.source) {
                    event.source.postMessage({
                        type: 'cart-claimed',
                        success: false,
                        orderId: orderId,
                        error: errorMsg
                    }, '*');
                }
                
                // Show a visible, dismissable error banner (navigation does NOT happen)
                if (!skipNavigation) {
                    showClaimError('Your cart could not be linked to this session. ' + errorMsg);
                }
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
            
            // Show recoverable error banner — no navigation
            if (!skipNavigation) {
                showClaimError('Network error while linking your cart. Please refresh and try again.');
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
