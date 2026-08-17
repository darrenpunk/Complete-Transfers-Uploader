#!/usr/bin/env tsx
/**
 * Regression tests for the claim-cart / cart navigation flow.
 *
 * Covers the scenario where a customer adds multiple DTF items in sequence
 * and then navigates to the cart — ensuring the cart is never empty due to
 * a racing or duplicate claim handler.
 *
 * These are pure logic tests: no server or browser required. They mock the
 * fetch / window APIs used by iframe_message_handler.js so the handler
 * behaviour can be verified without spinning up Odoo.
 *
 * Run:  npx tsx tests/claim-cart.test.ts
 */

import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------------------
// Minimal browser-API stubs so we can run the handler logic in Node
// ---------------------------------------------------------------------------

interface MockFetchCall {
  url: string;
  method: string;
  credentials: string;
}

interface CartClaimedMessage {
  type: string;
  success: boolean;
  orderId?: number | string;
  error?: string;
}

interface NavigationCall {
  href: string;
}

// Re-implement the handler logic extracted from iframe_message_handler.js so we
// can unit-test it without importing browser globals.
function makeHandler(deps: {
  fetchImpl: (url: string, opts: RequestInit) => Promise<{ status: number; json: () => Promise<unknown> }>;
  onNavigate: (href: string) => void;
  onPostMessage: (msg: CartClaimedMessage) => void;
  onBannerShown: (msg: string) => void;
  /** Called when a 403 triggers the sign-in-and-retry flow. Receives the login URL. */
  onSignInRedirect?: (loginUrl: string) => void;
  /** Stub for sessionStorage.setItem — captures pending claim storage. */
  onPendingClaimSaved?: (key: string, value: string) => void;
}) {
  const { fetchImpl, onNavigate, onPostMessage, onBannerShown, onSignInRedirect, onPendingClaimSaved } = deps;

  const PENDING_CLAIM_KEY = 'artwork_pending_claim';

  function showClaimError(message: string) {
    onBannerShown(message);
  }

  function showSignInBanner(loginUrl: string) {
    if (onSignInRedirect) onSignInRedirect(loginUrl);
    // The banner itself is a DOM concern — we record the login URL for test assertions.
  }

  function handleAuthRequired(orderId: number | string, accessToken: string, cartUrl: string) {
    // Persist pending claim (stub captured by test)
    const payload = JSON.stringify({ orderId, accessToken, cartUrl });
    if (onPendingClaimSaved) onPendingClaimSaved(PENDING_CLAIM_KEY, payload);

    // Route through logout first so a wrong-account session is cleared before the login form
    const returnUrl = 'https://example.com/product/1'; // stub for window.location.href
    const loginUrl = '/web/login?redirect=' + encodeURIComponent(returnUrl);
    const signInUrl = '/web/session/logout?redirect=' + encodeURIComponent(loginUrl);
    showSignInBanner(signInUrl);
  }

  async function handleClaimCart(event: {
    data: {
      orderId?: number | string;
      accessToken?: string;
      cartUrl?: string;
      skipNavigation?: boolean;
    };
    source?: { postMessage: (msg: unknown, origin: string) => void } | null;
  }) {
    const orderId = event.data.orderId;
    const accessToken = event.data.accessToken || '';
    const cartUrl = event.data.cartUrl || '/shop/cart';
    const skipNavigation = event.data.skipNavigation || false;

    if (!orderId) {
      if (event.source) {
        event.source.postMessage({ type: 'cart-claimed', success: false, error: 'Missing orderId' }, '*');
        onPostMessage({ type: 'cart-claimed', success: false, error: 'Missing orderId' });
      }
      return;
    }

    let url = '/artwork/claim-cart?order_id=' + orderId;
    if (accessToken) {
      url += '&access_token=' + encodeURIComponent(accessToken);
    }

    try {
      const response = await fetchImpl(url, { method: 'GET', credentials: 'include' });

      // 403 → session expired; prompt sign-in instead of a generic error banner
      if (response.status === 403) {
        if (!skipNavigation) {
          handleAuthRequired(orderId, accessToken, cartUrl);
        }
        if (event.source) {
          const msg: CartClaimedMessage = { type: 'cart-claimed', success: false, orderId, error: 'Session expired — please sign in' };
          event.source.postMessage(msg, '*');
          onPostMessage(msg);
        }
        return;
      }

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        if (event.source) {
          const msg: CartClaimedMessage = { type: 'cart-claimed', success: true, orderId };
          event.source.postMessage(msg, '*');
          onPostMessage(msg);
        }
        if (!skipNavigation) {
          onNavigate(cartUrl);
        }
      } else {
        const errorMsg = data.error || 'Failed to claim cart';
        if (event.source) {
          const msg: CartClaimedMessage = { type: 'cart-claimed', success: false, orderId, error: errorMsg };
          event.source.postMessage(msg, '*');
          onPostMessage(msg);
        }
        if (!skipNavigation) {
          showClaimError('Your cart could not be linked to this session. ' + errorMsg);
        }
      }
    } catch (error: any) {
      if (event.source) {
        const msg: CartClaimedMessage = { type: 'cart-claimed', success: false, orderId, error: error.message };
        event.source.postMessage(msg, '*');
        onPostMessage(msg);
      }
      if (!skipNavigation) {
        showClaimError('Network error while linking your cart. Please refresh and try again.');
      }
    }
  }

  /** Simulates the page-load auto-retry that runs after returning from /web/login */
  async function tryRetryPendingClaim(storedValue: string | null) {
    if (!storedValue) return;
    let pending: { orderId?: number | string; accessToken?: string; cartUrl?: string };
    try {
      pending = JSON.parse(storedValue);
    } catch (e) {
      return;
    }
    if (!pending.orderId) return;
    await handleClaimCart({
      data: {
        orderId: pending.orderId,
        accessToken: pending.accessToken || '',
        cartUrl: pending.cartUrl || '/shop/cart',
        skipNavigation: false,
      },
      source: null,
    });
  }

  return { handleClaimCart, tryRetryPendingClaim };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface Case {
  name: string;
  run: () => Promise<void>;
}

