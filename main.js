const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { Window } = window.__TAURI__.window;

const appWindow = Window.getCurrent();

const SEARCH_ENGINES = {
    g: {
        name: "Google", url: "https://www.google.com/search?q=", homepage: "https://www.google.com",
        icon: `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`
    },
    y: {
        name: "YouTube", url: "https://www.youtube.com/results?search_query=", homepage: "https://www.youtube.com",
        icon: `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/><path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
    },
    gh: { name: "GitHub", url: "https://github.com/search?q=", homepage: "https://github.com", icon: `<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>` },
};

const DEFAULT_ENGINE = "https://www.google.com/search?q=";

const searchInput = document.getElementById("searchInput");
const resultsList = document.getElementById("resultsList");
const resultsContainer = document.getElementById("resultsContainer");
const container = document.querySelector(".spotlight-container");

let selectedIndex = -1;
let suggestions = [];
let debounceTimer = null;

// Need to account for the search bar height (~60px) + content
const SEARCH_BAR_HEIGHT = 68; // Height with padding/border + safety buffer
const MAX_WINDOW_HEIGHT = 500;

/**
 * Logs a message to the terminal via the Tauri backend.
 * @param {any} msg - The message to log.
 */
function log(msg) {
    invoke("log_to_terminal", { message: String(msg) }).catch(console.error);
}

/**
 * Adjusts the application window size based on whether suggestions are being displayed.
 * @param {boolean} hasSuggestions - True if suggestions are visible, false otherwise.
 */
async function adjustWindowSize(hasSuggestions) {
    // If no suggestions, we only show the search bar
    if (!hasSuggestions) {
        await appWindow.setSize(new window.__TAURI__.dpi.PhysicalSize(680, SEARCH_BAR_HEIGHT));
    } else {
        // Calculate height based on content
        // Item height: ~31px text + 20px padding = ~51px. Using 54px for safety.
        const LIST_ITEM_HEIGHT = 55;
        const suggestionCount = suggestions.length;

        // Add padding for the list container (12px total vert padding)
        const LIST_PADDING = 12;

        let totalHeight = SEARCH_BAR_HEIGHT + LIST_PADDING + (suggestionCount * LIST_ITEM_HEIGHT);

        // Cap at MAX_WINDOW_HEIGHT
        // We ensure MAX_WINDOW_HEIGHT is large enough for 6 items (approx 400px)
        totalHeight = Math.min(totalHeight, MAX_WINDOW_HEIGHT);

        await appWindow.setSize(new window.__TAURI__.dpi.PhysicalSize(680, totalHeight));
    }
}

/**
 * Checks if the given input string resembles a URL.
 * @param {string} input - The string to check.
 * @returns {boolean} True if it looks like a URL, false otherwise.
 */
function isLikelyURL(input) {
    if (input.includes(".") && !input.includes(" ")) return true;
    if (input.startsWith("http://") || input.startsWith("https://")) return true;
    return false;
}

/**
 * Parses user input to determine the type of action (URL, Bang, or Search).
 * @param {string} input - The raw user input.
 * @returns {Object|null} An object containing the action type and details, or null if input is empty.
 */
function parseInput(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (isLikelyURL(trimmed)) {
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        return { type: "url", url, display: trimmed };
    }

    const match = trimmed.match(/^([a-z]+)(\s+(.*))?$/i);
    if (match) {
        const prefix = match[1].toLowerCase();
        const query = match[3] ? match[3].trim() : "";

        if (SEARCH_ENGINES[prefix]) {
            const engine = SEARCH_ENGINES[prefix];
            if (query) {
                return {
                    type: "bang",
                    url: engine.url + encodeURIComponent(query),
                    engine: engine.name,
                    icon: engine.icon,
                    query,
                    display: `${engine.name}: ${query}`,
                };
            } else {
                return {
                    type: "bang",
                    url: engine.homepage,
                    engine: engine.name,
                    icon: engine.icon,
                    query: "",
                    display: `Open ${engine.name}`,
                };
            }
        }
    }

    return {
        type: "search",
        url: DEFAULT_ENGINE + encodeURIComponent(trimmed),
        icon: SEARCH_ENGINES.g.icon,
        display: `Search Google for "${trimmed}"`,
    };
}

/**
 * Executes an action by opening a URL in the browser and hiding the application window.
 * @param {string} url - The URL to open.
 */
async function executeAction(url) {
    try {
        await invoke("open_browser", { url });
        resetSearch();
        await invoke("hide_window");
    } catch (err) {
        console.error("Failed to open:", err);
    }
}

function resetSearch() {
    searchInput.value = "";
    resultsList.innerHTML = "";
    suggestions = [];
    selectedIndex = -1;
    adjustWindowSize(false);
}

/**
 * Renders the provided suggestion items into the results list.
 * @param {Array} items - The list of suggestion objects to render.
 */
function renderSuggestions(items) {
    suggestions = items;
    selectedIndex = -1;
    resultsList.innerHTML = "";

    if (items.length === 0) {
        adjustWindowSize(false);
        return;
    }

    items.forEach((item, index) => {
        const el = document.createElement("div");
        el.className = "result-item";
        el.innerHTML = `
      <div class="result-item-icon">${item.icon || "🔍"}</div>
      <div class="result-item-text">
        <div class="result-item-title">${escapeHtml(item.title)}</div>
        <div class="result-item-subtitle">${escapeHtml(item.subtitle || "")}</div>
      </div>
      <div class="result-item-action">↵</div>
    `;
        el.addEventListener("click", () => {
            executeAction(item.url);
        });
        el.addEventListener("mouseenter", () => {
            setSelected(index);
        });
        resultsList.appendChild(el);
    });

    setSelected(0);
    adjustWindowSize(true);
}

/**
 * Sets the selected state for a suggestion item at the specified index.
 * @param {number} index - The index of the item to select.
 */
function setSelected(index) {
    const items = resultsList.querySelectorAll(".result-item");
    items.forEach((el, i) => {
        el.classList.toggle("selected", i === index);
    });
    selectedIndex = index;

    if (items[index]) {
        items[index].scrollIntoView({ block: "nearest" });
    }
}

/**
 * Fetches search suggestions from Google and updates the UI.
 * @param {string} query - The search query string.
 */
async function fetchSuggestions(query) {
    const parsed_query = parseInput(query);
    const default_suggestions = [
        {
            title: query,
            subtitle: parsed_query.display,
            icon: parsed_query.icon,
            url: parsed_query.url,
        },
    ];

    if (!query || query.length < 2) {
        renderSuggestions([]);
        return;
    }

    const spaceIdx = query.indexOf(" ");
    if (spaceIdx > 0) {
        const prefix = query.substring(0, spaceIdx).toLowerCase();
        if (SEARCH_ENGINES[prefix]) {
            const engine = SEARCH_ENGINES[prefix];
            const bangQuery = query.substring(spaceIdx + 1).trim();
            if (bangQuery) {
                renderSuggestions([
                    {
                        title: bangQuery,
                        subtitle: `Search ${engine.name}`,
                        icon: engine.icon,
                        url: engine.url + encodeURIComponent(bangQuery),
                    },
                ]);
            }
            return;
        }
    }

    if (isLikelyURL(query)) {
        const url = query.startsWith("http") ? query : `https://${query}`;
        renderSuggestions([
            {
                title: query,
                subtitle: "Open website",
                icon: "🌐",
                url,
            },
        ]);
        return;
    }

    try {
        const data = await invoke("get_suggestions", { query });
        const terms = data[1];

        const items = terms.slice(0, 6).map((term) => ({
            title: term,
            subtitle: "Search Google",
            icon: SEARCH_ENGINES.g.icon,
            url: DEFAULT_ENGINE + encodeURIComponent(term),
        }));

        renderSuggestions([...default_suggestions, ...items]);
    } catch (err) {
        renderSuggestions(default_suggestions);
    }
}

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// --- Keyboard Handlers ---
searchInput.addEventListener("keydown", (e) => {
    const itemCount = suggestions.length;

    switch (e.key) {
        case "Enter":
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < itemCount) {
                executeAction(suggestions[selectedIndex].url);
            } else {
                const parsed = parseInput(searchInput.value);
                if (parsed) executeAction(parsed.url);
            }
            break;

        case "ArrowDown":
            e.preventDefault();
            if (itemCount > 0) {
                setSelected(Math.min(selectedIndex + 1, itemCount - 1));
            }
            break;

        case "ArrowUp":
            e.preventDefault();
            if (itemCount > 0) {
                setSelected(Math.max(selectedIndex - 1, 0));
            }
            break;

        case "Escape":
            e.preventDefault();
            // Don't reset search, just hide
            invoke("hide_window");
            break;

        case "Tab":
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                searchInput.value = suggestions[selectedIndex].title;
                fetchSuggestions(searchInput.value);
            }
            break;
    }
});

