// Default Data Structure
const defaultCategories = [
    { id: 'cat-1', name: 'Starters' },
    { id: 'cat-2', name: 'Main Course' },
    { id: 'cat-3', name: 'Beverages' },
    { id: 'cat-4', name: 'Desserts' }
];

const defaultMenu = [
    { id: 'item-1', name: 'Garlic Bread', category: 'cat-1', price: 4.99, image: 'https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=300&q=80' },
    { id: 'item-2', name: 'Bruschetta', category: 'cat-1', price: 6.50, image: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?auto=format&fit=crop&w=300&q=80' },
    { id: 'item-3', name: 'Grilled Salmon', category: 'cat-2', price: 18.99, image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=300&q=80' },
    { id: 'item-4', name: 'Margherita Pizza', category: 'cat-2', price: 12.99, image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=300&q=80' },
    { id: 'item-5', name: 'Iced Latte', category: 'cat-3', price: 3.99, image: 'https://images.unsplash.com/photo-1517701550927-30cfcb64cf45?auto=format&fit=crop&w=300&q=80' },
    { id: 'item-6', name: 'Chocolate Lava Cake', category: 'cat-4', price: 7.99, image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=300&q=80' }
];

// App State
let state = {
    categories: [],
    menu: [],
    orders: [],
    passcode: '1234',
    currentCustomer: { name: '', table: '' },
    cart: [],
    activeCategory: ''
};

// LocalStorage Helpers
const storage = {
    save: (key, data) => localStorage.setItem(`qr_menu_${key}`, JSON.stringify(data)),
    load: (key) => JSON.parse(localStorage.getItem(`qr_menu_${key}`)),
    clear: () => {
        ['categories', 'menu', 'orders', 'passcode'].forEach(key => localStorage.removeItem(`qr_menu_${key}`));
    }
};

// Initialize App
function initApp() {
    // Load state from local storage or set defaults
    state.categories = storage.load('categories') || defaultCategories;
    state.menu = storage.load('menu') || defaultMenu;
    state.orders = storage.load('orders') || [];
    state.passcode = storage.load('passcode') || '1234';
    
    // Save defaults if not present to ensure they persist
    storage.save('categories', state.categories);
    storage.save('menu', state.menu);
    storage.save('passcode', state.passcode);
    storage.save('orders', state.orders);

    if(state.categories.length > 0) {
        state.activeCategory = state.categories[0].id;
    }

    setupEventListeners();
    showView('landing-view');
}

// Custom ID Generator
function generateId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

// ------ DOM Elements ------
const views = document.querySelectorAll('.view');
const adminFab = document.getElementById('admin-access-btn');

// ------ Routing / View Management ------
function showView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    // Hide FAB in Admin panel
    if(viewId === 'admin-dashboard-view') {
        adminFab.style.display = 'none';
    } else {
        adminFab.style.display = 'flex';
    }
    
    // Trigger specific view renders
    if(viewId === 'menu-view') renderCustomerMenu();
    if(viewId === 'admin-dashboard-view') renderAdminDashboard('orders');
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

    // Cart Navigation
    document.getElementById('cart-btn').addEventListener('click', openCart);
    document.getElementById('close-cart').addEventListener('click', closeCart);
    
    // Checkout
    document.getElementById('checkout-btn').addEventListener('click', placeOrder);
    
    // New Order (from confirmation)
    document.getElementById('new-order-btn').addEventListener('click', () => {
        state.cart = []; // clear cart
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
        if(code === state.passcode) {
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
            
            // Auto close mobile sidebar
            if(window.innerWidth <= 768) {
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

    // Admin Action Buttons
    setupAdminActions();
}

// ------ Customer Flow Logic ------

function renderCustomerMenu() {
    const nav = document.getElementById('category-nav');
    const container = document.getElementById('menu-items-container');
    
    // Render Categories
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

    // Render Items
    container.innerHTML = '';
    const filteredMenu = state.menu.filter(item => item.category === state.activeCategory);
    
    if(filteredMenu.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 2rem;">No items in this category yet.</p>`;
        return;
    }

    filteredMenu.forEach(item => {
        const inCart = state.cart.find(ci => ci.id === item.id);
        
        const card = document.createElement('div');
        card.className = 'menu-item-card';
        card.innerHTML = `
            <div class="item-img-wrapper">
                <img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
            </div>
            <div class="item-content">
                <div class="item-name">${item.name}</div>
                <div class="item-price">$${item.price.toFixed(2)}</div>
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
    if(item) {
        state.cart.push({ ...item, qty: 1 });
        updateCartBadge();
        renderCustomerMenu(); // Re-render to show qty selector
    }
}

function updateItemQty(itemId, change) {
    const index = state.cart.findIndex(i => i.id === itemId);
    if(index > -1) {
        state.cart[index].qty += change;
        if(state.cart[index].qty <= 0) {
            state.cart.splice(index, 1);
        }
    }
    updateCartBadge();
    renderCustomerMenu();
    
    // If cart modal is open, update it
    if(document.getElementById('cart-modal').classList.contains('show')) {
        renderCart();
    }
}

function updateCartBadge() {
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('cart-badge');
    badge.textContent = count;
    
    // Animate badge
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
    
    if(state.cart.length === 0) {
        container.innerHTML = `<p style="text-align:center; margin-top: 2rem;">Your cart is empty.</p>`;
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
                <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/60?text=Img'">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">$${item.price.toFixed(2)}</div>
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

function placeOrder() {
    if(state.cart.length === 0) return;

    const total = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const newOrder = {
        id: generateId('ORD'),
        customerName: state.currentCustomer.name,
        table: state.currentCustomer.table,
        items: [...state.cart],
        total: total,
        status: 'pending', // pending, preparing, ready, completed
        timestamp: new Date().toISOString()
    };

    state.orders.unshift(newOrder); // Add to beginning
    storage.save('orders', state.orders);
    
    closeCart();
    showConfirmation(newOrder);
}

function showConfirmation(order) {
    document.getElementById('confirm-order-id').textContent = `#${order.id.split('-')[1].toUpperCase()}`;
    
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
    // Hide all tabs
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    switch(tabId) {
        case 'orders': renderAdminOrders(); break;
        case 'menu': renderAdminMenu(); break;
        case 'categories': renderAdminCategories(); break;
    }
}

function renderAdminOrders() {
    const container = document.getElementById('admin-orders-container');
    container.innerHTML = '';
    
    if(state.orders.length === 0) {
        container.innerHTML = '<p>No orders received yet.</p>';
        return;
    }

    state.orders.forEach(order => {
        const timeStr = new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let itemsHtml = order.items.map(i => `<li><span>${i.qty}x ${i.name}</span><span>$${(i.price * i.qty).toFixed(2)}</span></li>`).join('');
        
        // Status Colors mapping inside mapping HTML string:
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
                <div style="text-align:right; font-weight:bold; margin-bottom: 1rem;">Total: $${order.total.toFixed(2)}</div>
                
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

window.updateOrderStatus = function(orderId, newStatus) {
    const orderIndex = state.orders.findIndex(o => o.id === orderId);
    if(orderIndex > -1) {
        state.orders[orderIndex].status = newStatus;
        storage.save('orders', state.orders);
        renderAdminOrders();
    }
};

function renderAdminMenu() {
    const tbody = document.getElementById('admin-menu-table-body');
    tbody.innerHTML = '';
    
    state.menu.forEach(item => {
        const cat = state.categories.find(c => c.id === item.category);
        const catName = cat ? cat.name : 'Unknown';
        
        tbody.innerHTML += `
            <tr>
                <td><img src="${item.image}" alt="img" class="table-img" onerror="this.src='https://via.placeholder.com/50'"></td>
                <td><strong>${item.name}</strong></td>
                <td><span class="status-badge" style="background-color: var(--gray);">${catName}</span></td>
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-sm btn-outline" onclick="editItem('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });

    // Populate Category Dropdown for modal
    const catSelect = document.getElementById('item-category');
    catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function renderAdminCategories() {
    const tbody = document.getElementById('admin-categories-table-body');
    tbody.innerHTML = '';
    
    state.categories.forEach(cat => {
        const itemsCount = state.menu.filter(m => m.category === cat.id).length;
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
    // Orders Refresh
    document.getElementById('refresh-orders').addEventListener('click', renderAdminOrders);

    // Settings
    document.getElementById('change-passcode-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const oldP = document.getElementById('old-passcode').value;
        const newP = document.getElementById('new-passcode').value;
        
        if(oldP === state.passcode) {
            if(newP.length < 4) return alert('Passcode must be at least 4 characters.');
            state.passcode = newP;
            storage.save('passcode', state.passcode);
            alert('Passcode updated successfully!');
            e.target.reset();
        } else {
            alert('Incorrect current passcode.');
        }
    });

    document.getElementById('reset-data-btn').addEventListener('click', () => {
        if(confirm('WARNING: This will delete ALL menus, categories, and orders. Are you absolutely sure?')) {
            storage.clear();
            location.reload();
        }
    });

    // Modals Close
    document.getElementById('close-item-modal').addEventListener('click', () => {
        document.getElementById('item-modal').classList.remove('show');
    });
    
    document.getElementById('close-category-modal').addEventListener('click', () => {
        document.getElementById('category-modal').classList.remove('show');
    });

    // Add Item Flow
    document.getElementById('add-item-btn').addEventListener('click', () => {
        if(state.categories.length === 0) return alert('Please add a category first!');
        
        document.getElementById('item-form').reset();
        document.getElementById('item-id').value = '';
        document.getElementById('item-image-preview').style.display = 'none';
        document.getElementById('item-modal-title').textContent = 'Add Menu Item';
        document.getElementById('item-modal').classList.add('show');
    });
    
    // Auto preview image URL
    document.getElementById('item-image').addEventListener('input', (e) => {
        const preview = document.getElementById('item-image-preview');
        if(e.target.value) {
            preview.src = e.target.value;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    });

    // Save Item
    document.getElementById('item-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('item-id').value;
        
        const newItem = {
            id: id || generateId('item'),
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            price: parseFloat(document.getElementById('item-price').value),
            image: document.getElementById('item-image').value
        };

        if(id) {
            const index = state.menu.findIndex(m => m.id === id);
            if(index > -1) state.menu[index] = newItem;
        } else {
            state.menu.push(newItem);
        }

        storage.save('menu', state.menu);
        document.getElementById('item-modal').classList.remove('show');
        renderAdminMenu();
    });

    // Add Category Flow
    document.getElementById('add-category-btn').addEventListener('click', () => {
        document.getElementById('category-form').reset();
        document.getElementById('category-old-name').value = '';
        document.getElementById('category-modal-title').textContent = 'Add Category';
        document.getElementById('category-modal').classList.add('show');
    });

    document.getElementById('category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('category-name').value;
        const oldId = document.getElementById('category-old-name').value;
        
        if(!name.trim()) return;

        if(oldId) {
            const index = state.categories.findIndex(c => c.id === oldId);
            if(index > -1) state.categories[index].name = name;
        } else {
            state.categories.push({ id: generateId('cat'), name: name });
        }
        
        storage.save('categories', state.categories);
        document.getElementById('category-modal').classList.remove('show');
        renderAdminCategories();
        
        // Ensure active category is valid
        if(!state.activeCategory && state.categories.length > 0) {
            state.activeCategory = state.categories[0].id;
        }
    });
}

window.editItem = function(id) {
    const item = state.menu.find(m => m.id === id);
    if(!item) return;
    
    document.getElementById('item-modal-title').textContent = 'Edit Menu Item';
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-price').value = item.price;
    document.getElementById('item-image').value = item.image;
    
    const preview = document.getElementById('item-image-preview');
    preview.src = item.image;
    preview.style.display = 'block';
    
    document.getElementById('item-modal').classList.add('show');
};

window.deleteItem = function(id) {
    if(confirm('Are you sure you want to delete this menu item?')) {
        state.menu = state.menu.filter(m => m.id !== id);
        
        // Also remove from active carts across app if needed, 
        // though static app logic means it's simpler
        state.cart = state.cart.filter(c => c.id !== id);
        
        storage.save('menu', state.menu);
        renderAdminMenu();
        if(views[1].classList.contains('active')) renderCustomerMenu();
    }
};

window.editCategory = function(id) {
    const cat = state.categories.find(c => c.id === id);
    if(!cat) return;
    
    document.getElementById('category-modal-title').textContent = 'Edit Category';
    document.getElementById('category-old-name').value = cat.id;
    document.getElementById('category-name').value = cat.name;
    
    document.getElementById('category-modal').classList.add('show');
};

window.deleteCategory = function(id) {
    const itemInCat = state.menu.some(m => m.category === id);
    if(itemInCat) {
        alert('Cannot delete category. It contains menu items. Delete the items first.');
        return;
    }

    if(confirm('Are you sure you want to delete this category?')) {
        state.categories = state.categories.filter(c => c.id !== id);
        if(state.activeCategory === id) {
            state.activeCategory = state.categories.length > 0 ? state.categories[0].id : '';
        }
        storage.save('categories', state.categories);
        renderAdminCategories();
    }
};

// Start the app when DOM loads
document.addEventListener('DOMContentLoaded', initApp);