const cases: Case[] = [];

function test(name: string, fn: () => Promise<void>) {
  cases.push({ name, run: fn });
}

function makeFakeSource() {
  const received: CartClaimedMessage[] = [];
  return {
    postMessage: (msg: CartClaimedMessage) => received.push(msg),
    received,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Successful single claim navigates to cart
// ---------------------------------------------------------------------------
test('single successful claim navigates to /shop/cart', async () => {
  const fetchCalls: MockFetchCall[] = [];
  const navigations: string[] = [];
  const postMessages: CartClaimedMessage[] = [];
  const banners: string[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({ success: true, cart_quantity: 1 }) };
    },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: (msg) => postMessages.push(msg),
    onBannerShown: (msg) => banners.push(msg),
  });

  const source = makeFakeSource();
  await handler.handleClaimCart({
    data: { orderId: 42, accessToken: 'tok_abc', cartUrl: '/shop/cart' },
    source: { postMessage: (msg: unknown) => source.postMessage(msg as CartClaimedMessage) },
  });

  assert.equal(fetchCalls.length, 1, 'exactly one fetch call');
  assert.ok(fetchCalls[0].url.includes('order_id=42'), 'URL contains order_id=42');
  assert.ok(fetchCalls[0].url.includes('access_token=tok_abc'), 'URL contains access_token');
  assert.equal(fetchCalls[0].method, 'GET', 'uses GET (matches type=http route)');
  assert.equal(fetchCalls[0].credentials, 'include', 'sends session cookie');
  assert.equal(navigations.length, 1, 'navigates once');
  assert.equal(navigations[0], '/shop/cart');
  assert.equal(postMessages[0].success, true);
  assert.equal(banners.length, 0, 'no error banner on success');
});

