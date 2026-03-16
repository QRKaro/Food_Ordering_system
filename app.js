// --- Supabase Setup ---
const SUPABASE_URL = 'https://bxjfnnminlspnpnvctmz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ciYgm78MleXGqStaM6Nx5Q_XxMabbbg';
let db = null; // Will hold the Supabase client

// Default categories to seed if DB is empty
const defaultCategories = [
    { name: 'Classic Dosas' },
    { name: 'Special Dosas' },
    { name: 'Idlis & Vadas' },
    { name: 'Sides & Chutneys' },
    { name: 'Beverages' }
];

// App State
let state = {
    categories: [],
    menu: [],
    orders: [],
    passcode: '1234',
    currentCustomer: { name: '', table: '' },
    cart: [],
    activeCategory: '',
    searchQuery: ''
};

// LocalStorage Helpers (Only for passcode now)
const storage = {
    save: (key, data) => localStorage.setItem(`qr_menu_${key}`, JSON.stringify(data)),
    load: (key) => JSON.parse(localStorage.getItem(`qr_menu_${key}`))
};

// Initialize App
async function initApp() {
    state.passcode = storage.load('passcode') || '1234';

    // Wait for Supabase CDN to be ready
    let retries = 0;
    while (!window.supabase && retries < 30) {
        await new Promise(r => setTimeout(r, 150));
        retries++;
    }

    if (!window.supabase) {
        alert('Failed to load Supabase library. Please check your internet connection and refresh.');
        return;
    }

    // Create the Supabase client
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Fetch data from DB
    const success = await fetchAllData();

    // If DB is totally empty, seed default categories
    if (success && state.categories.length === 0) {
        console.log('Database empty, seeding default categories...');
        try {
            await db.from('categories').insert(defaultCategories);
            await fetchAllData();
        } catch (e) {
            console.error('Failed to seed categories', e);
        }
    }

    setupRealtimeSubscription();
    setupEventListeners();
    showView('landing-view');
}

// --- Database Operations ---

async function fetchAllData() {
    try {
        const [catsRes, menuRes, ordersRes] = await Promise.all([
            db.from('categories').select('*').order('created_at', { ascending: true }),
            db.from('menu').select('*'),
            db.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
        ]);

        if (catsRes.error) throw catsRes.error;
        if (menuRes.error) throw menuRes.error;
        if (ordersRes.error) throw ordersRes.error;

        state.categories = catsRes.data || [];
        state.menu = menuRes.data || [];

        state.orders = (ordersRes.data || []).map(o => ({
            id: o.id,
            table: o.table_number,
            customerName: o.customer_name,
            total: o.total_price,
            status: o.status,
            timestamp: o.created_at,
            items: o.order_items.map(item => ({
                name: item.menu_item_name,
                price: item.price,
                qty: item.quantity
            }))
        }));

        if (state.categories.length > 0) {
            state.activeCategory = state.categories[0].id;
        }
        return true;
    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Could not connect to database. Make sure you ran the SQL script in Supabase!');
        return false;
    }
}

function setupRealtimeSubscription() {
    db.channel('public:orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
            const ordersRes = await db.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
            if (!ordersRes.error) {
                state.orders = ordersRes.data.map(o => ({
                    id: o.id,
                    table: o.table_number,
                    customerName: o.customer_name,
                    total: o.total_price,
                    status: o.status,
                    timestamp: o.created_at,
                    items: o.order_items.map(item => ({
                        name: item.menu_item_name,
                        price: item.price,
                        qty: item.quantity
                    }))
                }));
                if (document.getElementById('admin-dashboard-view').classList.contains('active') && document.getElementById('tab-orders').classList.contains('active')) {
                    renderAdminOrders();
                }
            }
        })
        .subscribe();
}

// ------ DOM Elements ------
const views = document.querySelectorAll('.view');
const adminFab = document.getElementById('admin-access-btn');

// ------ Routing / View Management ------
let adminPollInterval = null;

