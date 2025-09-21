/* Basic interactivity: cart, ordering, booking, admin fetches */

function qs(sel, el=document) { return el.querySelector(sel); }
function qsa(sel, el=document) { return Array.from(el.querySelectorAll(sel)); }

// Gallery preview binding: opens a SweetAlert2 modal if available, otherwise small fallback
function openGalleryPreview(type, featuresCsv){
  const features = (featuresCsv || '').split(';').map(s => s.trim()).filter(Boolean);
  // Try to find workspace metadata
  const ws = (window.workspaces || []).find(w => w.id === type || w.type === type);
  const images = (ws && Array.isArray(ws.gallery) && ws.gallery.length) ? ws.gallery : ['/assets/placeholder.svg','/assets/placeholder.svg','/assets/placeholder.svg'];
  const featList = ws && ws.features ? ws.features : features;
  const html = `
    <div>
      <div class="gallery-grid">
        ${images.slice(0,6).map(src => `<img src="${src}" alt="preview">`).join('')}
      </div>
      <h4 class="mt-1">Features</h4>
      <ul>${(featList||[]).map(f=>`<li>${f}</li>`).join('')}</ul>
    </div>`;
  // SweetAlert2 if present
  if (window.Swal) {
    Swal.fire({ title: `${type.replace(/-/g,' ')} — Gallery`, html, width: 700, showCloseButton: true, focusConfirm: false, confirmButtonText: 'Close' });
    return;
  }
  // Fallback: use a simple dialog
  const w = window.open('', '_blank', 'width=700,height=500');
  if (!w) { alert(type + '\n\n' + features.join('\n')); return; }
  w.document.write(`<html><head><title>${type} — Gallery</title><link rel=stylesheet href=/assets/styles.css></head><body>${html}</body></html>`);
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest && e.target.closest('.js-gallery-preview');
  if (!btn) return;
  const type = btn.dataset.type || 'space';
  const features = btn.dataset.features || '';
  e.preventDefault();
  openGalleryPreview(type, features);
});

// Highlight active nav link
(function highlightNav() {
  const pathname = window.location.pathname;
  qsa('nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const isHome = (href === '/' && (pathname === '/' || pathname.endsWith('/index.html') || pathname.endsWith('/index-2.html')));
    const isExact = href !== '/' && pathname.endsWith(href);
    if (isHome || isExact) a.setAttribute('aria-current', 'page');
  });
})();

// Update nav based on auth state: show Dashboard link (user name) and Logout
(async function authNav() {
  try {
    const user = await getMe();
    const nav = document.querySelector('nav ul');
    if (!nav) return;
    // Find the Login item
    const loginA = Array.from(nav.querySelectorAll('a')).find(a => (a.getAttribute('href') || '') === '/login.html');
    const loginLi = loginA ? loginA.parentElement : null;
    if (user) {
      const dash = user.role === 'admin' ? '/admin-dashboard.html' : (user.role === 'staff' ? '/staff-dashboard.html' : '/customer-dashboard.html');
      const nameLi = document.createElement('li');
      const nameA = document.createElement('a');
      nameA.href = dash; nameA.textContent = (user.name || 'Dashboard') + ` (${user.role})`;
      nameLi.appendChild(nameA);
      const logoutLi = document.createElement('li');
      const logoutA = document.createElement('a');
      logoutA.href = '#'; logoutA.textContent = 'Logout'; logoutA.id = 'logout-link';
      logoutLi.appendChild(logoutA);
      if (loginLi) {
        nav.replaceChild(nameLi, loginLi);
        nav.insertBefore(logoutLi, nameLi.nextSibling);
      } else {
        nav.appendChild(nameLi);
        nav.appendChild(logoutLi);
      }
      // Bind logout
      logoutA.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/api/auth/logout', { method: 'POST' });
        location.href = '/';
      });
    } else {
      // Not logged in: ensure login link exists
      if (!loginLi) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '/login.html'; a.textContent = 'Login';
        li.appendChild(a);
        nav.appendChild(li);
      }
    }
  } catch {}
})();

// Apply branding (color + logo) site-wide
(async function applyBranding(){
  try {
    const b = await fetch('/api/branding').then(r=>r.json());
    if (b && b.primaryColor) document.documentElement.style.setProperty('--accent', b.primaryColor);
    if (b && b.logoUrl) {
      const el = document.querySelector('.brand-logo');
      if (el) { el.style.background = `url(${b.logoUrl}) center/cover no-repeat`; }
    }
    // Apply menuImages (editable placeholders) to images or background elements
    if (b && b.menuImages) {
      const imgs = b.menuImages || {};
      // Known placeholder ids used in index-2.html
      const map = {
        cafe: 'placeholder-cafe',
        workspaces: 'placeholder-workspaces',
        events: 'placeholder-events',
        admin: 'placeholder-admin'
      };
      Object.keys(map).forEach(key => {
        const url = imgs[key];
        if (!url) return;
        const id = map[key];
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'IMG') el.src = url;
        else el.style.background = `url(${url}) center/cover no-repeat`;
      });
      // Generic: elements can opt-in with data-menu-image="key"
      document.querySelectorAll('[data-menu-image]').forEach(el => {
        const key = el.getAttribute('data-menu-image');
        const url = imgs[key];
        if (!url) return;
        if (el.tagName === 'IMG') el.src = url;
        else el.style.background = `url(${url}) center/cover no-repeat`;
      });

      // Hero background (if provided)
      if (imgs.hero) {
        const hero = document.getElementById('hero-bg');
        if (hero) hero.style.backgroundImage = `url(${imgs.hero})`;
      }
    }
  } catch {}
})();

// Load workspaces metadata so previews and pricing are dynamic
(async function loadWorkspacesMeta(){
  try {
    const list = await fetch('/api/workspaces').then(r=>r.json());
    window.workspaces = list || [];
    // Map image placeholders / price labels on index-2 and workspaces filter
    window.workspaces.forEach(ws => {
      // Replace placeholder images by matching ids or types
      const imgEls = document.querySelectorAll(`[data-ws-id="${ws.id}"], #placeholder-${ws.id}, img[data-ws-type="${ws.type}"]`);
      imgEls.forEach(el => { if (el.tagName === 'IMG' && ws.imageUrl) el.src = ws.imageUrl; else if (ws.imageUrl) el.style.background = `url(${ws.imageUrl}) center/cover no-repeat`; });
      // Update price hints in page elements that reference the type
      document.querySelectorAll(`.price[data-ws-type="${ws.type}"]`).forEach(el => { el.textContent = ws.price ? (ws.priceUnit ? `$${ws.price}/${ws.priceUnit}` : `$${ws.price}`) : (el.textContent || 'Contact'); });
    });
  } catch (e){}
})();

// Cart state (persist in sessionStorage)
const CART_KEY = 'successspace_cart_v1';
const cart = {
  items: [],
  load() { try { this.items = JSON.parse(sessionStorage.getItem(CART_KEY) || '[]'); } catch { this.items = []; } },
  save() { sessionStorage.setItem(CART_KEY, JSON.stringify(this.items)); updateCartCount(); },
  add(item) {
    const existing = this.items.find(i => i.id === item.id && i.variant === item.variant);
    if (existing) existing.qty += item.qty || 1; else this.items.push({ ...item });
    this.save();
  },
  remove(index) { this.items.splice(index, 1); this.save(); },
  clear() { this.items = []; this.save(); },
  total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
};
cart.load();

function updateCartCount() {
  qsa('[data-cart-count]').forEach(el => { el.textContent = cart.items.reduce((s,i)=>s+i.qty,0); });
}
updateCartCount();

function updateCartSummary() {
  const total = cart.total();
  qsa('[data-cart-total]').forEach(el => { el.textContent = `$${total.toFixed(2)}`; });
}
updateCartSummary();

// Menu: bind add-to-cart buttons
function bindAddButtons(scope=document) {
  qsa('[data-add]', scope).forEach(btn => {
    btn.addEventListener('click', () => {
      const item = {
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: parseFloat(btn.dataset.price),
        variant: btn.dataset.variant || '',
        qty: 1,
      };
      cart.add(item);
      const live = qs('#live-region');
      if (live) { live.textContent = `${item.name} added to cart`; }
    });
  });
}
bindAddButtons();

