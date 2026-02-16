document.addEventListener('DOMContentLoaded', async () => {
    const refreshBtn = document.getElementById('refreshData');



    const filterAllTimeBtn = document.getElementById('filterAllTime');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    let currentOrders = [];

    // Helper to trigger sync automatically after setting dates? 
    // User said "select date and click sync data". So we just set dates.
    // But for shortcuts, maybe we just set dates and let user click Sync?
    // "remove the filter tab" -> implies no more client-side filtering button.
    // So shortcuts should probably just set the dates in the UI.

    filterAllTimeBtn.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        // If they want "All Time", do we sync immediately? 
        // "click sync data" implies manual action. The buttons act as presets.
        // But previously shortcuts clicked applyFilter.
        // Let's just set the dates.
    });

    document.getElementById('filter30Days').addEventListener('click', () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);

        startDateInput.valueAsDate = start;
        endDateInput.valueAsDate = end;
    });

    document.getElementById('filter3Months').addEventListener('click', () => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 3);

        startDateInput.valueAsDate = start;
        endDateInput.valueAsDate = end;
    });

    refreshBtn.addEventListener('click', () => {
        refreshBtn.textContent = 'Syncing...';
        refreshBtn.disabled = true;

        // We need to communicate with the content script on the Swiggy tab
        // Or if we are in a tab that isn't swiggy, we might need to open one?
        // Ideally, the extension popup triggers the fetch, and then this dashboard reads from storage.
        // But let's allow re-triggering if we can find a swiggy tab.
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        chrome.tabs.query({ url: "*://*.swiggy.com/*" }, (tabs) => {
            if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "fetchData",
                    startDate: startDate,
                    endDate: endDate
                }, (response) => {
                    refreshBtn.textContent = 'Sync Data';
                    refreshBtn.disabled = false;

                    if (response && response.success) {
                        alert(`Synced ${response.count} orders! Refreshing view...`);
                        loadData();
                    } else {
                        alert('Failed to sync. Make sure you are logged into Swiggy in the other tab.');
                    }
                });
            } else {
                refreshBtn.textContent = 'Sync Data';
                refreshBtn.disabled = false;
                alert('Please open Swiggy.com and log in first, then try syncing.');
                chrome.tabs.create({ url: 'https://www.swiggy.com' });
            }
        });
    });

    loadData();
});

async function loadData() {
    const data = await chrome.storage.local.get(['swiggy_orders', 'last_synced']);
    const orders = data.swiggy_orders || [];
    currentOrders = orders;
    currentOrders = orders; // Store for filtering

    if (data.last_synced) {
        const date = new Date(data.last_synced);
        document.getElementById('lastSynced').textContent = `Last synced: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }

    if (orders.length === 0) return;

    processAndRender(orders);
}

function processAndRender(orders) {
    let totalSpent = 0;
    let restaurantCounts = {};
    let monthlySpend = {};
    let maxOrder = { net_total: 0 };

    orders.forEach(order => {
        // Swiggy API field names might vary, assuming 'net_total' or 'order_total'
        // We need to be careful with the amount format (cents vs rupees)
        // Usually Swiggy sends it in full rupees or we need to divide.
        // Let's assume 'net_total' is the amount. If it's very large, maybe it's in logic.
        // Safest is to inspect, but for now let's assume standard float/int.

        const amount = parseFloat(order.net_total || order.order_total || 0);
        const date = new Date(order.order_time || order.order_date); // Adjust field name if needed
        const reqDate = new Date(date);
        const monthKey = `${reqDate.getFullYear()}-${String(reqDate.getMonth() + 1).padStart(2, '0')}`;
        const restName = order.restaurant_name || (order.restaurant ? order.restaurant.name : 'Unknown');

        totalSpent += amount;

        // Max Order
        if (amount > maxOrder.net_total) {
            maxOrder = { ...order, net_total: amount };
        }

        // Restaurant Count
        restaurantCounts[restName] = (restaurantCounts[restName] || 0) + 1;

        // Monthly Spend
        monthlySpend[monthKey] = (monthlySpend[monthKey] || 0) + amount;
    });

    // Update Cards
    document.getElementById('totalSpent').textContent = `₹${totalSpent.toLocaleString('en-IN')}`;
    document.getElementById('totalOrders').textContent = orders.length;
    document.getElementById('avgOrderValue').textContent = `₹${Math.round(totalSpent / orders.length).toLocaleString('en-IN')}`;
    document.getElementById('maxOrderValue').textContent = `₹${maxOrder.net_total.toLocaleString('en-IN')}`;

    // Render Charts
    renderMonthlyChart(monthlySpend);
    renderTopRestaurants(restaurantCounts);

    // Render Table
    renderTable(orders.slice(0, 10)); // Top 10 recent
}

// Global chart instances
let monthlyChart = null;
let topRestaurantsChart = null;

function renderMonthlyChart(data) {
    const ctx = document.getElementById('monthlyTrendChart').getContext('2d');
    const sortedKeys = Object.keys(data).sort();
    const values = sortedKeys.map(k => data[k]);

    // Destroy existing chart if it exists
    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Spending (₹)',
                data: values,
                borderColor: '#fc8019',
                backgroundColor: 'rgba(252, 128, 25, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderTopRestaurants(data) {
    const ctx = document.getElementById('topRestaurantsChart').getContext('2d');
    // Sort by count
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Destroy existing chart if it exists
    if (topRestaurantsChart) {
        topRestaurantsChart.destroy();
    }

    topRestaurantsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(i => i[0]),
            datasets: [{
                data: sorted.map(i => i[1]),
                backgroundColor: [
                    '#fc8019', // Swiggy Orange
                    '#60b246', // Green
                    '#1ca1f1', // Blue
                    '#db5400', // Darker Orange
                    '#7e808c', // Grey
                    '#f1571c'  // Red-Orange
                ]
            }]
        },
        options: {
            responsive: true
        }
    });
}

function renderTable(orders) {
    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = '';
    orders.forEach(order => {
        const row = document.createElement('tr');
        const amount = order.net_total || order.order_total || 0;
        const restName = order.restaurant_name || (order.restaurant ? order.restaurant.name : 'Unknown');
        const date = new Date(order.order_time || order.order_date).toLocaleDateString();

        row.innerHTML = `
            <td>${date}</td>
            <td>${restName}</td>
            <td>${order.items ? order.items.length + ' items' : '-'}</td>
            <td>₹${amount}</td>
            <td><span style="color: green;">Delivered</span></td> <!-- Assumption -->
        `;
        tbody.appendChild(row);
    });
}


