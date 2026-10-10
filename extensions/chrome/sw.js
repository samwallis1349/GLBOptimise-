// Clicking the toolbar button opens the side panel. A popup would close when
// the file picker opens, losing the chosen file; the side panel stays put.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