// Dynamic menu rendering
(async function renderMenu() {
  const root = qs('#menu-root');
  if (!root) return;
  try {
    const list = await fetch('/api/menu').then(r=>r.json());
    root.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('article');
      card.className = 'menu-item';
      card.innerHTML = `
        ${item.imageUrl ? `<img alt="" src="${item.imageUrl}" class="thumb">` : ''}
        <h3>${item.name} <span class="price">$${Number(item.price).toFixed(2)}</span></h3>
        <p>${item.description || ''}</p>
        <div class="actions">
          <button data-add data-id="${item.id}" data-name="${item.name}" data-price="${Number(item.price)}">Add</button>
          <button class="secondary" data-customize data-id="${item.id}">Customize</button>
        </div>`;
      root.appendChild(card);
      bindAddButtons(card);
    });
    // Bind customize
    qsa('[data-customize]', root).forEach(btn => btn.addEventListener('click', () => openCustomize(btn.dataset.id)));
  } catch (e) {
    root.textContent = 'Failed to load menu.';
  }
})();

// Cart page rendering
function renderCart() {
  const container = qs('#cart-items');
  if (!container) return;
  container.innerHTML = '';
  if (cart.items.length === 0) {
    container.innerHTML = '<p>Your cart is empty.</p>';
    const sub = qs('[data-subtotal]'); if (sub) sub.textContent = '$0.00';
    const dis = qs('[data-discount]'); if (dis) dis.textContent = '$0.00';
    qs('[data-total]').textContent = '$0.00';
    return;
  }
  cart.items.forEach((item, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.name}${item.variant ? ' — ' + item.variant : ''}</td>
      <td>× ${item.qty}</td>
      <td>$${item.price.toFixed(2)}</td>
      <td>$${(item.price * item.qty).toFixed(2)}</td>
      <td><button class="danger" aria-label="Remove ${item.name} from cart" data-remove="${idx}">Remove</button></td>
    `;
    container.appendChild(row);
  });
  const subtotal = cart.total();
  const sub = qs('[data-subtotal]'); if (sub) sub.textContent = `$${subtotal.toFixed(2)}`;
  // Apply membership discount if logged in
  getMe().then(me => {
    const discountPct = (me && me.discountPercent) ? me.discountPercent : 0;
    const discountVal = subtotal * (discountPct / 100);
    const total = subtotal - discountVal;
    const dis = qs('[data-discount]'); if (dis) dis.textContent = `-$${discountVal.toFixed(2)} (${discountPct}%)`;
    qs('[data-total]').textContent = `$${Math.max(total, 0).toFixed(2)}`;
  });
  qsa('[data-remove]').forEach(b => b.addEventListener('click', () => {
    cart.remove(parseInt(b.dataset.remove, 10));
    renderCart();
  }));
}
renderCart();

// Checkout submission
const checkoutForm = qs('#checkout-form');
if (checkoutForm) {
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cart.items.length === 0) { alert('Your cart is empty'); return; }
    const fd = new FormData(checkoutForm);
    const payload = {
      items: cart.items,
      notes: fd.get('notes') || '',
      customer: {
        name: fd.get('name') || '',
        email: fd.get('email') || '',
        phone: fd.get('phone') || '',
      },
    };
    const res = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const txt = await res.text(); alert('Order failed: ' + txt); return; }
    const { order } = await res.json();
    cart.clear();
    window.location.href = `/thankyou.html?order=${encodeURIComponent(order.id)}`;
  });
}

// Booking submission
const bookingForm = qs('#booking-form');
if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(bookingForm);
    const payload = {
      date: fd.get('date'),
      startTime: fd.get('start'),
      endTime: fd.get('end'),
      roomType: fd.get('roomType'),
      attendees: parseInt(fd.get('attendees') || '1', 10),
      purpose: fd.get('purpose') || '',
      contact: {
        name: fd.get('name') || '',
        email: fd.get('email') || '',
        phone: fd.get('phone') || '',
      },
    };
    const res = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const txt = await res.text(); alert('Request failed: ' + txt); return; }
    window.location.href = `/scheduled.html`;
  });
}

// Admin views
async function loadAdmin(type) {
  const tokenInput = qs('#admin-token');
  const token = tokenInput ? tokenInput.value : '';
  if (!token) { alert('Admin token required'); return; }
  const endpoint = type === 'orders' ? '/api/admin/orders' : '/api/admin/bookings';
  const res = await fetch(endpoint + `?token=${encodeURIComponent(token)}`);
  if (!res.ok) { const t = await res.text(); alert('Load failed: ' + t); return; }
  const list = await res.json();
  const table = qs(`#${type}-table tbody`);
  table.innerHTML = '';
  list.slice().reverse().forEach(item => {
    const tr = document.createElement('tr');
    if (type === 'orders') {
      const summary = item.items.map(i => `${i.qty}× ${i.name}`).join(', ');
      tr.innerHTML = `<td>${item.id}</td><td>${new Date(item.createdAt).toLocaleString()}</td><td>${summary}</td><td>${item.customer.name} • ${item.customer.email}</td>`;
    } else {
      tr.innerHTML = `<td>${item.id}</td><td>${new Date(item.createdAt).toLocaleString()}</td><td>${item.date} ${item.startTime}-${item.endTime}</td><td>${item.roomType} • ${item.attendees}</td><td>${item.contact.name} • ${item.contact.email}</td>`;
    }
    table.appendChild(tr);
  });
}

qsa('[data-load-admin]').forEach(btn => {
  btn.addEventListener('click', () => loadAdmin(btn.dataset.loadAdmin));
});

// -------- Auth & Dashboards --------
let __mePromise;
function getMe(force=false) {
  if (!force && __mePromise) return __mePromise;
  __mePromise = fetch('/api/auth/me').then(r=>r.json()).then(d=>d.user || null).catch(()=>null);
  return __mePromise;
}

// Login form
const loginForm = qs('#login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    if (!res.ok) { alert('Login failed'); return; }
    const { user } = await res.json();
    if (user.role === 'admin') location.href = '/admin-dashboard.html';
    else if (user.role === 'staff') location.href = '/staff-dashboard.html';
    else location.href = '/customer-dashboard.html';
  });
}

// Dev quick-login buttons
qsa('[data-login-as]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.loginAs;
    const creds = role === 'admin'
      ? { email: 'admin@success.space', password: 'admin123' }
      : role === 'staff'
      ? { email: 'staff@success.space', password: 'staff123' }
      : { email: 'customer@success.space', password: 'customer123' };
    const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(creds) });
    if (!res.ok) { alert('Login failed'); return; }
    const { user } = await res.json();
    if (user.role === 'admin') location.href = '/admin-dashboard.html';
    else if (user.role === 'staff') location.href = '/staff-dashboard.html';
    else location.href = '/customer-dashboard.html';
  });
});

// Guards and page loaders
async function guardRole(expectedRoles, gateId) {
  const el = qs('#' + gateId);
  const user = await getMe(true);
  if (!user || !expectedRoles.includes(user.role)) {
    if (el) el.textContent = 'Please login with the proper role.';
    return null;
  }
  if (el) el.textContent = `Signed in as ${user.name} (${user.role})`;
  return user;
}