async function showView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Clear any existing polling when leaving admin
    if (adminPollInterval) {
        clearInterval(adminPollInterval);
        adminPollInterval = null;
    }

    if (viewId === 'admin-dashboard-view') {
        adminFab.style.display = 'none';
        await fetchAllData(); // Fetch fresh data on open
        renderAdminDashboard('orders');

        // Start auto-polling every 5 seconds for live order updates
        adminPollInterval = setInterval(async () => {
            await fetchAllData();
            // Only re-render if orders tab is active
            if (document.getElementById('tab-orders').classList.contains('active')) {
                renderAdminOrders();
            }
        }, 5000);
    } else if (viewId === 'landing-view') {
        adminFab.style.display = 'flex';
    } else {
        adminFab.style.display = 'none';
    }

    if (viewId === 'menu-view') renderCustomerMenu();
}

// ------ Event Listeners ------
function setupEventListeners() {
    // Customer Login
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        state.currentCustomer.table = document.getElementById('table-num').value;
        state.currentCustomer.name = document.getElementById('customer-name').value;

        document.getElementById('display-name').textContent = state.currentCustomer.name;
        document.getElementById('display-table').textContent = state.currentCustomer.table;

        showView('menu-view');
    });

    // Go Back to Landing
    document.getElementById('back-to-landing-btn').addEventListener('click', () => {
        state.cart = [];
        updateCartBadge();
        showView('landing-view');
    });

    // Search functionality
    document.getElementById('menu-search').addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderCustomerMenu();
    });

    // Cart Navigation
    document.getElementById('cart-btn').addEventListener('click', openCart);
    document.getElementById('close-cart').addEventListener('click', closeCart);

    // Checkout
    document.getElementById('checkout-btn').addEventListener('click', placeOrder);

    // New Order (from confirmation)
    document.getElementById('new-order-btn').addEventListener('click', () => {
        state.cart = [];
        updateCartBadge();
        showView('menu-view');
    });

    // Admin Access
    adminFab.addEventListener('click', () => {
        document.getElementById('admin-login-modal').classList.add('show');
        document.getElementById('admin-passcode').value = '';
        setTimeout(() => document.getElementById('admin-passcode').focus(), 100);
    });

    document.getElementById('close-admin-login').addEventListener('click', () => {
        document.getElementById('admin-login-modal').classList.remove('show');
    });

    document.getElementById('admin-login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('admin-passcode').value;
        if (code === state.passcode) {
            document.getElementById('admin-login-modal').classList.remove('show');
            showView('admin-dashboard-view');
        } else {
            alert('Incorrect Passcode!');
        }
    });

    // Admin Navigation
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            renderAdminDashboard(targetBtn.dataset.tab);

            if (window.innerWidth <= 768) {
                document.getElementById('admin-sidebar').classList.remove('open');
            }
        });
    });

    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        showView('landing-view');
    });

    document.getElementById('admin-menu-toggle').addEventListener('click', () => {
        document.getElementById('admin-sidebar').classList.toggle('open');
    });

    setupAdminActions();
}

// ------ Customer Flow Logic ------

function renderCustomerMenu() {
    const nav = document.getElementById('category-nav');
    const container = document.getElementById('menu-items-container');

    nav.innerHTML = '';
    state.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-chip ${state.activeCategory === cat.id ? 'active' : ''}`;
        btn.textContent = cat.name;
        btn.onclick = () => {
            state.activeCategory = cat.id;
            renderCustomerMenu();
        };
        nav.appendChild(btn);
    });

    container.innerHTML = '';

    let filteredMenu = [];
    if (state.searchQuery) {
        // Search across all items
        filteredMenu = state.menu.filter(item => 
            item.name.toLowerCase().includes(state.searchQuery)
        );
    } else {
        // Filter by active category
        filteredMenu = state.menu.filter(item => item.category_id === state.activeCategory);
    }

    if (filteredMenu.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 2rem;">
            ${state.searchQuery ? `No items found matching "${state.searchQuery}"` : 'No items in this category yet.'}
        </p>`;
        return;
    }

    filteredMenu.forEach(item => {
        const inCart = state.cart.find(ci => ci.id === item.id);

        const card = document.createElement('div');
        card.className = 'menu-item-card';
        card.innerHTML = `
            <div class="item-content">
                <div class="item-name">${item.name}</div>
                <div class="item-price">$${Number(item.price).toFixed(2)}</div>
                ${inCart
                    ? `<div class="qty-selector">
                        <button class="qty-btn" onclick="updateItemQty('${item.id}', -1)">-</button>
                        <span class="qty-val">${inCart.qty}</span>
                        <button class="qty-btn" onclick="updateItemQty('${item.id}', 1)">+</button>
                       </div>`
                    : `<button class="add-to-cart-btn" onclick="addToCart('${item.id}')">Add to Cart</button>`
                }
            </div>
        `;
        container.appendChild(card);
    });
}

