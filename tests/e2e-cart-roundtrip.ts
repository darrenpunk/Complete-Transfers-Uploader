#!/usr/bin/env tsx
/**
 * End-to-end add-to-cart → claim-cart → /shop/cart smoke test.
 *
 * Runs against a REAL deployed Odoo instance (staging by default) and verifies
 * the full round trip that the unit tests in tests/claim-cart.test.ts can only
 * mock:
 *
 *   1. Load /artwork/upload with a browser-like Odoo session (cookie jar).
 *      Optionally logs in as a portal user first (E2E_PORTAL_LOGIN/PASSWORD).
 *   1b. Negative control: assert the fresh session's /shop/cart is detected
 *      as EMPTY by the same detector used in step 4 (guards against Odoo
 *      markup drift silently making the final assertion vacuous).
 *   2. POST /api/projects/<uuid>/add-to-cart on the DEPLOYED REPLIT APP
 *      (the production proxy at E2E_APP_BASE_URL), passing the Odoo session
 *      cookie exactly like the browser iframe does. This exercises the
 *      deployed-app path (idempotency guard, Odoo proxying, PDF handling),
 *      not just the Odoo endpoint. Asserts the response carries
 *      `website_sale_order` (the orderId iframe_message_handler.js needs).
 *      Falls back to the direct Odoo route only with E2E_DIRECT_ODOO=1.
 *   3. GET /artwork/claim-cart?order_id=..&access_token=.. on Odoo with the
 *      SAME session cookie (mirrors handleClaimCart: GET + query params +
 *      credentials:'include'). Asserts success:true and cart_quantity >= 1.
 *   4. GET /shop/cart with the same cookie and asserts the rendered page
 *      shows at least one actual cart LINE and no empty-cart state.
 *
 * This catches misconfigured Odoo routes, CSRF/session-cookie regressions,
 * and claim-authorization breakage that pure unit tests cannot see.
 *
 * NOTE: step 2 creates a real draft sale order on the target Odoo instance.
 * The order is clearly named "E2E smoke <timestamp>" and stays a draft cart
 * (equivalent to an abandoned cart) — safe to ignore or delete.
 *
 *   npm run test:e2e                                        # production (default)
 *   E2E_ODOO_BASE_URL=https://stage... npm run test:e2e     # other instance
 *   E2E_PORTAL_LOGIN=user@x.com E2E_PORTAL_PASSWORD=... npm run test:e2e
 *   E2E_TEMPLATE=dtf-SRA3 npm run test:e2e                  # template/product to add
 *
 * Exit code: 0 all steps pass, 1 assertion failure, 2 infra error (target
 * unreachable etc.).
 */

import { randomUUID } from 'node:crypto';

// Default target is the DEPLOYED production Odoo (where the iframe actually
// runs). VITE_ODOO_URL currently points at a staging instance that 404s on
// /artwork/* (module not installed there), so it is intentionally NOT used as
// a fallback — override explicitly with E2E_ODOO_BASE_URL if staging comes back.
const BASE_URL = (
  process.env.E2E_ODOO_BASE_URL ||
  'https://www.completetransfers.com'
).replace(/\/$/, '');

// Deployed Replit app (the proxy the real iframe posts through).
const APP_BASE_URL = (
  process.env.E2E_APP_BASE_URL ||
  'https://proof-designer-darren190.replit.app'
).replace(/\/$/, '');
const DIRECT_ODOO = process.env.E2E_DIRECT_ODOO === '1';

const TEMPLATE = process.env.E2E_TEMPLATE || 'dtf-SRA3';
const PORTAL_LOGIN = process.env.E2E_PORTAL_LOGIN || '';
const PORTAL_PASSWORD = process.env.E2E_PORTAL_PASSWORD || '';
const TIMEOUT_MS = 60_000;

// Minimal valid one-page PDF (A4-ish) so the Odoo handler has artwork to attach.
const TINY_PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n164\n%%EOF\n'
).toString('base64');

// ---------------------------------------------------------------------------
// Tiny cookie jar — Odoo session flows entirely through the session_id cookie.
// ---------------------------------------------------------------------------
const jar = new Map<string, string>();

