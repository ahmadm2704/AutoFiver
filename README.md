# AutoFiverr-FYP

A Chrome extension for Fiverr sellers to efficiently manage and analyze their gigs.

## Features

- **Gig Title Extraction**: Automatically extracts gig titles from your Fiverr seller dashboard
- **Active Tab Filtering**: Only collects gigs from the currently active tab (Active, Draft, Denied, etc.)
- **Export Functionality**: Export gig data to CSV format
- **Copy to Clipboard**: Copy gig titles for easy use elsewhere
- **Smart Filtering**: Filters out unnecessary UI elements and duplicate entries

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your Chrome toolbar

## Usage

1. **Sign in to Fiverr**: Make sure you're logged into your Fiverr seller account
2. **Open Extension**: Click the extension icon in your Chrome toolbar
3. **Scan Gigs**: Click "Scan & Load Gigs" to extract gig titles from your current tab
4. **Export Data**: Use "Export CSV" to download your gig data or "Copy" to copy titles to clipboard

## File Structure

```
AutoFiverr-FYP/
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality and UI logic
├── content.js             # Content script for scraping Fiverr pages
├── background.js          # Background service worker
├── icons/                 # Extension icons (16px, 48px, 128px)
└── README.md              # This file
```

## Permissions

- `tabs`: To interact with Fiverr tabs
- `scripting`: To inject content scripts
- `activeTab`: To access the current tab
- `storage`: For potential future data persistence
- `host_permissions`: Access to fiverr.com domain

## Development

This extension is built for Chrome Manifest V3 and uses:
- Vanilla JavaScript (no frameworks)
- Chrome Extension APIs
- Content Script injection
- Background service worker

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is part of a Final Year Project (FYP) for academic purposes.
