import { SEARCH_ENGINES, URLS } from './constants/search.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { Window } = window.__TAURI__.window;

const appWindow = Window.getCurrent();

const DEFAULT_ENGINE = URLS.GOOGLE;

const searchInput = document.getElementById("searchInput");
const resultsList = document.getElementById("resultsList");

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
    updateUI("");
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