// Admin dashboard logic
(async function initAdmin() {
  if (!qs('#branding-form')) return;
  const user = await guardRole(['admin'], 'admin-gate');
  if (!user) return;
  // Tabs behavior with keyboard accessibility (Arrow keys, Home/End, Enter/Space)
  const tabs = qsa('.tab');
  const panels = qsa('.tabpanel');
  function showPanel(id){
    panels.forEach(p => { p.classList.remove('show'); p.classList.add('hidden'); });
    const el = qs('#'+id);
    if (el) { el.classList.remove('hidden'); setTimeout(()=>el.classList.add('show'), 10); }
    tabs.forEach(t => t.setAttribute('aria-selected', t.getAttribute('aria-controls') === id ? 'true' : 'false'));
    // animate brand underline briefly
    const brand = qs('.brand'); if (brand) { brand.classList.add('brand-animate'); setTimeout(()=>brand.classList.remove('brand-animate'), 900); }
  }
  function focusTab(index){
    const t = tabs[index]; if (!t) return; t.focus(); t.click();
  }
  tabs.forEach((t, idx) => {
    t.addEventListener('click', ()=>showPanel(t.getAttribute('aria-controls')));
    t.addEventListener('keydown', (e)=>{
      const key = e.key;
      if (key === 'ArrowRight' || key === 'Right') { e.preventDefault(); focusTab((idx+1) % tabs.length); }
      else if (key === 'ArrowLeft' || key === 'Left') { e.preventDefault(); focusTab((idx-1 + tabs.length) % tabs.length); }
      else if (key === 'Home') { e.preventDefault(); focusTab(0); }
      else if (key === 'End') { e.preventDefault(); focusTab(tabs.length-1); }
      else if (key === 'Enter' || key === ' ') { e.preventDefault(); t.click(); }
    });
  });
  // Ensure first panel is visible by default
  showPanel('panel-branding');
  // Load branding
  const branding = await fetch('/api/branding').then(r=>r.json());
  qs('#siteName').value = branding.siteName || '';
  qs('#primaryColor').value = branding.primaryColor || '#0ea5e9';
  qs('#logoUrl').value = branding.logoUrl || '';
  if (branding.logoUrl) { const pv = qs('#logo-preview'); if (pv) pv.src = branding.logoUrl; }
  qs('#menuImages').value = JSON.stringify(branding.menuImages || {}, null, 2);
  qs('#branding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let images = {};
    try { images = JSON.parse(qs('#menuImages').value || '{}'); } catch { alert('Menu Images must be valid JSON'); return; }
    let body = {
      siteName: qs('#siteName').value,
      primaryColor: qs('#primaryColor').value,
      logoUrl: qs('#logoUrl').value,
      menuImages: images,
    };
    const f = qs('#brand-logo');
    if (f && f.files && f.files[0]) {
      try {
        const url = await (async function(file){
          const b64 = await new Promise((resolve, reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
          const res = await fetch('/api/admin/upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filename: file.name, base64: b64 }) });
          if (!res.ok) throw new Error('Upload failed');
          return (await res.json()).url;
        })(f.files[0]);
        body.logoUrl = url;
      } catch(err) { alert('Logo upload failed'); return; }
    }
    const res = await fetch('/api/admin/branding', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { alert('Save failed'); return; }
    // live apply brand
    document.documentElement.style.setProperty('--accent', body.primaryColor);
    if (body.logoUrl) { const el = document.querySelector('.brand-logo'); if (el) el.style.background = `url(${body.logoUrl}) center/cover no-repeat`; }
    alert('Branding saved');
  });

  // Calendar
  let cur = new Date();
  function ymd(d){ return d.toISOString().slice(0,10); }
  async function renderCalendar() {
    const list = await fetch('/api/admin/bookings').then(r=>r.json());
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const title = first.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    qs('#cal-title').textContent = title;
    const cal = qs('#calendar'); cal.innerHTML='';
    const startDay = first.getDay();
    for (let i=0;i<startDay;i++){ const cell=document.createElement('div'); cal.appendChild(cell); }
    const byDate = {};
    list.forEach(b => { (byDate[b.date] ||= []).push(b); });
    for (let day=1; day<=last.getDate(); day++){
      const d = new Date(year, month, day);
      const dateKey = ymd(d);
      const cell = document.createElement('div');
      // mark calendar cell for styling and selection
      cell.className = 'card cal-cell';
      const items = byDate[dateKey] || [];
      cell.innerHTML = `<strong>${day}</strong><div style="color: var(--muted);">${items.length} booking(s)</div>`;
      cell.tabIndex = 0;
      cell.addEventListener('click', ()=>{
        // toggle selected ring: only one selected at a time
        const prev = cal.querySelector('.cal-cell.selected'); if (prev) prev.classList.remove('selected');
        cell.classList.add('selected');
        showDay(dateKey, items);
      });
      cal.appendChild(cell);
    }
  }
  function showDay(dateKey, items) {
    const list = qs('#calendar-list');
    list.innerHTML = `<h3>${dateKey}</h3>` + (items.length ? '' : '<p>No bookings.</p>');
    items.forEach(b => {
      const p = document.createElement('p');
      p.textContent = `${b.startTime}-${b.endTime} • ${b.roomType} • ${b.attendees} • ${b.contact.name}`;
      list.appendChild(p);
    });
  }
  qs('#cal-prev').addEventListener('click', ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1); renderCalendar(); });
  qs('#cal-next').addEventListener('click', ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); renderCalendar(); });
  qs('#cal-refresh').addEventListener('click', renderCalendar);
  renderCalendar();

  // Events
  async function loadEvents(){
    const list = await fetch('/api/events').then(r=>r.json());
    const tb = qs('#events-body'); tb.innerHTML='';
    list.slice().reverse().forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${e.title}</td><td>${e.date}</td><td>${e.time || ''}</td><td>${e.description || ''}</td>`;
      tb.appendChild(tr);
    });
  }
  qs('#event-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch('/api/admin/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { alert('Add failed'); return; }
    e.target.reset();
    loadEvents();
  });
  loadEvents();

  // ---- Menu Management ----
  const menuTable = document.createElement('section');
  menuTable.className = 'card mt-2';
  menuTable.innerHTML = `
    <h2>Menu Items</h2>
    <div class="grid grid-2">
      <div>
        <table>
          <thead><tr><th>Name</th><th>Price</th><th></th></tr></thead>
          <tbody id="menu-body"></tbody>
        </table>
      </div>
      <div>
        <h3>Add Item</h3>
        <form id="menu-form">
          <label for="m-name">Name</label>
          <input id="m-name" required />
          <label for="m-price">Price</label>
          <input id="m-price" type="number" step="0.01" required />
          <label for="m-desc">Description</label>
          <input id="m-desc" />
          <label for="m-img">Image</label>
          <input id="m-img" type="file" accept="image/*" />
          <div class="row mt-1"><button type="submit">Add</button></div>
        </form>
      </div>
    </div>`;
  // Insert menu management into the Menu tab if present, otherwise fall back to main
  const menuRoot = qs('#panel-menu-root') || qs('#main');
  menuRoot.appendChild(menuTable);

  async function uploadFile(file) {
    const b64 = await new Promise((resolve, reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
    const res = await fetch('/api/admin/upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filename: file.name, base64: b64 }) });
    if (!res.ok) throw new Error('Upload failed');
    return (await res.json()).url;
  }

  async function loadMenu(){
    const list = await fetch('/api/menu').then(r=>r.json());
    const tb = qs('#menu-body'); tb.innerHTML = '';
    list.slice().reverse().forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.name}</td><td>$${Number(m.price).toFixed(2)}</td><td><button class="danger" data-del-menu="${m.id}">Remove</button></td>`;
      tb.appendChild(tr);
    });
    qsa('[data-del-menu]').forEach(b => b.onclick = async ()=>{
      await fetch('/api/admin/menu/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.dataset.delMenu }) });
      loadMenu();
    });
  }
  qs('#menu-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = qs('#m-name').value.trim();
    const price = parseFloat(qs('#m-price').value);
    const description = qs('#m-desc').value.trim();
    let imageUrl = '';
    const file = qs('#m-img').files[0];
    if (file) { imageUrl = await uploadFile(file); }
    const res = await fetch('/api/admin/menu/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, price, description, imageUrl }) });
    if (!res.ok) { alert('Add failed'); return; }
    e.target.reset();
    loadMenu();
  });
  loadMenu();

  // ---- Workspaces Management ----
  const wsSection = document.createElement('section');
  wsSection.className = 'card mt-2';
    wsSection.innerHTML = `
    <h2>Workspaces</h2>
    <div class="grid grid-2">
      <div>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Cap.</th><th>Count</th><th></th></tr></thead>
          <tbody id="ws-body"></tbody>
        </table>
      </div>
      <div>
        <h3>Add Workspace</h3>
        <form id="ws-form">
          <label for="ws-name">Name</label>
          <input id="ws-name" required />
          <label for="ws-type">Type</label>
          <input id="ws-type" required placeholder="open-desk | private-office | conference | event" />
          <label for="ws-capacity">Capacity</label>
          <input id="ws-capacity" type="number" min="1" value="1" />
          <label for="ws-count">Count (how many of this workspace type)</label>
          <input id="ws-count" type="number" min="1" value="1" />
          <label for="ws-desc">Description</label>
          <input id="ws-desc" />
          <label for="ws-img">Image</label>
          <input id="ws-img" type="file" accept="image/*" />
          <div class="row mt-1"><button type="submit">Add</button></div>
        </form>
      </div>
    </div>`;
  // Insert workspaces management into the Workspaces tab if present, otherwise fall back to main
  const wsRoot = qs('#panel-workspaces-root') || qs('#main');
  wsRoot.appendChild(wsSection);

  async function loadWorkspaces(){
    const list = await fetch('/api/workspaces').then(r=>r.json());
    const tb = qs('#ws-body'); tb.innerHTML = '';
    list.slice().reverse().forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${w.name}</td><td>${w.type}</td><td>${w.capacity}</td><td>${w.count || 0}</td><td><button class="danger" data-del-ws="${w.id}">Remove</button></td>`;
      tb.appendChild(tr);
    });
    qsa('[data-del-ws]').forEach(b => b.onclick = async ()=>{
      await fetch('/api/admin/workspaces/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.dataset.delWs }) });
      loadWorkspaces();
    });
  }
  qs('#ws-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
  const name = qs('#ws-name').value.trim();
  const type = qs('#ws-type').value.trim();
  const capacity = parseInt(qs('#ws-capacity').value, 10) || 1;
  const count = parseInt(qs('#ws-count').value, 10) || 1;
  const description = qs('#ws-desc').value.trim();
    let imageUrl = '';
    const file = qs('#ws-img').files[0];
    if (file) { imageUrl = await uploadFile(file); }
  const res = await fetch('/api/admin/workspaces/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, type, capacity, count, description, imageUrl }) });
    if (!res.ok) { alert('Add failed'); return; }
    e.target.reset();
    loadWorkspaces();
  });
  loadWorkspaces();
  
  // Enable event image upload and removal
  const evtForm = qs('#event-form');
  if (evtForm) {
    const imgInput = document.createElement('input');
    imgInput.type = 'file'; imgInput.accept = 'image/*'; imgInput.id = 'evt-img';
    const label = document.createElement('label'); label.htmlFor = 'evt-img'; label.textContent = 'Image';
    evtForm.appendChild(label); evtForm.appendChild(imgInput);
    const origHandler = evtForm.onsubmit;
  }
  // Override event add to include image
  qs('#event-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    let imageUrl = '';
    const img = qs('#evt-img').files[0];
    if (img) imageUrl = await uploadFile(img);
    const body = Object.fromEntries(fd.entries()); body.imageUrl = imageUrl;
    const res = await fetch('/api/admin/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { alert('Add failed'); return; }
    e.target.reset();
    loadEvents();
  }, { once: true });
  // Add remove buttons to events list after load
  const oldLoadEvents = loadEvents;
  loadEvents = async function(){
    const list = await fetch('/api/events').then(r=>r.json());
    const tb = qs('#events-body'); tb.innerHTML='';
    list.slice().reverse().forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${e.title}</td><td>${e.date}</td><td>${e.time || ''}</td><td>${e.description || ''}</td>`;
      const td = document.createElement('td');
      const btn = document.createElement('button'); btn.className='danger'; btn.textContent='Remove';
      btn.onclick = async ()=>{ await fetch('/api/admin/events/remove',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: e.id })}); loadEvents(); };
      td.appendChild(btn); tr.appendChild(td); tb.appendChild(tr);
    });
  };
  loadEvents();
})();

