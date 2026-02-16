chrome.runtime.onInstalled.addListener(() => {
  console.log('Swiggy Food Expense Tracker installed.');
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openDashboard') {
    chrome.tabs.create({ url: 'dashboard.html' });
  }
});
