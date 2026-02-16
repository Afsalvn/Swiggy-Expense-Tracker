console.log('Swiggy Food Expense Tracker content script loaded.');

// We'll use the API endpoint that Swiggy uses for its "Orders" page
const ORDERS_API_URL = 'https://www.swiggy.com/dapi/order/all?order_id=';

async function fetchAllOrders(startDateStr, endDateStr) {
    let allOrders = [];
    let nextOrderId = '';
    let hasMore = true;
    let pageCount = 0;
    const MAX_PAGES = 50;

    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    console.log('Starting order fetch with range:', startDate, 'to', endDate);

    while (hasMore && pageCount < MAX_PAGES) {
        try {
            // Swiggy API fetches most recent first
            const url = nextOrderId ? `${ORDERS_API_URL}${nextOrderId}` : 'https://www.swiggy.com/dapi/order/all';
            const response = await fetch(url);

            if (!response.ok) {
                console.error('Failed to fetch orders', response.status);
                break;
            }

            const data = await response.json();

            if (data.statusCode === 0 && data.data && data.data.orders) {
                const orders = data.data.orders;

                // Filter orders based on date range
                const filteredOrders = orders.filter(order => {
                    const orderDate = new Date(order.order_time);
                    if (endDate && orderDate > endDate) return false; // Too recent
                    if (startDate && orderDate < startDate) return false; // Too old
                    return true;
                });

                allOrders = allOrders.concat(filteredOrders);
                console.log(`Fetched batch of ${orders.length}, kept ${filteredOrders.length}. Total kept: ${allOrders.length}`);

                // Check if we need to stop fetching because we've gone past the start date
                if (startDate && orders.length > 0) {
                    const oldestInBatch = new Date(orders[orders.length - 1].order_time);
                    if (oldestInBatch < startDate) {
                        console.log('Reached past start date, stopping fetch.');
                        hasMore = false;
                        break;
                    }
                }

                if (data.data.orders.length > 0) {
                    nextOrderId = orders[orders.length - 1].order_id;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }

            pageCount++;
            await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
            console.error('Error fetching orders:', error);
            hasMore = false;
        }
    }

    console.log('Finished fetching. Total filtered orders:', allOrders.length);

    // Get existing orders to merge if "All Time" wasn't selected, 
    // BUT the user asked for "sync data only from the specified dates".
    // If we only sync partial data, we shouldn't overwrite everything with just that partial data.
    // However, merging is complex without unique IDs and sorting. 
    // Simplest approach for "Sync Data" with date range is to overwrite or append? 
    // The user said "sync data only from the specified dates". 
    // If they want to see "Last 30 Days", they might expect ONLY those orders to be in the dashboard.
    // So overwriting 'swiggy_orders' with the result seems correct for the requested behavior.

    await chrome.storage.local.set({
        'swiggy_orders': allOrders,
        'last_synced': new Date().toISOString()
    });

    return allOrders;
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchData') {
        const { startDate, endDate } = request;
        fetchAllOrders(startDate, endDate).then(data => {
            sendResponse({ success: true, count: data.length });
        }).catch(err => {
            sendResponse({ success: false, error: err.toString() });
        });
        return true; // Keep channel open
    }
});
