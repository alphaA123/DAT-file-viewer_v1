const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const provider = new DatCustomEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('datViewer.tabularView', provider)
    );
}

class DatCustomEditorProvider {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     * @param {vscode.CancellationToken} token
     */
    async resolveCustomTextEditor(document, webviewPanel, token) {
        // Allow scripts so we can add interactivity later if needed
        webviewPanel.webview.options = { enableScripts: true };
        
        // Function to update the webview content
        const updateWebview = () => {
            const text = document.getText();
            webviewPanel.webview.html = this.getHtmlForWebview(text);
        };

        // Initial render
        updateWebview();

        // Re-render the table if the underlying .dat file changes on disk
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // Clean up the event listener when the editor tab is closed
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    /**
     * @param {string} text
     */
    getHtmlForWebview(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) return `<html><body><h3>File is empty</h3></body></html>`;

        // 1. Auto-Detect Delimiter
        const delimiters = ['\x01', '|', ',', '\t'];
        let detectedDelimiter = '\x01';
        let maxCount = -1;
        delimiters.forEach(d => {
            const count = lines[0].split(d).length - 1;
            if (count > maxCount && count > 0) { maxCount = count; detectedDelimiter = d; }
        });

        // 2. Separate Headers and Rows
        const parsedData = lines.map(line => line.split(detectedDelimiter));
        const headers = parsedData[0]; // First row as columns
        const rows = parsedData.slice(1); // The rest as data records

        // 3. Stringify data safely to pass into the Webview JavaScript layer
        const jsonColumns = JSON.stringify(headers);
        const jsonRows = JSON.stringify(rows);

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <link href="https://cdn.jsdelivr.net/npm/gridjs/dist/theme/mermaid.min.css" rel="stylesheet" />
                <style>
                    body {
                        padding: 15px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        font-family: var(--vscode-editor-font-family, sans-serif);
                    }
                    /* Seamlessly inject VS Code theme variables into Grid.js */
                    .gridjs-wrapper {
                        background-color: var(--vscode-editor-background) !important;
                        border: 1px solid var(--vscode-panel-border) !important;
                        box-shadow: none !important;
                    }
                    .gridjs-th {
                        background-color: var(--vscode-sideBar-background) !important;
                        color: var(--vscode-editor-foreground) !important;
                        border: 1px solid var(--vscode-panel-border) !important;
                    }
                    .gridjs-td {
                        background-color: var(--vscode-editor-background) !important;
                        color: var(--vscode-editor-foreground) !important;
                        border: 1px solid var(--vscode-panel-border) !important;
                    }
                    .gridjs-tr:hover td {
                        background-color: var(--vscode-list-hoverBackground, #37373d) !important;
                        color: var(--vscode-list-hoverForeground, #ffffff) !important;
                    }
                    .gridjs-footer {
                        background-color: var(--vscode-sideBar-background) !important;
                        border: 1px solid var(--vscode-panel-border) !important;
                        color: var(--vscode-editor-foreground) !important;
                    }
                    .gridjs-pagination .gridjs-pages button {
                        background-color: var(--vscode-button-background, #0e639c) !important;
                        color: var(--vscode-button-foreground, #ffffff) !important;
                        border: none !important;
                    }
                    .gridjs-pagination .gridjs-pages button:disabled {
                        background-color: rgba(255, 255, 255, 0.1) !important;
                        color: rgba(255, 255, 255, 0.3) !important;
                    }
                    .gridjs-search-input {
                        background-color: var(--vscode-input-background) !important;
                        color: var(--vscode-input-foreground) !important;
                        border: 1px solid var(--vscode-input-border) !important;
                    }
                </style>
            </head>
            <body>

                <div id="table-container"></div>

                <script src="https://cdn.jsdelivr.net/npm/gridjs/dist/gridjs.umd.js"></script>
                <script>
                    const columnsData = ${jsonColumns};
                    const rowsData = ${jsonRows};

                    new gridjs.Grid({
                        columns: columnsData,
                        data: rowsData,
                        search: true,    // Adds a global regex search bar over your entire batch dataset
                        sort: true,      // Allows clicking any column header to instantly sort ascending/descending
                        resizable: true, // Enables standard dragging to expand or shrink column sizes
                        pagination: {
                            limit: 50    // High-performance pagination boundary to protect the DOM layout
                        }
                    }).render(document.getElementById("table-container"));
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Helper to safely escape characters that could break HTML rendering
     * @param {string} str
     */
    escapeHtml(str) {
        if (!str) return ''; 
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

function deactivate() {}

// Crucial: Exporting the provider along with activate/deactivate lifecycle methods
module.exports = { 
    activate, 
    deactivate, 
    DatCustomEditorProvider 
}