function addToCart(itemId) {
    const item = state.menu.find(i => i.id === itemId);
    if (item) {
        state.cart.push({ ...item, qty: 1 });
        updateCartBadge();
        renderCustomerMenu();
    }
}

function updateItemQty(itemId, change) {
    const index = state.cart.findIndex(i => i.id === itemId);
    if (index > -1) {
        state.cart[index].qty += change;
        if (state.cart[index].qty <= 0) {
            state.cart.splice(index, 1);
        }
    }
    updateCartBadge();
    renderCustomerMenu();

    if (document.getElementById('cart-modal').classList.contains('show')) {
        renderCart();
    }
}

function updateCartBadge() {
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('cart-badge');
    badge.textContent = count;

    badge.style.transform = 'translate(25%, -25%) scale(1.3)';
    setTimeout(() => { badge.style.transform = 'translate(25%, -25%) scale(1)'; }, 200);
}

function openCart() {
    renderCart();
    document.getElementById('cart-modal').classList.add('show');
}

function closeCart() {
    document.getElementById('cart-modal').classList.remove('show');
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total-price');
    const checkoutBtn = document.getElementById('checkout-btn');

    container.innerHTML = '';

    if (state.cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; margin-top: 2rem;">Your cart is empty.</p>';
        totalEl.textContent = '$0.00';
        checkoutBtn.disabled = true;
        checkoutBtn.style.opacity = 0.5;
        return;
    }

    checkoutBtn.disabled = false;
    checkoutBtn.style.opacity = 1;

    let total = 0;

    state.cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;

        container.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">$${Number(item.price).toFixed(2)}</div>
                </div>
                <div class="qty-selector" style="margin-top:0;">
                    <button class="qty-btn" onclick="updateItemQty('${item.id}', -1)">-</button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="updateItemQty('${item.id}', 1)">+</button>
                </div>
            </div>
        `;
    });

    totalEl.textContent = `$${total.toFixed(2)}`;
}

async function placeOrder() {
    if (state.cart.length === 0) return;

    const checkoutBtn = document.getElementById('checkout-btn');
    checkoutBtn.textContent = 'Placing...';
    checkoutBtn.disabled = true;

    const total = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    try {
        const { data: orderData, error: orderError } = await db
            .from('orders')
            .insert([{
                table_number: state.currentCustomer.table,
                customer_name: state.currentCustomer.name,
                total_price: total,
                status: 'pending'
            }])
            .select();

        if (orderError) throw orderError;
        const newOrderId = orderData[0].id;

        const orderItemsToInsert = state.cart.map(item => ({
            order_id: newOrderId,
            menu_item_name: item.name,
            price: item.price,
            quantity: item.qty
        }));

        const { error: itemsError } = await db
            .from('order_items')
            .insert(orderItemsToInsert);

        if (itemsError) throw itemsError;

        const orderObj = {
            id: newOrderId,
            total: total,
            items: state.cart.map(i => ({ name: i.name, qty: i.qty, price: i.price }))
        };

        closeCart();
        showConfirmation(orderObj);

    } catch (err) {
        console.error('Order failed', err);
        alert('Failed to place order. Please try again.');
    } finally {
        checkoutBtn.textContent = 'Place Order';
        checkoutBtn.disabled = false;
    }
}

function showConfirmation(order) {
    document.getElementById('confirm-order-id').textContent = `#${order.id.split('-')[0].toUpperCase()}`;

    const list = document.getElementById('confirm-items-list');
    list.innerHTML = '';
    order.items.forEach(item => {
        list.innerHTML += `
            <div class="confirm-item">
                <span>${item.qty}x ${item.name}</span>
                <span>$${(item.price * item.qty).toFixed(2)}</span>
            </div>
        `;
    });

    document.getElementById('confirm-total-price').textContent = `$${order.total.toFixed(2)}`;

    showView('confirmation-view');
}