// ------- Customize Modal -------
const backdrop = qs('#customize-backdrop');
const cForm = qs('#customize-form');
const cImg = qs('#customize-img');
const cDesc = qs('#customize-desc');
const cTitle = qs('#customize-title');
function showModal(show) { if (!backdrop) return; backdrop.setAttribute('aria-hidden', show ? 'false' : 'true'); if (show) qs('#customize-close').focus(); }
function priceFor(base, size, milk){
  let p = base;
  if (size === 'M') p += 0.5; else if (size === 'L') p += 1.0;
  if (milk === 'oat') p += 0.5;
  return p;
}
async function openCustomize(id){
  const list = await fetch('/api/menu').then(r=>r.json());
  const item = list.find(i => i.id === id); if (!item) return;
  qs('#c-id').value = item.id; qs('#c-name').value = item.name; qs('#c-base').value = String(item.price);
  cTitle.textContent = `Customize ${item.name}`;
  cImg.src = item.imageUrl || '/assets/placeholder.svg';
  cDesc.textContent = item.description || '';
  cForm.reset(); qs('#c-qty').value = 1; qs('#c-notes').value = '';
  // Render dynamic modifiers into #c-mods
  const modsRoot = qs('#c-mods');
  modsRoot.innerHTML = '';
  if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length) {
    item.modifiers.forEach(mod => {
      const wrap = document.createElement('div');
      const title = document.createElement('label'); title.textContent = mod.name || mod.id || 'Option';
      wrap.appendChild(title);
      const row = document.createElement('div'); row.className = 'row';
      if (mod.type === 'checkbox') {
        (mod.options||[]).forEach(opt => {
          const lab = document.createElement('label');
          const inp = document.createElement('input'); inp.type = 'checkbox'; inp.name = `mod_${mod.id}`; inp.value = opt.value || opt.label || '';
          if (opt.price) inp.dataset.price = String(opt.price);
          lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + (opt.label || opt.value) + (opt.price ? ` (+$${opt.price})` : '')));
          row.appendChild(lab);
        });
      } else if (mod.type === 'select') {
        const sel = document.createElement('select'); sel.name = `mod_${mod.id}`;
        (mod.options||[]).forEach(opt => {
          const o = document.createElement('option'); o.value = opt.value || opt.label || ''; o.textContent = `${opt.label || opt.value}${opt.price ? ` (+$${opt.price})` : ''}`; if (opt.price) o.dataset.price = String(opt.price);
          sel.appendChild(o);
        });
        row.appendChild(sel);
      } else {
        (mod.options||[]).forEach(opt => {
          const lab = document.createElement('label');
          const inp = document.createElement('input'); inp.type = 'radio'; inp.name = `mod_${mod.id}`; inp.value = opt.value || opt.label || '';
          if (opt.price) inp.dataset.price = String(opt.price);
          lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + (opt.label || opt.value) + (opt.price ? ` (+$${opt.price})` : '')));
          row.appendChild(lab);
        });
      }
      wrap.appendChild(row);
      modsRoot.appendChild(wrap);
    });
  }

  function update(){
    const fd = new FormData(cForm);
    const qty = parseInt(qs('#c-qty').value, 10) || 1;
    let unit = Number(item.price) || 0;
    const selectedMods = [];
    (item.modifiers||[]).forEach(mod => {
      const key = `mod_${mod.id}`;
      if (mod.type === 'checkbox') {
        // FormData.getAll isn't reliable unless inputs share name; use querySelectorAll
        (modsRoot.querySelectorAll(`input[name="${key}"]`)).forEach(inp => {
          if (inp.checked) {
            const val = inp.value; const p = Number(inp.dataset.price||0);
            unit += p; selectedMods.push({ id: mod.id, name: mod.name, value: val, price: p });
          }
        });
      } else if (mod.type === 'select') {
        const sel = modsRoot.querySelector(`select[name="${key}"]`);
        if (sel) {
          const val = sel.value; const opt = Array.from(sel.options).find(o=>o.value===val);
          const p = opt && opt.dataset.price ? Number(opt.dataset.price) : 0; if (val) { unit += p; selectedMods.push({ id: mod.id, name: mod.name, value: val, price: p }); }
        }
      } else {
        const inp = modsRoot.querySelector(`input[name="${key}"]:checked`);
        if (inp) { const val = inp.value; const p = Number(inp.dataset.price||0); unit += p; selectedMods.push({ id: mod.id, name: mod.name, value: val, price: p }); }
      }
    });
    qs('#c-total').textContent = `$${(unit*qty).toFixed(2)}`;
    cForm._selectedMods = selectedMods;
  }
  cForm.oninput = update; update();
  showModal(true);
  qs('#customize-add').onclick = () => {
  const fd = new FormData(cForm);
  const qty = parseInt(qs('#c-qty').value, 10) || 1;
  // Base price from item and adjustments from selected modifiers
  let unit = Number(item.price) || 0;
  const mods = cForm._selectedMods || [];
  mods.forEach(m => { unit += Number(m.price||0); });
  const variant = mods.map(m => `${m.name||m.id}:${m.value}`).join(' | ');
  const entry = { id: item.id, name: item.name, price: unit, variant: variant || '', qty, note: qs('#c-notes').value || '', modifiers: mods };
    // If POS is active and provides a callback, use it
    if (window.posAddCallback && typeof window.posAddCallback === 'function') {
      window.posAddCallback(entry);
    } else if (typeof cart !== 'undefined' && cart.add) {
      cart.add(entry);
      updateCartCount(); updateCartSummary();
    }
    const live = qs('#live-region'); if (live) live.textContent = `${item.name} added to cart`;
    showModal(false);
  };
}
if (qs('#customize-close')) qs('#customize-close').addEventListener('click', () => showModal(false));