// ---------------------------------------------------------------------------
// Test 2: Four sequential DTF additions — all claim, last one navigates
// ---------------------------------------------------------------------------
test('four sequential additions: each claims independently, final navigate goes to cart', async () => {
  const fetchCalls: MockFetchCall[] = [];
  const navigations: string[] = [];
  const postMessages: CartClaimedMessage[] = [];
  const banners: string[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({ success: true, cart_quantity: fetchCalls.length }) };
    },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: (msg) => postMessages.push(msg),
    onBannerShown: (msg) => banners.push(msg),
  });

  const orderIds = [101, 101, 101, 101]; // same Odoo draft order (multi-line additions)
  const cartUrl = 'https://www.completetransfers.com/shop/cart';

  // First three additions: skipNavigation=true (background claims)
  for (let i = 0; i < 3; i++) {
    const source = makeFakeSource();
    await handler.handleClaimCart({
      data: {
        orderId: orderIds[i],
        accessToken: `tok_${i}`,
        cartUrl,
        skipNavigation: true,
      },
      source: { postMessage: (msg: unknown) => source.postMessage(msg as CartClaimedMessage) },
    });
  }

  // Fourth addition: navigates to cart
  const source = makeFakeSource();
  await handler.handleClaimCart({
    data: {
      orderId: orderIds[3],
      accessToken: 'tok_3',
      cartUrl,
      skipNavigation: false,
    },
    source: { postMessage: (msg: unknown) => source.postMessage(msg as CartClaimedMessage) },
  });

  assert.equal(fetchCalls.length, 4, 'four fetch calls — one per addition');
  // All fetches must use GET (not POST with JSON body)
  assert.ok(fetchCalls.every(c => c.method === 'GET'), 'all fetches use GET');
  // All fetches must include credentials
  assert.ok(fetchCalls.every(c => c.credentials === 'include'), 'all fetches include session cookie');
  // Navigation happens exactly once (on the fourth, confirmed claim)
  assert.equal(navigations.length, 1, 'navigates exactly once');
  assert.equal(navigations[0], cartUrl, 'navigates to the correct cart URL');
  // All four claims confirmed as successful
  assert.equal(postMessages.filter(m => m.success).length, 4, 'four successful cart-claimed messages');
  assert.equal(banners.length, 0, 'no error banners on success');
});

// ---------------------------------------------------------------------------
// Test 3: Failed claim shows error banner, does NOT navigate
// ---------------------------------------------------------------------------
test('failed claim shows banner and does not navigate', async () => {
  const navigations: string[] = [];
  const banners: string[] = [];

  const handler = makeHandler({
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({ error: 'You are not authorized to claim this cart' }),
    }),
    onNavigate: (href) => navigations.push(href),
    onPostMessage: () => {},
    onBannerShown: (msg) => banners.push(msg),
  });

  await handler.handleClaimCart({
    data: { orderId: 99, accessToken: 'bad_tok', cartUrl: '/shop/cart' },
    source: null,
  });

  assert.equal(navigations.length, 0, 'must NOT navigate on failed claim');
  assert.equal(banners.length, 1, 'must show one error banner');
  assert.ok(banners[0].includes('not authorized'), 'banner contains the error detail');
});

// ---------------------------------------------------------------------------
// Test 4: Network error shows banner, does NOT navigate
// ---------------------------------------------------------------------------
test('network error shows banner and does not navigate', async () => {
  const navigations: string[] = [];
  const banners: string[] = [];

  const handler = makeHandler({
    fetchImpl: async () => { throw new Error('Failed to fetch'); },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: () => {},
    onBannerShown: (msg) => banners.push(msg),
  });

  await handler.handleClaimCart({
    data: { orderId: 55, accessToken: 'tok', cartUrl: '/shop/cart' },
    source: null,
  });

  assert.equal(navigations.length, 0, 'must NOT navigate on network error');
  assert.equal(banners.length, 1, 'must show error banner');
  assert.ok(banners[0].toLowerCase().includes('network'), 'banner mentions network error');
});

