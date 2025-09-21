/**
 * SUCCESS Space minimal server
 * - Serves static files from public/
 * - Provides simple JSON APIs for orders and bookings
 * - Stores data in data/ as JSON (no external DB)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const dataDir = path.join(root, 'data');
const ordersFile = path.join(dataDir, 'orders.json');
const bookingsFile = path.join(dataDir, 'bookings.json');
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const eventsFile = path.join(dataDir, 'events.json');
const inventoryFile = path.join(dataDir, 'inventory.json');
const brandingFile = path.join(dataDir, 'branding.json');
const menuFile = path.join(dataDir, 'menu.json');
const workspacesFile = path.join(dataDir, 'workspaces.json');
const uploadsDir = path.join(publicDir, 'uploads');
const alertsFile = path.join(dataDir, 'alerts.json');
const notificationsFile = path.join(dataDir, 'notifications.json');

// Ensure data folder and files exist
function ensureData() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, '[]');
  if (!fs.existsSync(bookingsFile)) fs.writeFileSync(bookingsFile, '[]');
  if (!fs.existsSync(eventsFile)) fs.writeFileSync(eventsFile, '[]');
  if (!fs.existsSync(inventoryFile)) fs.writeFileSync(inventoryFile, JSON.stringify([
    { id: 'drip', name: 'Drip Coffee Beans (lb)', qty: 20 },
    { id: 'milk', name: 'Milk (gallons)', qty: 10 },
    { id: 'oat', name: 'Oat Milk (cartons)', qty: 8 },
    { id: 'cups12', name: '12oz Cups', qty: 200 },
  ], null, 2));
  if (!fs.existsSync(brandingFile)) fs.writeFileSync(brandingFile, JSON.stringify({
    siteName: 'SUCCESS Space',
    primaryColor: '#0ea5e9',
    logoUrl: '',
    menuImages: {}
  }, null, 2));
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([
    { id: 'u_admin', role: 'admin', name: 'Admin User', email: 'admin@success.space', password: 'admin123' },
    { id: 'u_staff', role: 'staff', name: 'Cafe Staff', email: 'staff@success.space', password: 'staff123' },
    { id: 'u_cust', role: 'customer', name: 'Customer One', email: 'customer@success.space', password: 'customer123', membership: 'Gold', discountPercent: 10 }
  ], null, 2));
  if (!fs.existsSync(sessionsFile)) fs.writeFileSync(sessionsFile, '{}');
  if (!fs.existsSync(menuFile)) fs.writeFileSync(menuFile, JSON.stringify([
    { id: 'drip', name: 'Drip Coffee', price: 3.00, description: 'Freshly brewed single-origin coffee.', imageUrl: '' },
    { id: 'latte', name: 'Latte', price: 4.50, description: 'Espresso with steamed milk.', imageUrl: '' },
    { id: 'muffin', name: 'Blueberry Muffin', price: 2.75, description: 'Fresh-baked, lightly sweet.', imageUrl: '' }
  ], null, 2));
  if (!fs.existsSync(workspacesFile)) fs.writeFileSync(workspacesFile, JSON.stringify([
    { id: 'open-desk', name: 'Hot Desk', type: 'open-desk', capacity: 1, description: 'Flexible seating in open area.', imageUrl: '' },
    { id: 'private-office', name: 'Private Office', type: 'private-office', capacity: 4, description: 'Quiet office for teams.', imageUrl: '' },
    { id: 'conference', name: 'Conference Room', type: 'conference', capacity: 8, description: 'AV-equipped meeting room.', imageUrl: '' }
  ], null, 2));
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(alertsFile)) fs.writeFileSync(alertsFile, '[]');
  if (!fs.existsSync(notificationsFile)) fs.writeFileSync(notificationsFile, '[]');
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      // basic body size guard (~1MB)
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res, status, content, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(content);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function checkLowInventoryAndAlert(items) {
  try {
    const alerts = readJson(alertsFile);
    const now = new Date().toISOString();
    items.forEach(i => {
      const warn = Number(i.warnQty || 0);
      if (warn > 0 && Number(i.qty || 0) <= warn) {
        alerts.push({ id: 'al_' + Date.now() + '_' + i.id, itemId: i.id, name: i.name, qty: Number(i.qty||0), warnQty: warn, createdAt: now, type: 'low_inventory' });
      }
    });
    writeJson(alertsFile, alerts);
  } catch {}
}

function parseCookies(req) {
  const header = req.headers['cookie'] || '';
  return header.split(';').reduce((acc, part) => {
    const [k, v] = part.trim().split('=');
    if (k) acc[k] = decodeURIComponent(v || '');
    return acc;
  }, {});
}

function getSession(req) {
  try {
    const cookies = parseCookies(req);
    const sid = cookies['sid'];
    if (!sid) return null;
    const sessions = readJson(sessionsFile);
    const session = sessions[sid];
    if (!session) return null;
    const users = readJson(usersFile);
    const user = users.find(u => u.id === session.userId);
    return user || null;
  } catch { return null; }
}

function requireRole(req, res, roles) {
  const user = getSession(req);
  if (!user || !roles.includes(user.role)) {
    send(res, 401, 'Unauthorized');
    return null;
  }
  return user;
}

function saveBase64Image(data, filenameHint='upload') {
  // data can be raw base64 or dataURL
  let base64 = data;
  let ext = 'png';
  const dataUrlMatch = /^data:(.+?);base64,(.*)$/.exec(data);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1];
    base64 = dataUrlMatch[2];
    if (mime === 'image/jpeg') ext = 'jpg';
    if (mime === 'image/png') ext = 'png';
    if (mime === 'image/gif') ext = 'gif';
    if (mime === 'image/webp') ext = 'webp';
  } else {
    const hint = filenameHint.toLowerCase();
    if (hint.endsWith('.jpg') || hint.endsWith('.jpeg')) ext = 'jpg';
    if (hint.endsWith('.png')) ext = 'png';
    if (hint.endsWith('.gif')) ext = 'gif';
    if (hint.endsWith('.webp')) ext = 'webp';
  }
  const id = crypto.randomBytes(8).toString('hex');
  const file = path.join(uploadsDir, `${id}.${ext}`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return `/uploads/${id}.${ext}`;
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname || '/');

  // Default to index.html
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, 'Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
    };
    const contentType = types[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

function requireAdminToken(reqUrl) {
  const q = url.parse(reqUrl, true).query;
  const token = q.token || '';
  return ADMIN_TOKEN && token && token === ADMIN_TOKEN;
}

function appendJson(file, item) {
  const list = JSON.parse(fs.readFileSync(file, 'utf-8'));
  list.push(item);
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

function handleApi(req, res) {
  const { pathname } = url.parse(req.url);

  // Auth endpoints
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { email, password } = data || {};
      if (!email || !password) return send(res, 400, 'Email and password required');
      const users = readJson(usersFile);
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) return send(res, 401, 'Invalid credentials');
      const sid = 'sess_' + crypto.randomBytes(16).toString('hex');
      const sessions = readJson(sessionsFile);
      sessions[sid] = { userId: user.id, createdAt: Date.now() };
      writeJson(sessionsFile, sessions);
      res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax`);
      const { password: _, ...safe } = user;
      return sendJson(res, 200, { ok: true, user: safe });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const cookies = parseCookies(req);
    const sid = cookies['sid'];
    if (sid) {
      const sessions = readJson(sessionsFile);
      delete sessions[sid];
      writeJson(sessionsFile, sessions);
    }
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getSession(req);
    if (!user) return sendJson(res, 200, { user: null });
    const { password: _, ...safe } = user;
    return sendJson(res, 200, { user: safe });
  }

  // Ordering
  if (req.method === 'POST' && pathname === '/api/order') {
    return readBody(req)
      .then(body => {
        let data;
        try { data = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, 'Invalid JSON'); }
        // Basic validation
        const { items, customer } = data || {};
        if (!Array.isArray(items) || items.length === 0) return send(res, 400, 'Items required');
        if (!customer || !customer.name || !customer.email) return send(res, 400, 'Customer name and email required');
        const order = {
          id: 'ord_' + Date.now(),
          createdAt: new Date().toISOString(),
          items,
          customer,
          notes: data.notes || '',
          status: 'received',
        };
        appendJson(ordersFile, order);
        sendJson(res, 201, { ok: true, order });
      })
      .catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Staff POS: create an order from the POS (staff user), optionally process payment (cash or Square), decrement inventory
  if (req.method === 'POST' && pathname === '/api/staff/pos/order') {
    const user = requireRole(req, res, ['staff','admin']); if (!user) return;
    return readBody(req).then(async body => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, 'Invalid JSON'); }
      const { items, customer, notes, payment } = data || {};
      if (!Array.isArray(items) || items.length === 0) return send(res, 400, 'Items required');

      // Compute total (in cents) for payment providers
      const totalCents = Math.round((items.reduce((s,it) => s + ((Number(it.price)||0) * (Number(it.qty)||0)), 0) || 0) * 100);

      // Payment handling
      let paymentResult = { status: 'pending' };
      try {
        if (payment && payment.method === 'square') {
          // Require configuration
          const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
          if (!SQUARE_TOKEN) return send(res, 400, 'Square not configured on server');
          // Expect payment.token (a card nonce or payment_source id). For production you must use Square Web Payments SDK to obtain this token client-side.
          const sourceId = (payment.token || '').toString();
          if (!sourceId) return send(res, 400, 'Payment token required for Square');
          // Call Square Payments API
          const https = require('https');
          const payload = JSON.stringify({
            source_id: sourceId,
            idempotency_key: 'pos_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            amount_money: { amount: totalCents, currency: 'USD' }
          });
          const opts = {
            hostname: 'connect.squareup.com', path: '/v2/payments', method: 'POST',
            headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          };
          paymentResult = await new Promise((resolve, reject) => {
            const reqp = https.request(opts, (resp) => {
              let data = '';
              resp.on('data', c => data += c);
              resp.on('end', () => {
                try { const j = JSON.parse(data || '{}');
                  if (resp.statusCode >= 200 && resp.statusCode < 300 && j.payment) {
                    resolve({ status: 'paid', provider: 'square', providerPaymentId: j.payment.id, raw: j });
                  } else {
                    resolve({ status: 'failed', provider: 'square', error: j });
                  }
                } catch (e) { resolve({ status: 'failed', provider: 'square', error: e.message }); }
              });
            });
            reqp.on('error', (err) => resolve({ status: 'failed', provider: 'square', error: err.message }));
            reqp.write(payload); reqp.end();
          });
          if (paymentResult.status !== 'paid') return send(res, 402, JSON.stringify({ ok: false, payment: paymentResult }));
        } else if (payment && payment.method === 'cash') {
          paymentResult = { status: 'paid', method: 'cash', tendered: payment.tendered || null };
        } else {
          // No payment info: treat as unpaid or store as pending
          paymentResult = { status: 'pending' };
        }
      } catch (e) {
        paymentResult = { status: 'failed', error: e.message || String(e) };
      }

      // Build order and persist
      const order = { id: 'ord_' + Date.now(), createdAt: new Date().toISOString(), items, customer: customer || { name: 'Walk-in', email: '' }, notes: notes || '', status: paymentResult.status === 'paid' ? 'received' : 'pending', staffId: user.id, payment: paymentResult };
      appendJson(ordersFile, order);

      // Decrement inventory for items that match inventory by name or id
      try {
        const inv = readJson(inventoryFile);
        items.forEach(it => {
          const match = inv.find(ii => (ii.id && ii.id === it.id) || (ii.name && ii.name === it.name));
          if (match) {
            const dec = Number(it.qty) || 1;
            match.qty = Math.max(0, Number(match.qty || 0) - dec);
          }
        });
        writeJson(inventoryFile, inv);
        checkLowInventoryAndAlert(inv);
      } catch (e) {
        // non-fatal
      }

      return sendJson(res, 201, { ok: true, order });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  if (req.method === 'POST' && pathname === '/api/booking') {
    return readBody(req)
      .then(body => {
        let data;
        try { data = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, 'Invalid JSON'); }
        // Basic validation
        const { date, startTime, endTime, roomType, attendees, contact } = data || {};
        if (!date || !startTime || !endTime) return send(res, 400, 'Date and time required');
        if (!contact || !contact.name || !contact.email) return send(res, 400, 'Contact name and email required');
        const booking = {
          id: 'bk_' + Date.now(),
          createdAt: new Date().toISOString(),
          date, startTime, endTime, roomType: roomType || 'open-desk', attendees: attendees || 1,
          purpose: data.purpose || '',
          contact,
          depositAmount: typeof data.depositAmount === 'number' ? data.depositAmount : 0,
          depositStatus: data.depositStatus || 'due',
          status: 'requested',
        };
        appendJson(bookingsFile, booking);
        sendJson(res, 201, { ok: true, booking });
      })
      .catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Admin + Staff + Customer endpoints
  if (req.method === 'GET' && pathname === '/api/admin/orders') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    const list = readJson(ordersFile);
    return sendJson(res, 200, list);
  }

  if (req.method === 'GET' && pathname === '/api/staff/orders') {
    const user = requireRole(req, res, ['staff', 'admin']); if (!user) return;
    const list = readJson(ordersFile);
    return sendJson(res, 200, list);
  }
  if (req.method === 'POST' && pathname === '/api/staff/orders/status') {
    const user = requireRole(req, res, ['staff', 'admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id, status } = data || {};
      const allowed = ['received','in_progress','ready','completed','canceled'];
      if (!id || !allowed.includes(status)) return send(res, 400, 'invalid id or status');
      const list = readJson(ordersFile).map(o => o.id === id ? { ...o, status, statusUpdatedAt: new Date().toISOString() } : o);
      writeJson(ordersFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  if (req.method === 'GET' && pathname === '/api/admin/bookings') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    const list = readJson(bookingsFile);
    return sendJson(res, 200, list);
  }

  if (req.method === 'GET' && pathname === '/api/customer/bookings') {
    const user = requireRole(req, res, ['customer']); if (!user) return;
    const list = readJson(bookingsFile).filter(b => (b.contact && b.contact.email) === user.email);
    return sendJson(res, 200, list);
  }
  if (req.method === 'POST' && pathname === '/api/customer/booking/cancel') {
    const user = requireRole(req, res, ['customer']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(bookingsFile).map(b => {
        if (b.id === id && (b.contact && b.contact.email) === user.email) {
          return { ...b, status: 'canceled_by_customer', canceledAt: new Date().toISOString() };
        }
        return b;
      });
      writeJson(bookingsFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Events
  if (req.method === 'GET' && pathname === '/api/events') {
    const list = readJson(eventsFile);
    return sendJson(res, 200, list);
  }
  if (req.method === 'POST' && pathname === '/api/admin/events') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { title, date, time, description, imageUrl } = data || {};
      if (!title || !date) return send(res, 400, 'Title and date required');
      const item = { id: 'evt_' + Date.now(), title, date, time: time || '', description: description || '', imageUrl: imageUrl || '' };
      const list = readJson(eventsFile); list.push(item); writeJson(eventsFile, list);
      return sendJson(res, 201, item);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/admin/events/remove') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(eventsFile).filter(e => e.id !== id);
      writeJson(eventsFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Public bookings (sanitized) for availability
  if (req.method === 'GET' && pathname === '/api/bookings') {
    const q = url.parse(req.url, true).query;
    const month = (q.month || '').toString(); // YYYY-MM
    const roomType = (q.roomType || '').toString();
    let list = readJson(bookingsFile);
    // Filter by roomType
    if (roomType) list = list.filter(b => (b.roomType || '') === roomType);
    // Filter by month if provided
    if (month && /^\d{4}-\d{2}$/.test(month)) list = list.filter(b => (b.date || '').startsWith(month));
    // Sanitize
    const out = list.map(b => ({ id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, roomType: b.roomType, status: b.status }));
    return sendJson(res, 200, out);
  }

  // Branding
  if (req.method === 'GET' && pathname === '/api/branding') {
    const b = readJson(brandingFile);
    return sendJson(res, 200, b);
  }
  if (req.method === 'POST' && pathname === '/api/admin/branding') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const current = readJson(brandingFile);
      const next = { ...current, ...data };
      writeJson(brandingFile, next);
      return sendJson(res, 200, next);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Inventory
  if (req.method === 'GET' && pathname === '/api/inventory') {
    const user = requireRole(req, res, ['staff', 'admin']); if (!user) return;
    return sendJson(res, 200, readJson(inventoryFile));
  }
  if (req.method === 'POST' && pathname === '/api/staff/inventory') {
    const user = requireRole(req, res, ['staff', 'admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      if (!Array.isArray(data.items)) return send(res, 400, 'items array required');
  const items = data.items.map(i => ({ id: i.id || ('inv_' + Date.now()), name: String(i.name||'Item'), qty: Number(i.qty)||0, warnQty: Number(i.warnQty)||0, supplierLink: String(i.supplierLink || '') }));
      writeJson(inventoryFile, items);
      checkLowInventoryAndAlert(items);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/staff/inventory/add') {
    const user = requireRole(req, res, ['staff', 'admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { name, qty, warnQty, supplierLink } = data || {};
      if (!name) return send(res, 400, 'name required');
      const list = readJson(inventoryFile);
      const item = { id: 'inv_' + Date.now(), name: String(name), qty: Number(qty)||0, warnQty: Number(warnQty)||0, supplierLink: String(supplierLink || '') };
      list.push(item);
      writeJson(inventoryFile, list);
      checkLowInventoryAndAlert(list);
      return sendJson(res, 201, item);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/admin/inventory/warn') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id, warnQty } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(inventoryFile).map(i => i.id === id ? { ...i, warnQty: Number(warnQty)||0 } : i);
      writeJson(inventoryFile, list);
      checkLowInventoryAndAlert(list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'GET' && pathname === '/api/admin/alerts') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return sendJson(res, 200, readJson(alertsFile));
  }

  // Notifications recipients management
  if (req.method === 'GET' && pathname === '/api/admin/notifications') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return sendJson(res, 200, readJson(notificationsFile));
  }
  if (req.method === 'POST' && pathname === '/api/admin/notifications/add') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { name, email, channels, types } = data || {};
      if (!name || !email) return send(res, 400, 'name and email required');
      const list = readJson(notificationsFile);
      const item = { id: 'n_' + Date.now(), name: String(name), email: String(email), channels: channels || ['email'], types: Array.isArray(types) ? types : [] };
      list.push(item); writeJson(notificationsFile, list);
      return sendJson(res, 201, item);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/admin/notifications/remove') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(notificationsFile).filter(n => n.id !== id);
      writeJson(notificationsFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Menu management
  if (req.method === 'GET' && pathname === '/api/menu') {
    return sendJson(res, 200, readJson(menuFile));
  }
  if (req.method === 'POST' && pathname === '/api/admin/menu/add') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { name, price, description, imageUrl } = data || {};
      if (!name || typeof price !== 'number') return send(res, 400, 'name and numeric price required');
      const item = { id: 'm_' + Date.now(), name, price, description: description || '', imageUrl: imageUrl || '' };
      const list = readJson(menuFile); list.push(item); writeJson(menuFile, list);
      return sendJson(res, 201, item);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/admin/menu/remove') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(menuFile).filter(m => m.id !== id);
      writeJson(menuFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Workspaces management
  if (req.method === 'GET' && pathname === '/api/workspaces') {
    return sendJson(res, 200, readJson(workspacesFile));
  }
  if (req.method === 'POST' && pathname === '/api/admin/workspaces/add') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { name, type, capacity, description, imageUrl, count } = data || {};
      if (!name || !type) return send(res, 400, 'name and type required');
      const item = { id: 'w_' + Date.now(), name, type, capacity: Number(capacity)||1, description: description || '', imageUrl: imageUrl || '', count: Number(count) || 1 };
      const list = readJson(workspacesFile); list.push(item); writeJson(workspacesFile, list);
      return sendJson(res, 201, item);
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }
  if (req.method === 'POST' && pathname === '/api/admin/workspaces/remove') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { id } = data || {};
      if (!id) return send(res, 400, 'id required');
      const list = readJson(workspacesFile).filter(w => w.id !== id);
      writeJson(workspacesFile, list);
      return sendJson(res, 200, { ok: true });
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Upload endpoint (base64 JSON)
  if (req.method === 'POST' && pathname === '/api/admin/upload') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    return readBody(req).then(body => {
      let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, 'Invalid JSON'); }
      const { filename, base64 } = data || {};
      if (!base64) return send(res, 400, 'base64 required');
      try {
        const urlPath = saveBase64Image(base64, filename || 'upload.png');
        return sendJson(res, 201, { url: urlPath });
      } catch (e) {
        return send(res, 500, e.message || 'Upload failed');
      }
    }).catch(err => send(res, 500, err.message || 'Server error'));
  }

  // Reports
  if (req.method === 'GET' && pathname === '/api/admin/reports/orders') {
    const user = requireRole(req, res, ['admin']); if (!user) return;
    const q = url.parse(req.url, true).query;
    const range = (q.range || 'day').toString(); // day|week|month
    const dateStr = (q.date || new Date().toISOString().slice(0,10)).toString(); // YYYY-MM-DD
    const baseDate = new Date(dateStr);
    const orders = readJson(ordersFile);
    function inRange(d){
      const dt = new Date(d);
      if (range === 'day') {
        return dt.toISOString().slice(0,10) === dateStr;
      } else if (range === 'week') {
        const start = new Date(baseDate); start.setDate(start.getDate() - start.getDay());
        const end = new Date(start); end.setDate(end.getDate()+7);
        return dt >= start && dt < end;
      } else if (range === 'month') {
        const ym = dateStr.slice(0,7);
        return dt.toISOString().slice(0,7) === ym;
      }
      return false;
    }
    const filtered = orders.filter(o => inRange(o.createdAt));
    const total = filtered.reduce((s,o)=> s + (o.items||[]).reduce((t,i)=> t + (Number(i.price)||0)*(Number(i.qty)||0), 0), 0);
    const count = filtered.length;
    const byItem = {};
    filtered.forEach(o => (o.items||[]).forEach(i => { const k=i.name; byItem[k]=(byItem[k]||0)+(Number(i.qty)||0); }));
    // Return filtered orders for client-side CSV export as well
    return sendJson(res, 200, { range, date: dateStr, orders: count, total, items: byItem, results: filtered });
  }

  return send(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');

  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
});

ensureData();

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SUCCESS Space server running at http://localhost:${PORT}`);
});