// Staff dashboard logic
(async function initStaff(){
  if (!qs('#orders-body')) return;
  const user = await guardRole(['staff','admin'], 'staff-gate');
  if (!user) return;
  async function loadOrders(){
    const list = await fetch('/api/staff/orders').then(r=>r.json());
    const tb = qs('#orders-body'); tb.innerHTML='';
    list.slice().reverse().forEach(o => {
      const tr = document.createElement('tr');
      const summary = (o.items||[]).map(i => `${i.qty}× ${i.name}`).join(', ');
      tr.innerHTML = `<td>${o.id}</td><td>${new Date(o.createdAt).toLocaleTimeString()}</td><td>${summary}</td><td>${o.customer.name}<div class="mt-1"><small>Status: ${o.status}</small></div></td>`;
      const td = document.createElement('td');
      ['received','in_progress','ready','completed','canceled'].forEach(st => {
        const b = document.createElement('button'); b.className='secondary'; b.style.marginRight = '.25rem'; b.textContent = st.replace('_',' ');
        b.onclick = async ()=>{ await fetch('/api/staff/orders/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: o.id, status: st }) }); loadOrders(); };
        td.appendChild(b);
      });
      tr.appendChild(td);
      tb.appendChild(tr);
    });
  }
  async function loadInventory(){
    const list = await fetch('/api/inventory').then(r=>r.json());
    const tb = qs('#inventory-body'); tb.innerHTML='';
    list.forEach((i, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.name}</td><td><input type="number" min="0" value="${i.qty}" data-inv-idx="${idx}" style="width: 100px;"></td><td><input type=\"number\" min=\"0\" value=\"${i.warnQty||0}\" data-inv-warn-id=\"${i.id}\" style=\"width: 100px;\"></td><td>${i.supplierLink ? `<a href=\"${i.supplierLink}\" target=\"_blank\">Link</a>` : ''}</td>`;
      tb.appendChild(tr);
    });
    qs('#inv-save').onclick = async ()=>{
      const items = list.map((i, idx) => ({...i, qty: parseInt(qs(`[data-inv-idx="${idx}"]`).value, 10)||0}));
      const res = await fetch('/api/staff/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items }) });
      if (!res.ok) { alert('Save failed'); return; }
      alert('Inventory saved');
    };
    const addBtn = qs('#inv-add');
    if (addBtn) addBtn.onclick = async ()=>{
      const name = qs('#inv-new-name').value.trim();
      const qty = parseInt(qs('#inv-new-qty').value, 10) || 0;
      if (!name) { alert('Enter a name'); return; }
      const res = await fetch('/api/staff/inventory/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, qty }) });
      if (!res.ok) { alert('Add failed'); return; }
      qs('#inv-new-name').value = ''; qs('#inv-new-qty').value = '0';
      loadInventory();
    };
  }
  qs('#orders-refresh').addEventListener('click', loadOrders);
    qs('#inv-refresh').addEventListener('click', loadInventory);
  loadOrders();
  loadInventory();
})();

// Admin: inventory warnings, alerts, and reports
(async function initAdminExtras(){
  if (!qs('#panel-inventory')) return;
  const me = await getMe(); if (!me || me.role !== 'admin') return;
  async function loadInv(){
    const list = await fetch('/api/inventory').then(r=>r.json());
    const tb = qs('#inventory-body'); if (!tb) return; tb.innerHTML='';
    list.forEach((i, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.name}</td><td><input type=\"number\" min=\"0\" value=\"${i.qty}\" data-inv-qty-idx=\"${idx}\" style=\"width: 100px;\"></td><td><input type=\"number\" min=\"0\" value=\"${i.warnQty||0}\" data-inv-warn-id=\"${i.id}\" style=\"width: 100px;\"></td>`;
      tb.appendChild(tr);
    });
    const save = qs('#inv-save'); if (save) save.onclick = async ()=>{
      const items = list.map((i, idx) => ({...i, qty: parseInt(qs(`[data-inv-qty-idx=\\\"${idx}\\\"]`).value, 10)||0, warnQty: parseInt(qs(`[data-inv-warn-id=\\\"${i.id}\\\"]`).value, 10)||0 }));
      await fetch('/api/staff/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items }) });
      alert('Inventory saved');
      loadInv();
    };
  }
  // Add inventory form handler
  const invAddForm = qs('#inv-add-form');
  if (invAddForm) {
    invAddForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = qs('#inv-new-name').value.trim();
      const qty = parseInt(qs('#inv-new-qty').value, 10) || 0;
      const warnQty = parseInt(qs('#inv-new-warn').value, 10) || 0;
      const supplierLink = qs('#inv-new-supplier') ? qs('#inv-new-supplier').value.trim() : '';
      if (!name) { alert('Enter a name'); return; }
      const res = await fetch('/api/staff/inventory/add', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, qty, warnQty, supplierLink }) });
      if (!res.ok) { alert('Add failed'); return; }
      invAddForm.reset(); loadInv();
    });
  }
  async function loadAlerts(){
    const list = await fetch('/api/admin/alerts').then(r=>r.json());
    const ul = qs('#alerts-list'); if (!ul) return; ul.innerHTML='';
    list.slice().reverse().slice(0,50).forEach(a => {
      const li = document.createElement('li'); li.textContent = `${new Date(a.createdAt).toLocaleString()} • ${a.name} (qty ${a.qty} ≤ warn ${a.warnQty})`;
      ul.appendChild(li);
    });
  }
  loadInv(); loadAlerts();

  // Notifications management UI
  async function loadNotifications(){
    const tbody = qs('#notifications-body'); if (!tbody) return;
    try {
      const list = await fetch('/api/admin/notifications').then(r=>r.json());
      tbody.innerHTML = '';
      list.slice().reverse().forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${n.name}</td><td>${n.email}</td><td>${(n.types||[]).join(', ')}</td><td><button class="danger" data-del-notif="${n.id}">Remove</button></td>`;
        tbody.appendChild(tr);
      });
      qsa('[data-del-notif]').forEach(b => b.onclick = async ()=>{
        await fetch('/api/admin/notifications/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.dataset.delNotif }) });
        loadNotifications();
      });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="4">Failed to load notifications</td></tr>'; }
  }
  const notifForm = qs('#notifications-form');
  if (notifForm) {
    notifForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const name = qs('#n-name').value.trim();
      const email = qs('#n-email').value.trim();
      const types = Array.from(qsa('#n-types input[type=checkbox]')).filter(c=>c.checked).map(c=>c.value);
      const res = await fetch('/api/admin/notifications/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, types }) });
      if (!res.ok) { alert('Add failed'); return; }
      notifForm.reset(); loadNotifications();
    });
  }
  loadNotifications();

  if (qs('#panel-reports')) {
    const date = qs('#rep-date'); if (date && !date.value) date.value = new Date().toISOString().slice(0,10);
    const run = qs('#rep-run'); if (run) run.onclick = async ()=>{
      const range = qs('#rep-range').value; const d = qs('#rep-date').value;
      const rep = await fetch(`/api/admin/reports/orders?range=${encodeURIComponent(range)}&date=${encodeURIComponent(d)}`).then(r=>r.json());
      const out = qs('#rep-output');
      out.innerHTML = `<p><strong>Total Orders:</strong> ${rep.orders}</p><p><strong>Total Sales:</strong> $${rep.total.toFixed(2)}</p>`;
      const ul = document.createElement('ul');
      Object.entries(rep.items||{}).forEach(([name, qty]) => { const li=document.createElement('li'); li.textContent=`${name}: ${qty}`; ul.appendChild(li); });
      out.appendChild(ul);
      // Attach CSV download data to button for client-side export
      const downloadBtn = qs('#download-reports-csv');
      if (downloadBtn) {
        downloadBtn.dataset.rep = JSON.stringify(rep.results || []);
      }
    };
    const dl = qs('#download-reports-csv');
    if (dl) dl.addEventListener('click', ()=>{
      try {
        const raw = dl.dataset.rep || '[]';
        const rows = JSON.parse(raw);
        if (!rows.length) { alert('No orders to export for the current report. Run the report first.'); return; }
        // Build CSV: flatten items per order (one row per order-item)
        const cols = ['orderId','createdAt','customerName','customerEmail','itemName','itemQty','itemPrice','itemTotal'];
        const lines = [cols.join(',')];
        rows.forEach(o => {
          (o.items||[]).forEach(it => {
            const row = [
              `"${o.id}"`,
              `"${o.createdAt}"`,
              `"${(o.customer && o.customer.name)||''}"`,
              `"${(o.customer && o.customer.email)||''}"`,
              `"${(it.name||'')}"`,
              `${Number(it.qty)||0}`,
              `${Number(it.price)||0}`,
              `${((Number(it.qty)||0)*(Number(it.price)||0)).toFixed(2)}`
            ];
            lines.push(row.join(','));
          });
        });
        const csv = lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `orders-report-${qs('#rep-range').value || 'report'}-${qs('#rep-date').value || ''}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      } catch (e) { alert('Export failed: ' + e.message); }
    });
  }
})();

