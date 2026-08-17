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
  fetchImpl: (url: string, opts: RequestInit) => Promise<{ json: () => Promise<unknown> }>;
  onNavigate: (href: string) => void;
  onPostMessage: (msg: CartClaimedMessage) => void;
  onBannerShown: (msg: string) => void;
}) {
  const { fetchImpl, onNavigate, onPostMessage, onBannerShown } = deps;

  function showClaimError(message: string) {
    onBannerShown(message);
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

  return { handleClaimCart };
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
      return { json: async () => ({ success: true, cart_quantity: 1 }) };
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
      return { json: async () => ({ success: true, cart_quantity: fetchCalls.length }) };
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
      return { json: async () => ({}) };
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
      return { json: async () => ({ success: true }) };
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