function storeCookies(res: Response) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// Empty-cart / cart-line detectors shared by the negative control (step 1b)
// and the final assertion (step 4). A cart LINE must match a row-scoped
// marker — wrapper-level classes like `js_cart_lines` render even when the
// cart is empty, so they must NOT be used here.
function detectEmptyCart(html: string): boolean {
  return /your cart is empty|cart is empty|o_wsale_cart_empty|oe_cart_empty/i.test(html);
}
function detectCartLine(html: string): boolean {
  return (
    /data-line-id="\d+"/i.test(html) ||                       // per-line row attribute
    /name="cart_quantity"[^>]*value="\d+"/i.test(html) ||     // per-line qty input
    /js_quantity[^>]*data-line-id/i.test(html) ||
    /<tr[^>]*class="[^"]*o_cart_product/i.test(html)
  );
}

async function http(path: string, init: RequestInit = {}, base: string = BASE_URL): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      redirect: 'manual',
      ...init,
      headers: {
        'User-Agent': 'ct-e2e-cart-roundtrip/1.0',
        ...(jar.size ? { Cookie: cookieHeader() } : {}),
        ...(init.headers || {}),
      },
      signal: ac.signal,
    });
    storeCookies(res);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function fail(step: string, detail: string): never {
  console.error(`\n✗ FAIL [${step}] ${detail}\n`);
  process.exit(1);
}