// ------ Admin Flow Logic ------

function renderAdminDashboard(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    switch (tabId) {
        case 'orders': renderAdminOrders(); break;
        case 'menu': renderAdminMenu(); break;
        case 'categories': renderAdminCategories(); break;
    }
}

function renderAdminOrders() {
    const container = document.getElementById('admin-orders-container');
    container.innerHTML = '';

    if (state.orders.length === 0) {
        container.innerHTML = '<p>No orders received yet.</p>';
        return;
    }

    state.orders.forEach(order => {
        const timeStr = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let itemsHtml = order.items.map(i => `<li><span>${i.qty}x ${i.name}</span><span>$${(i.price * i.qty).toFixed(2)}</span></li>`).join('');

        const sColors = {
            'pending': 'var(--warning)',
            'preparing': 'var(--secondary)',
            'ready': 'var(--primary)',
            'completed': 'var(--success)'
        };
        const sColor = sColors[order.status] || '#ccc';

        container.innerHTML += `
            <div class="order-card" style="border-top: 4px solid ${sColor}">
                <div class="order-card-header">
                    <div>
                        <div class="order-customer">${order.customerName}</div>
                        <span class="order-table-badge">Table ${order.table}</span>
                    </div>
                    <div class="order-time">${timeStr}</div>
                </div>
                <ul class="order-items-list" style="list-style:none; padding:0;">
                    ${itemsHtml}
                </ul>
                <div style="text-align:right; font-weight:bold; margin-bottom: 1rem;">Total: $${Number(order.total).toFixed(2)}</div>
                
                <div>Status: <span class="status-badge" style="background-color: ${sColor}">${order.status.toUpperCase()}</span></div>
                
                <div class="order-actions">
                    <select class="btn btn-outline btn-sm" style="flex-grow:1; padding: 6px;" onchange="updateOrderStatus('${order.id}', this.value)">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                        <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
            </div>
        `;
    });
}

window.updateOrderStatus = async function (orderId, newStatus) {
    try {
        const { error } = await db.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;

        const orderIndex = state.orders.findIndex(o => o.id === orderId);
        if (orderIndex > -1) {
            state.orders[orderIndex].status = newStatus;
            renderAdminOrders();
        }
    } catch (err) {
        console.error('Failed to update status', err);
        alert('Failed to update status.');
    }
};