document.addEventListener('mousedown', (e) => {
    // Check if the target is interactive (or inside an interactive element)
    const target = e.target;
    const isInteractive = target.closest('input, textarea, button, a, .result-item');

    // If not interactive, start dragging
    // Also ignore right clicks (button 2)
    if (!isInteractive && e.button === 0) {
        appWindow.startDragging().catch(console.error);
    }
});

/**
 * Updates the search icon UI based on the type of input detected.
 * @param {string} value - The current search input value.
 */
function updateUI(value) {
    const parsed = parseInput(value);
    const iconEl = document.querySelector(".search-icon");

    if (parsed && parsed.type === "bang") {
        iconEl.innerHTML = parsed.icon;
    } else if (parsed && parsed.type === "url") {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    } else {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    }
}

/** Input handler with debounce */
searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = searchInput.value.trim();

    updateUI(value);

    if (!value) {
        renderSuggestions([]);
        return;
    }

    debounceTimer = setTimeout(() => {
        fetchSuggestions(value);
    }, 150);
});

/** Listen for focus event from Rust backend */
listen("focus-input", () => {
    searchInput.focus();
    searchInput.select();
    // Ensure window is minimal size on open if empty
    if (!searchInput.value) {
        adjustWindowSize(false);
    }
});

/** Initial focus */
searchInput.focus();
/** Set initial size */
adjustWindowSize(false);