// ---------------------------------------------------------------------------
// Test 5: Missing orderId — sends error, does not fetch or navigate
// ---------------------------------------------------------------------------
test('missing orderId sends error and does not fetch', async () => {
  const fetchCalls: MockFetchCall[] = [];
  const navigations: string[] = [];
  const postMessages: CartClaimedMessage[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({}) };
    },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: (msg) => postMessages.push(msg),
    onBannerShown: () => {},
  });

  const source = makeFakeSource();
  await handler.handleClaimCart({
    data: { cartUrl: '/shop/cart' },
    source: { postMessage: (msg: unknown) => source.postMessage(msg as CartClaimedMessage) },
  });

  assert.equal(fetchCalls.length, 0, 'no fetch without orderId');
  assert.equal(navigations.length, 0, 'no navigation without orderId');
  assert.equal(postMessages[0]?.success, false, 'sends failure message');
  assert.ok(postMessages[0]?.error?.toLowerCase().includes('orderid') ||
            postMessages[0]?.error?.toLowerCase().includes('order_id') ||
            postMessages[0]?.error?.toLowerCase().includes('missing'), 'error mentions missing orderId');
});

// ---------------------------------------------------------------------------
// Test 6: Claim URL uses GET query params (not POST JSON body)
//         — validates the parameter shape expected by the Odoo type='http' route
// ---------------------------------------------------------------------------
test('claim URL uses GET query-string params matching the Odoo http route', async () => {
  const fetchCalls: MockFetchCall[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({ success: true }) };
    },
    onNavigate: () => {},
    onPostMessage: () => {},
    onBannerShown: () => {},
  });

  await handler.handleClaimCart({
    data: { orderId: 123, accessToken: 'tok/with+special=chars', cartUrl: '/shop/cart', skipNavigation: true },
    source: null,
  });

  assert.equal(fetchCalls.length, 1);
  const url = fetchCalls[0].url;
  // Must be a GET with query params — the Odoo type='http' route reads params, NOT a JSON body
  assert.ok(url.startsWith('/artwork/claim-cart?'), 'uses the claim-cart endpoint');
  assert.ok(url.includes('order_id=123'), 'order_id in query string (not JSON body)');
  // access_token must be percent-encoded
  assert.ok(url.includes('access_token='), 'access_token in query string');
  assert.ok(!url.includes('tok/with+special=chars'), 'special chars are percent-encoded');
  assert.equal(fetchCalls[0].method, 'GET', 'must be GET, not POST');
});

// ---------------------------------------------------------------------------
// Test 7: 403 response — shows sign-in banner, does NOT show generic error,
//         stores pending claim in sessionStorage, does NOT navigate
// ---------------------------------------------------------------------------
test('403 response triggers sign-in-and-retry flow, not a generic error banner', async () => {
  const navigations: string[] = [];
  const banners: string[] = [];
  const signInRedirects: string[] = [];
  const savedClaims: Array<{ key: string; value: string }> = [];
  const postMessages: CartClaimedMessage[] = [];

  const handler = makeHandler({
    fetchImpl: async () => ({ status: 403, json: async () => ({}) }),
    onNavigate: (href) => navigations.push(href),
    onPostMessage: (msg) => postMessages.push(msg),
    onBannerShown: (msg) => banners.push(msg),
    onSignInRedirect: (url) => signInRedirects.push(url),
    onPendingClaimSaved: (key, value) => savedClaims.push({ key, value }),
  });

  const source = makeFakeSource();
  await handler.handleClaimCart({
    data: { orderId: 77, accessToken: 'expired_tok', cartUrl: '/shop/cart' },
    source: { postMessage: (msg: unknown) => source.postMessage(msg as CartClaimedMessage) },
  });

  // Must NOT navigate to cart on 403
  assert.equal(navigations.length, 0, 'must NOT navigate on 403');
  // Generic error banner must NOT be shown — sign-in banner replaces it
  assert.equal(banners.length, 0, 'generic error banner must not be shown on 403');
  // Sign-in redirect must be triggered and route through logout first
  assert.equal(signInRedirects.length, 1, 'sign-in redirect must be triggered');
  assert.ok(signInRedirects[0].includes('/web/session/logout'), 'routes through logout to clear wrong-account sessions');
  assert.ok(signInRedirects[0].includes('redirect='), 'logout URL carries a redirect param');
  // The encoded redirect must contain /web/login so the user lands on the login form
  assert.ok(signInRedirects[0].includes(encodeURIComponent('/web/login')), 'logout redirect points to /web/login');
  // Pending claim must be saved to sessionStorage
  assert.equal(savedClaims.length, 1, 'pending claim saved to storage');
  const saved = JSON.parse(savedClaims[0].value);
  assert.equal(saved.orderId, 77, 'saved orderId matches');
  assert.equal(saved.accessToken, 'expired_tok', 'saved accessToken matches');
  assert.equal(saved.cartUrl, '/shop/cart', 'saved cartUrl matches');
  // iframe must still get a failure postMessage
  assert.equal(postMessages.filter(m => !m.success).length, 1, 'iframe notified of failure');
  assert.ok(postMessages[0].error?.toLowerCase().includes('sign in') ||
            postMessages[0].error?.toLowerCase().includes('session') ||
            postMessages[0].error?.toLowerCase().includes('expired'), 'error message describes auth failure');
});