// Customer dashboard logic
(async function initCustomer(){
  if (!qs('#cust-bookings-body')) return;
  const user = await guardRole(['customer'], 'cust-gate');
  if (!user) return;
  const info = `Level: ${user.membership || 'Standard'} • Discount: ${(user.discountPercent||0)}%`;
  qs('#membership-info').textContent = info;
  const list = await fetch('/api/customer/bookings').then(r=>r.json());
  const tb = qs('#cust-bookings-body'); tb.innerHTML='';
  list.slice().reverse().forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.date} ${b.startTime}-${b.endTime}</td><td>${b.roomType}</td><td>${b.attendees}</td><td>${b.status}</td>`;
    const td = document.createElement('td');
    if (b.status === 'requested') {
      const btn = document.createElement('button'); btn.className='danger'; btn.textContent='Cancel';
      btn.onclick = async ()=>{ await fetch('/api/customer/booking/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.id }) }); location.reload(); };
      td.appendChild(btn);
    }
    tr.appendChild(td);
    tb.appendChild(tr);
  });
})();

// Workspaces availability calendar (public)
(function initWorkspaceCalendar(){
  const cal = qs('#ws-calendar');
  if (!cal) return;
  const title = qs('#ws-cal-title');
  const prev = qs('#ws-cal-prev');
  const next = qs('#ws-cal-next');
  const refresh = qs('#ws-cal-refresh');
  const dayList = qs('#ws-day-list');
  const roomSel = qs('#ws-filter');
  let cur = new Date();
  function ymd(d){ return d.toISOString().slice(0,10); }
  function ym(d){ return d.toISOString().slice(0,7); }
  async function fetchBookings(){
    const roomType = roomSel ? roomSel.value : '';
    const month = ym(new Date(cur.getFullYear(), cur.getMonth(), 1));
    const url = `/api/bookings?roomType=${encodeURIComponent(roomType)}&month=${encodeURIComponent(month)}`;
    const list = await fetch(url).then(r=>r.json());
    return list;
  }
  // Helper: map roomType to color class and label
  function chipClassFor(roomType){
    if(!roomType) return 'chip';
    if(roomType.includes('desk') || roomType === 'open-desk') return 'chip open-desk';
    if(roomType.includes('office') || roomType === 'private-office') return 'chip private-office';
    if(roomType.includes('conference') || roomType === 'conference') return 'chip conference';
    if(roomType.includes('event') || roomType === 'event') return 'chip event';
    return 'chip';
  }
  // Price labels
  const PRICE_LABELS = {
    'open-desk': '$15/hr',
    'private-office': '$45/day',
    'conference': '$30/hr',
    'event': 'Contact'
  };

  // Helper: format ISO local 'YYYY-MM-DDTHH:MM' to UTC 'YYYYMMDDTHHMMSSZ'
  function toGCalDT(isoLocal) {
    // isoLocal expected like '2025-09-21T09:00' or 'YYYY-MM-DDTHH:MM'
    const d = new Date(isoLocal);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    const day = String(d.getUTCDate()).padStart(2,'0');
    const hh = String(d.getUTCHours()).padStart(2,'0');
    const mm = String(d.getUTCMinutes()).padStart(2,'0');
    const ss = String(d.getUTCSeconds()).padStart(2,'0');
    return `${y}${m}${day}T${hh}${mm}${ss}Z`;
  }

  // Helper: create a minimal ICS file content
  function makeICS({ title='Reservation', start, end, description='' }){
    // start/end are ISO local-like strings 'YYYY-MM-DDTHH:MM'
    const uid = 'ss-' + Date.now();
    const dtstamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const dtstart = toGCalDT(start);
    const dtend = toGCalDT(end);
    return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SUCCESS SPACE//EN\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${dtstamp}\nDTSTART:${dtstart}\nDTEND:${dtend}\nSUMMARY:${title}\nDESCRIPTION:${description}\nLOCATION:SUCCESS Space\nEND:VEVENT\nEND:VCALENDAR`;
  }
  function openBookingModal(date){
    // Use SweetAlert2 for booking modal form
    const filterVal = roomSel ? roomSel.value : '';
    const defaults = {
      date: date,
      type: filterVal || 'open-desk',
      start: '',
      end: '',
      attendees: 1,
      purpose: '',
      name: '',
      email: '',
      phone: '',
      deposit: 20
    };
    const html = `
      <form id="sw-booking-form" class="sw-form">
        <label>Date<br/><input type="date" name="date" value="${defaults.date || ''}" required></label>
        <label>Type<br/><select name="roomType">
          <option value="open-desk" ${defaults.type==='open-desk'?'selected':''}>Hot Desk</option>
          <option value="private-office" ${defaults.type==='private-office'?'selected':''}>Private Office</option>
          <option value="conference" ${defaults.type==='conference'?'selected':''}>Conference Room</option>
          <option value="event" ${defaults.type==='event'?'selected':''}>Event Space</option>
        </select></label>
        <label>Start time<br/><input type="time" name="start" required></label>
        <label>End time<br/><input type="time" name="end" required></label>
        <label>Attendees<br/><input type="number" name="attendees" min="1" value="1"></label>
        <label>Purpose<br/><input name="purpose"></label>
        <label>Your name<br/><input name="name" required></label>
        <label>Your email<br/><input type="email" name="email" required></label>
        <label>Phone<br/><input name="phone"></label>
        <label>Deposit ($)<br/><input type="number" name="deposit" value="20" min="0"></label>
      </form>`;
    Swal.fire({
      title: 'Reserve a workspace',
      html: html + '<div id="sw-availability" style="margin-top:.5rem;color:var(--muted);">Checking availability…</div>',
      showCancelButton: true,
      confirmButtonText: 'Reserve',
      focusConfirm: false,
      didOpen: () => {
        const popup = document.getElementById('sw-booking-form');
        const availEl = document.getElementById('sw-availability');
        const typeSel = popup.querySelector('select[name="roomType"]');
        const dateInp = popup.querySelector('input[name="date"]');
        async function updateAvail(){
          const selType = typeSel.value;
          const selDate = dateInp.value;
          if (!selDate || !selType) { availEl.textContent = 'Select date and type to see availability.'; return; }
          availEl.textContent = 'Checking availability…';
          try {
            const month = selDate.slice(0,7);
            const list = await fetch(`/api/bookings?roomType=${encodeURIComponent(selType)}&month=${encodeURIComponent(month)}`).then(r=>r.json());
            const booked = list.filter(b => b.date === selDate).length;
            const ws = (window.workspaces||[]).find(w => w.type === selType || w.id === selType);
            const total = ws ? (Number(ws.count)||0) : 0;
            const remaining = Math.max(0, total - booked);
            if (total === 0) availEl.textContent = 'No inventory configured for this workspace type.';
            else availEl.textContent = remaining > 0 ? `Available: ${remaining} of ${total}` : 'Fully booked for this date.';
          } catch (e) { availEl.textContent = 'Unable to check availability.'; }
        }
        typeSel.addEventListener('change', updateAvail);
        dateInp.addEventListener('change', updateAvail);
        // initial
        updateAvail();
      },
      preConfirm: () => {
        const form = document.getElementById('sw-booking-form');
        const fd = new FormData(form);
        const payload = {
          date: fd.get('date'),
          startTime: fd.get('start'),
          endTime: fd.get('end'),
          roomType: fd.get('roomType'),
          attendees: parseInt(fd.get('attendees')||'1',10),
          purpose: fd.get('purpose')||'',
          contact: { name: fd.get('name')||'', email: fd.get('email')||'', phone: fd.get('phone')||'' },
          depositAmount: parseFloat(fd.get('deposit')||'0') || 0
        };
        if (!payload.date || !payload.startTime || !payload.endTime || !payload.contact.name || !payload.contact.email) {
          Swal.showValidationMessage('Please complete required fields');
          return false;
        }
        return payload;
      }
    }).then(async (res) => {
      if (!res.isConfirmed || !res.value) return;
      const payload = res.value;
      // Submit to server
      try {
        const r = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) { const txt = await r.text(); throw new Error(txt || 'Booking failed'); }
        const data = await r.json();
        // On success, prepare calendar links (Google, Outlook web, and ICS download)
        const startIso = `${payload.date}T${payload.startTime}`;
        const endIso = `${payload.date}T${payload.endTime}`;
        const titleTxt = `Reservation: ${payload.roomType.replace(/-/g,' ')} at SUCCESS Space`;
        const title = encodeURIComponent(titleTxt);
        const details = encodeURIComponent(payload.purpose || 'Reserved via SUCCESS Space');
        const location = encodeURIComponent('SUCCESS Space');
        const gcal = `https://calendar.google.com/calendar/r/eventedit?text=${title}&dates=${toGCalDT(startIso)}/${toGCalDT(endIso)}&details=${details}&location=${location}`;
        // Outlook web: https://outlook.live.com/calendar/0/deeplink/compose?subject=...&body=...&startdt=...&enddt=...
        const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&body=${details}&startdt=${encodeURIComponent(startIso)}&enddt=${encodeURIComponent(endIso)}&location=${location}`;
        const ics = makeICS({ title: titleTxt, start: startIso, end: endIso, description: payload.purpose || '' });
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const html = `<p>Reservation confirmed. Add to your calendar:</p>
          <p><a href="${gcal}" target="_blank" rel="noopener">Add to Google Calendar</a></p>
          <p><a href="${outlook}" target="_blank" rel="noopener">Add to Outlook Web</a></p>
          <p><a href="${url}" download="reservation.ics">Download .ics (Apple/Outlook)</a></p>`;
        Swal.fire({ title: 'Booked!', html, icon: 'success' });
      } catch (err) {
        Swal.fire('Error', err.message || 'Booking failed', 'error');
      }
    });
  }
  async function render(){
    const list = await fetchBookings();
    const year = cur.getFullYear(); const month = cur.getMonth();
    const first = new Date(year, month, 1); const last = new Date(year, month+1, 0);
    title.textContent = first.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    cal.innerHTML = '';
    dayList.innerHTML = '';
    const startDay = first.getDay();
    for (let i=0;i<startDay;i++){ const cell=document.createElement('div'); cal.appendChild(cell); }
    const byDate = {};
    list.forEach(b => { (byDate[b.date] ||= []).push(b); });
    for (let day=1; day<=last.getDate(); day++){
      const d = new Date(year, month, day);
      const k = ymd(d);
  const items = byDate[k] || [];
  const cell = document.createElement('div');
  cell.className = 'card cal-cell';
  const booked = items.length;
  // Availability: determine total count for selected room type
  const selType = roomSel ? roomSel.value : '';
  const wsMeta = (window.workspaces||[]).find(w => w.type === selType || w.id === selType);
  const totalCount = wsMeta ? (Number(wsMeta.count)||0) : 0;
  const remaining = totalCount ? Math.max(0, totalCount - booked) : undefined;
  const status = (typeof remaining === 'number') ? (remaining > 0 ? `Available: ${remaining} of ${totalCount}` : 'Fully booked') : (booked ? `${booked} booking(s)` : 'Available');
  // Build chips per booking (no price shown)
  const chips = items.map(b => `<span class="${chipClassFor(b.roomType)} small">${b.roomType.replace(/-/g,' ')}</span>`).join('');
  cell.innerHTML = `<strong>${day}</strong><div style="color: var(--muted);">${status}</div><div aria-hidden="true">${chips}</div>`;
  if (booked){ cell.style.borderColor = '#f59e0b'; }
      cell.tabIndex = 0;
      cell.addEventListener('click', ()=>{
        // toggle selected ring for this calendar
        const prev = cal.querySelector('.cal-cell.selected'); if (prev) prev.classList.remove('selected');
        cell.classList.add('selected');
        // Build a bulleted list (no prices)
        dayList.innerHTML = `<h3>${k}</h3>` + (items.length ? '' : '<p>No bookings for this day. Likely available.</p>');
        if (items.length) {
          const ul = document.createElement('ul');
          items.forEach(b => {
            const li = document.createElement('li');
            li.textContent = `${b.startTime}-${b.endTime} • ${b.roomType.replace(/-/g,' ')}`;
            ul.appendChild(li);
          });
          dayList.appendChild(ul);
        }
        openBookingModal(k);
      });
      cal.appendChild(cell);
    }
  }
  prev.addEventListener('click', ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1); render(); });
  next.addEventListener('click', ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); render(); });
  refresh.addEventListener('click', render);
  if (roomSel) roomSel.addEventListener('change', render);
  render();
})();

// POS: simple point-of-sale UI for staff
(function initPOS(){
  const root = qs('#pos-menu');
  if (!root) return;
  // Ensure staff
  guardRole(['staff','admin'], 'admin-gate').then(user => {
    if (!user) return;
    let menuList = [];
    const cart = [];
    let categories = ['All'];
    const recentReceipts = [];

    function setCategories(list){
      const set = new Set(['All']);
      (list||[]).forEach(i => { if (i.category) set.add(i.category); });
      categories = Array.from(set);
      const catRoot = qs('#pos-categories'); if (catRoot) {
        catRoot.innerHTML = '';
        categories.forEach(cat => {
          const b = document.createElement('button'); b.className='tab'; b.textContent = cat; b.dataset.cat = cat;
          b.addEventListener('click', ()=>{ qsa('#pos-categories .tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderMenu(menuList); });
          catRoot.appendChild(b);
        });
        // activate first
        const first = catRoot.querySelector('button'); if (first) first.classList.add('active');
      }
    }

    function renderRecent(){
      const r = qs('#pos-recent'); if (!r) return; r.innerHTML='';
      if (!recentReceipts.length) { r.textContent = 'No recent receipts'; return; }
      recentReceipts.slice().reverse().slice(0,10).forEach((ord, idx) => {
        const d = document.createElement('div'); d.className='row'; d.style.justifyContent='space-between';
        d.innerHTML = `<div><small>${new Date(ord.createdAt).toLocaleString()}</small><div><strong>${ord.id}</strong></div></div><div><button class="secondary" data-reprint="${idx}">Reprint</button></div>`;
        r.appendChild(d);
      });
      qsa('[data-reprint]').forEach(b => b.onclick = ()=>{ const idx = Number(b.dataset.reprint); const ord = recentReceipts[recentReceipts.length-1-idx]; if (ord) { const w = window.open('', '_blank', 'width=400,height=600'); w.document.write(`<html><head><title>Receipt</title><link rel="stylesheet" href="/assets/styles.css"></head><body>${renderReceiptHtml(ord)}</body></html>`); w.document.close(); } });
    }

    function renderReceiptHtml(order) {
      let total = 0;
      let html = `<div style="font-family:monospace; padding:8px; max-width:320px;">`;
      html += `<h2 style="text-align:center;margin:0;font-size:18px;">SUCCESS Space</h2>`;
      html += `<p style="text-align:center;margin:0 0 .5rem;font-size:12px;">Receipt • ${new Date(order.createdAt).toLocaleString()}</p>`;
      html += '<hr/>';
      html += '<table style="width:100%;font-size:13px;">';
      (order.items||[]).forEach(it => { const line = (Number(it.qty)||0)*(Number(it.price)||0); total += line; html += `<tr><td>${it.qty}× ${it.name}</td><td style="text-align:right">$${line.toFixed(2)}</td></tr>`; });
      html += `</table><hr/><div style="text-align:right;font-weight:800;font-size:14px;">Total: $${total.toFixed(2)}</div>`;
      if (order.payment && order.payment.status) html += `<p style="font-size:12px;color:var(--muted);">Payment: ${order.payment.status}</p>`;
      if (order.staffId) html += `<p style="font-size:12px;color:var(--muted);">Served by: ${order.staffId}</p>`;
      html += `<p style="font-size:11px; color:var(--muted); margin-top:.5rem;">Thanks for visiting SUCCESS Space</p>`;
      html += `</div>`;
      return html;
    }

    function renderMenu(list){
      menuList = list || [];
      root.innerHTML = '';
      // filter by category and search
      const activeCatBtn = qs('#pos-categories .tab.active');
      const activeCat = activeCatBtn ? activeCatBtn.dataset.cat : 'All';
      const q = (qs('#pos-search') && qs('#pos-search').value || '').trim().toLowerCase();
      menuList.filter(item => {
        if (activeCat && activeCat !== 'All' && item.category !== activeCat) return false;
        if (q && !(item.name||'').toLowerCase().includes(q)) return false;
        return true;
      }).forEach(item => {
        const el = document.createElement('button');
        el.className = 'pos-item';
        const img = item.imageUrl ? `<img class="pos-thumb" src="${item.imageUrl}" alt="${item.name}">` : `<div style="height:110px;border-radius:10px;background:linear-gradient(90deg,#f3f4f6,#fff);display:flex;align-items:center;justify-content:center;color:var(--muted);">No image</div>`;
        el.innerHTML = `${img}<div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;"><h4>${item.name}</h4><div class="pos-price">$${Number(item.price).toFixed(2)}</div></div>`;
        // Press / glow visual feedback
        el.addEventListener('pointerdown', ()=> { el.classList.add('pos-press'); setTimeout(()=>el.classList.remove('pos-press'), 160); });
        // If item has modifiers (coffee), open customize modal; otherwise quick add
        el.addEventListener('click', ()=> {
          if (item.modifiers || item.type === 'drink') {
            openCustomize(item.id);
          } else {
            el.classList.add('pos-glow'); setTimeout(()=>el.classList.remove('pos-glow'), 500);
            addToCart(item);
          }
        });
        root.appendChild(el);
      });
    }
    function addToCart(item){
      const found = cart.find(c => c.id === item.id);
      if (found) found.qty += 1; else cart.push({ id: item.id, name: item.name, price: Number(item.price)||0, qty: 1 });
      renderCart();
    }
    function renderCart(){
      const container = qs('#pos-cart-body');
      if (!container) return;
      if (cart.length === 0) { container.innerHTML = '<p>No items</p>'; return; }
      let html = '<table><thead><tr><th>Item</th><th>Q</th><th>Price</th><th></th></tr></thead><tbody>';
      cart.forEach((c, idx) => {
        const meta = c.variant ? `<div class="small">${c.variant}</div>` : '';
        const note = c.note ? `<div class="small" style="color:var(--muted)">${c.note}</div>` : '';
        html += `<tr><td>${c.name}${meta}${note}</td><td><input type="number" min="1" value="${c.qty}" data-pos-idx="${idx}" style="width:60px"></td><td>$${(c.price*c.qty).toFixed(2)}</td><td><button data-pos-del="${idx}">×</button></td></tr>`;
      });
      const total = cart.reduce((s,i)=> s + (i.price*(i.qty||0)), 0);
      html += `</tbody></table><div style="margin-top:.5rem"><strong>Total: $${total.toFixed(2)}</strong></div>`;
      container.innerHTML = html;
      // Bind qty inputs and delete
      qsa('[data-pos-del]').forEach(b => b.onclick = ()=>{ cart.splice(Number(b.dataset.posDel),1); renderCart(); });
      qsa('[data-pos-idx]').forEach(inp => inp.onchange = ()=>{ const i = Number(inp.dataset.posIdx); cart[i].qty = Math.max(1, parseInt(inp.value,10)||1); renderCart(); });
    }
    // Provide a callback for the global customize modal to add an item into the POS cart
    window.posAddCallback = function(entry){
      const found = cart.find(c => c.id === entry.id && c.variant === entry.variant);
      if (found) found.qty += entry.qty; else cart.push(Object.assign({}, entry));
      renderCart();
    };
    async function loadMenu(){
      try { const list = await fetch('/api/menu').then(r=>r.json()); setCategories(list || []); renderMenu(list || []); renderRecent(); } catch(e) { root.textContent = 'Failed to load menu'; }
    }

    // Search binding
    const search = qs('#pos-search'); if (search) { search.addEventListener('input', ()=> renderMenu(menuList)); }
    const payMethodSel = qs('#pos-payment-method');
    const squareRow = qs('#pos-square-token-row');
    if (payMethodSel) payMethodSel.addEventListener('change', ()=>{
      if (payMethodSel.value === 'square') { squareRow.style.display = 'block'; } else { squareRow.style.display = 'none'; }
    });
    qs('#pos-clear').addEventListener('click', ()=>{ cart.length = 0; renderCart(); });
    qs('#pos-pay').addEventListener('click', async ()=>{
      if (cart.length === 0) { alert('Cart empty'); return; }
      const cust = { name: qs('#pos-cust-name').value.trim() || 'Walk-in', email: qs('#pos-cust-email').value.trim() || '' };
      const items = cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price }));
      // Build payment object according to selected method
      const paymentMethod = (qs('#pos-payment-method') && qs('#pos-payment-method').value) || 'cash';
      const payment = { method: paymentMethod };
      if (paymentMethod === 'square') {
        payment.token = qs('#pos-square-token') ? qs('#pos-square-token').value.trim() : '';
      } else if (paymentMethod === 'cash') {
        // Optionally prompt for tendered amount
        const tendered = prompt('Enter cash tendered amount (or leave blank):');
        if (tendered) payment.tendered = Number(tendered) || null;
      }
      try {
        const res = await fetch('/api/staff/pos/order', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ items, customer: cust, notes: 'POS sale', payment }) });
        if (!res.ok) { const t = await res.text(); throw new Error(t || 'Sale failed'); }
        const data = await res.json();
        const order = data.order;
          // Track recent receipts in memory
          recentReceipts.push(order);
          if (recentReceipts.length > 200) recentReceipts.shift();
          renderRecent();
  // Build and show receipt
  const html = renderReceiptHtml(order);
  const receipt = qs('#pos-receipt'); receipt.innerHTML = html; receipt.style.display = 'block'; receipt.setAttribute('aria-hidden','false');
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Receipt</title><link rel="stylesheet" href="/assets/styles.css"></head><body>${html}</body></html>`);
  w.document.close();
        // Clear cart
        cart.length = 0; renderCart();
        // Refresh inventory widgets if present
        if (typeof loadInv === 'function') try{ loadInv(); } catch(e){}
      } catch (err) { alert('Sale failed: ' + (err.message || '')); }
    });
    loadMenu(); renderCart();
  });
})();

// Booking modal behavior
(function initWorkspaceModal(){
  const backdrop = qs('#ws-backdrop');
  if (!backdrop) return;
  qs('#ws-close').addEventListener('click', ()=>backdrop.setAttribute('aria-hidden','true'));
  qs('#ws-submit').addEventListener('click', async ()=>{
    const fd = new FormData(qs('#ws-modal-form'));
    const payload = {
      date: fd.get('date'),
      startTime: fd.get('start'),
      endTime: fd.get('end'),
      roomType: fd.get('roomType'),
      attendees: parseInt(fd.get('attendees')||'1', 10),
      purpose: fd.get('purpose')||'',
      contact: {
        name: fd.get('name')||'',
        email: fd.get('email')||'',
        phone: fd.get('phone')||''
      },
      depositAmount: parseFloat(qs('#ws-deposit').value) || 0,
      depositStatus: 'due'
    };
    // Basic front validations
    if (!payload.date || !payload.startTime || !payload.endTime || !payload.contact.name || !payload.contact.email) {
      alert('Please fill in required fields.');
      return;
    }
    const res = await fetch('/api/booking', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!res.ok) { const t = await res.text(); alert('Request failed: ' + t); return; }
    backdrop.setAttribute('aria-hidden','true');
    location.href = '/scheduled.html';
  });
})();