function renderAdminMenu() {
    const tbody = document.getElementById('admin-menu-table-body');
    tbody.innerHTML = '';

    state.menu.forEach(item => {
        const cat = state.categories.find(c => c.id === item.category_id);
        const catName = cat ? cat.name : 'Unknown';

        tbody.innerHTML += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td><span class="status-badge" style="background-color: var(--gray);">${catName}</span></td>
                <td>$${Number(item.price).toFixed(2)}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-sm btn-outline" onclick="editItem('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });

    const catSelect = document.getElementById('item-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function renderAdminCategories() {
    const tbody = document.getElementById('admin-categories-table-body');
    tbody.innerHTML = '';

    state.categories.forEach(cat => {
        const itemsCount = state.menu.filter(m => m.category_id === cat.id).length;
        tbody.innerHTML += `
            <tr>
                <td><strong>${cat.name}</strong> <span style="color:var(--gray); font-size:0.8rem; margin-left: 10px;">(${itemsCount} items)</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-sm btn-outline" onclick="editCategory('${cat.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function setupAdminActions() {
    document.getElementById('refresh-orders').addEventListener('click', async () => {
        await fetchAllData();
        renderAdminDashboard('orders');
    });

    document.getElementById('change-passcode-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const oldP = document.getElementById('old-passcode').value;
        const newP = document.getElementById('new-passcode').value;

        if (oldP === state.passcode) {
            if (newP.length < 4) return alert('Passcode must be at least 4 characters.');
            state.passcode = newP;
            storage.save('passcode', state.passcode);
            alert('Passcode updated successfully!');
            e.target.reset();
        } else {
            alert('Incorrect current passcode.');
        }
    });

    document.getElementById('reset-data-btn').addEventListener('click', () => {
        alert('Factory Reset is disabled for live databases. Please clear tables manually in Supabase dashboard.');
    });

    document.getElementById('close-item-modal').addEventListener('click', () => {
        document.getElementById('item-modal').classList.remove('show');
    });

    document.getElementById('close-category-modal').addEventListener('click', () => {
        document.getElementById('category-modal').classList.remove('show');
    });

    document.getElementById('add-item-btn').addEventListener('click', () => {
        if (state.categories.length === 0) return alert('Please add a category first!');

        document.getElementById('item-form').reset();
        document.getElementById('item-id').value = '';
        document.getElementById('item-modal-title').textContent = 'Add Menu Item';
        document.getElementById('item-modal').classList.add('show');
    });

    // Removed item-image listener

    document.getElementById('item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = Array.from(e.target.elements).find(el => el.type === 'submit');
        btn.disabled = true;

        const id = document.getElementById('item-id').value;
        const payload = {
            name: document.getElementById('item-name').value,
            category_id: document.getElementById('item-category').value,
            price: parseFloat(document.getElementById('item-price').value)
        };

        try {
            if (id) {
                await db.from('menu').update(payload).eq('id', id);
            } else {
                await db.from('menu').insert([payload]);
            }
            await fetchAllData();
            document.getElementById('item-modal').classList.remove('show');
            renderAdminMenu();
        } catch (err) {
            console.error('Save item err', err);
            alert('Failed to save item.');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('add-category-btn').addEventListener('click', () => {
        document.getElementById('category-form').reset();
        document.getElementById('category-old-name').value = '';
        document.getElementById('category-modal-title').textContent = 'Add Category';
        document.getElementById('category-modal').classList.add('show');
    });

    document.getElementById('category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = Array.from(e.target.elements).find(el => el.type === 'submit');
        const name = document.getElementById('category-name').value;
        const oldId = document.getElementById('category-old-name').value;

        if (!name.trim()) return;
        btn.disabled = true;

        try {
            if (oldId) {
                await db.from('categories').update({ name }).eq('id', oldId);
            } else {
                await db.from('categories').insert([{ name }]);
            }

            await fetchAllData();
            document.getElementById('category-modal').classList.remove('show');
            renderAdminCategories();
        } catch (err) {
            console.error('Category save error', err);
            alert('Failed to save category.');
        } finally {
            btn.disabled = false;
        }
    });
}

window.editItem = function (id) {
    const item = state.menu.find(m => m.id === id);
    if (!item) return;

    document.getElementById('item-modal-title').textContent = 'Edit Menu Item';
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category_id;
    document.getElementById('item-price').value = item.price;

    document.getElementById('item-modal').classList.add('show');
};

window.deleteItem = async function (id) {
    if (confirm('Are you sure you want to delete this menu item?')) {
        try {
            await db.from('menu').delete().eq('id', id);
            await fetchAllData();
            renderAdminMenu();
        } catch (err) {
            alert('Failed to delete item.');
        }
    }
};

window.editCategory = function (id) {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;

    document.getElementById('category-modal-title').textContent = 'Edit Category';
    document.getElementById('category-old-name').value = cat.id;
    document.getElementById('category-name').value = cat.name;

    document.getElementById('category-modal').classList.add('show');
};

window.deleteCategory = async function (id) {
    const itemInCat = state.menu.some(m => m.category_id === id);
    if (itemInCat) {
        alert('Cannot delete category. It contains menu items. Delete the items first.');
        return;
    }

    if (confirm('Are you sure you want to delete this category?')) {
        try {
            await db.from('categories').delete().eq('id', id);
            await fetchAllData();

            if (state.activeCategory === id) {
                state.activeCategory = state.categories.length > 0 ? state.categories[0].id : '';
            }
            renderAdminCategories();
        } catch (err) {
            alert('Failed to delete category');
        }
    }
};

// Start the app when DOM loads
document.addEventListener('DOMContentLoaded', initApp);