// ---------------------------------------------------------------------------
// Test 8: After sign-in redirect, tryRetryPendingClaim auto-retries and
//         navigates to cart on success
// ---------------------------------------------------------------------------
test('pending claim is auto-retried after sign-in and navigates to cart on success', async () => {
  const navigations: string[] = [];
  const banners: string[] = [];
  const signInRedirects: string[] = [];
  const fetchCalls: MockFetchCall[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({ success: true }) };
    },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: () => {},
    onBannerShown: (msg) => banners.push(msg),
    onSignInRedirect: (url) => signInRedirects.push(url),
  });

  // Simulate what sessionStorage holds after the user saved a pending claim
  const storedClaim = JSON.stringify({ orderId: 88, accessToken: 'fresh_tok', cartUrl: '/shop/cart' });
  await handler.tryRetryPendingClaim(storedClaim);

  // Must fetch the claim endpoint
  assert.equal(fetchCalls.length, 1, 'one fetch call on retry');
  assert.ok(fetchCalls[0].url.includes('order_id=88'), 'retried with correct orderId');
  assert.ok(fetchCalls[0].url.includes('access_token='), 'retried with accessToken');
  // Must navigate to cart after successful retry
  assert.equal(navigations.length, 1, 'navigates after successful retry');
  assert.equal(navigations[0], '/shop/cart', 'navigates to cart URL from pending claim');
  // No error banner on success
  assert.equal(banners.length, 0, 'no error banner when retry succeeds');
  // No sign-in redirect on success
  assert.equal(signInRedirects.length, 0, 'no sign-in redirect when retry succeeds');
});

// ---------------------------------------------------------------------------
// Test 9: tryRetryPendingClaim with null/empty storage — does nothing
// ---------------------------------------------------------------------------
test('tryRetryPendingClaim with no stored claim is a no-op', async () => {
  const navigations: string[] = [];
  const fetchCalls: MockFetchCall[] = [];

  const handler = makeHandler({
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, method: opts.method as string, credentials: opts.credentials as string });
      return { status: 200, json: async () => ({ success: true }) };
    },
    onNavigate: (href) => navigations.push(href),
    onPostMessage: () => {},
    onBannerShown: () => {},
  });

  await handler.tryRetryPendingClaim(null);

  assert.equal(fetchCalls.length, 0, 'no fetch when storage is empty');
  assert.equal(navigations.length, 0, 'no navigation when storage is empty');
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
let failed = 0;
let passed = 0;

console.log(`\nclaim-cart handler — ${cases.length} regression tests\n`);

for (const c of cases) {
  try {
    await c.run();
    console.log(`✔ ${c.name}`);
    passed++;
  } catch (err: any) {
    console.log(`✗ ${c.name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log(`\n=== ${passed} pass, ${failed} fail ===\n`);
process.exit(failed > 0 ? 1 : 0);