function pass(step: string, detail: string) {
  console.log(`✔ ${step} — ${detail}`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\ncart round-trip e2e — target: ${BASE_URL}\n`);

  // -- Step 0 (optional): portal login ------------------------------------
  if (PORTAL_LOGIN && PORTAL_PASSWORD) {
    const loginPage = await http('/web/login');
    const html = await loginPage.text();
    const csrf = html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1];
    if (!csrf) fail('login', 'could not scrape csrf_token from /web/login');
    const form = new URLSearchParams({
      csrf_token: csrf!,
      login: PORTAL_LOGIN,
      password: PORTAL_PASSWORD,
      redirect: '/my',
    });
    const loginRes = await http('/web/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    // Successful Odoo login redirects (303) to `redirect`; failure re-renders 200.
    if (loginRes.status < 300 || loginRes.status >= 400) {
      fail('login', `portal login did not redirect (status ${loginRes.status}) — bad credentials?`);
    }
    pass('login', `logged in as portal user ${PORTAL_LOGIN}`);
  } else {
    console.log('ℹ no E2E_PORTAL_LOGIN/E2E_PORTAL_PASSWORD set — running as public visitor');
    console.log('  (claim still validates via access_token, matching the iframe flow)');
  }

  // -- Step 1: load /artwork/upload (establishes/confirms session) --------
  const uploadPage = await http('/artwork/upload');
  if (uploadPage.status !== 200) {
    fail('upload-page', `/artwork/upload returned ${uploadPage.status}`);
  }
  if (!jar.has('session_id')) {
    fail('upload-page', 'no session_id cookie received — session flow broken');
  }
  pass('upload-page', `/artwork/upload 200, session cookie established`);

  // -- Step 1b: negative control — fresh session cart must read as EMPTY ---
  // If Odoo markup drifts so our detectors stop recognizing the empty state,
  // this fails loudly instead of letting step 4 pass vacuously.
  {
    const emptyRes = await http('/shop/cart');
    const emptyHtml = await emptyRes.text();
    if (emptyRes.status !== 200) fail('empty-cart-control', `/shop/cart returned ${emptyRes.status}`);
    if (detectCartLine(emptyHtml)) {
      fail('empty-cart-control', 'fresh session already shows a cart line — detector or session isolation broken');
    }
    if (!detectEmptyCart(emptyHtml)) {
      fail('empty-cart-control', 'empty-cart marker not recognized on a fresh session — update detectEmptyCart()');
    }
    pass('empty-cart-control', 'fresh session /shop/cart correctly detected as empty');
  }

  // -- Step 2: add to cart THROUGH THE DEPLOYED REPLIT APP PROXY ----------
  // The browser iframe posts to the deployed app's /api/projects/:id/add-to-cart,
  // which forwards our Odoo session cookie upstream. Exercising this path
  // catches regressions in the deployed proxy, not just in Odoo.
  const projectUuid = randomUUID();
  const addPath = DIRECT_ODOO
    ? `/artwork/api/projects/${projectUuid}/add-to-cart`
    : `/api/projects/${projectUuid}/add-to-cart`;
  const addBase = DIRECT_ODOO ? BASE_URL : APP_BASE_URL;
  console.log(`ℹ add-to-cart via ${DIRECT_ODOO ? 'Odoo directly' : `deployed app ${APP_BASE_URL}`}`);
  const addRes = await http(addPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `e2e-${projectUuid}`,
    },
    body: JSON.stringify({
      name: `E2E smoke ${new Date().toISOString()}`,
      templateSize: TEMPLATE,
      quantity: 10,
      totalQuantity: 10,
      comments: 'Automated e2e cart round-trip smoke test — safe to delete',
      pdfBase64: TINY_PDF_BASE64,
      source: 'e2e-smoke-test',
      ...(PORTAL_LOGIN ? { partnerEmail: PORTAL_LOGIN } : {}),
    }),
  }, addBase);
  const addText = await addRes.text();
  if (!addRes.ok) {
    fail('add-to-cart', `HTTP ${addRes.status}: ${addText.slice(0, 300)}`);
  }
  let add: any;
  try { add = JSON.parse(addText); } catch {
    fail('add-to-cart', `non-JSON response: ${addText.slice(0, 300)}`);
  }
  if (add.error) fail('add-to-cart', `Odoo returned error: ${add.error}`);
  const orderId = add.website_sale_order;
  const accessToken = add.access_token || '';
  if (!orderId) {
    fail('add-to-cart', `response missing website_sale_order (the orderId the iframe postMessage needs): ${addText.slice(0, 300)}`);
  }
  // Odoo mints access_token only on the partnerEmail lookup path (the one the
  // deployed Replit proxy uses). The same-session public path returns '' and
  // the claim is instead authorized by session ownership of the cart.
  if (PORTAL_LOGIN && !accessToken) {
    fail('add-to-cart', `partnerEmail path returned no access_token — cross-session claim would break: ${addText.slice(0, 300)}`);
  }
  if (!accessToken) {
    console.log('ℹ no access_token (same-session cart) — claim will rely on session ownership');
  }
  pass('add-to-cart', `order #${orderId} created${accessToken ? ', access_token present' : ''}`);

  // -- Step 3: claim the cart (mirrors handleClaimCart exactly) -----------
  const claimRes = await http(
    `/artwork/claim-cart?order_id=${orderId}&access_token=${encodeURIComponent(accessToken)}`,
    { method: 'GET' },
  );
  const claimText = await claimRes.text();
  if (!claimRes.ok) {
    fail('claim-cart', `HTTP ${claimRes.status}: ${claimText.slice(0, 300)}`);
  }
  let claim: any;
  try { claim = JSON.parse(claimText); } catch {
    fail('claim-cart', `non-JSON response (route misconfigured?): ${claimText.slice(0, 300)}`);
  }
  if (claim.success !== true) {
    fail('claim-cart', `success!==true: ${claimText.slice(0, 300)}`);
  }
  if (!(Number(claim.cart_quantity) >= 1)) {
    fail('claim-cart', `cart_quantity is ${claim.cart_quantity}, expected >= 1`);
  }
  pass('claim-cart', `claimed order #${orderId}, cart_quantity=${claim.cart_quantity}`);

  // -- Step 4: /shop/cart must render at least one cart line --------------
  let cartRes = await http('/shop/cart');
  // follow one redirect if the site normalizes the URL
  if (cartRes.status >= 300 && cartRes.status < 400) {
    const loc = cartRes.headers.get('location') || '/shop/cart';
    cartRes = await http(loc.startsWith('http') ? loc.replace(BASE_URL, '') : loc);
  }
  if (cartRes.status !== 200) fail('shop-cart', `/shop/cart returned ${cartRes.status}`);
  const cartHtml = await cartRes.text();

  // Empty-cart state is an unconditional failure — no marker can override it.
  if (detectEmptyCart(cartHtml)) {
    fail('shop-cart', '/shop/cart renders the EMPTY cart state — round trip broken');
  }
  if (!detectCartLine(cartHtml)) {
    fail('shop-cart', 'no cart-line row markup found on /shop/cart (and page is not the empty state) — update detectCartLine()');
  }
  pass('shop-cart', 'cart page shows at least one cart line');

  console.log(`\n=== e2e round trip OK (order #${orderId} on ${BASE_URL}) ===\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ INFRA ERROR: ${err?.message || err}\n`);
  process.exit(2);
});
