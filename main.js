import { fetchSuggestions, parseInput } from './api/suggestions.js';
import {
    renderSuggestions,
    setSelected,
    updateUI,
    adjustWindowSize,
    resetSearch,
    getSuggestionsState
} from './ui/dom.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const searchInput = document.getElementById("searchInput");
const resultsList = document.getElementById("resultsList");
const iconEl = document.querySelector(".search-icon");

let debounceTimer = null;

/**
 * Executes an action by opening a URL in the browser and hiding the application window.
 * @param {string} url - The URL to open.
 */
async function executeAction(url) {
    try {
        await invoke("open_browser", { url });
        resetSearch(searchInput, resultsList, iconEl);
        await invoke("hide_window");
    } catch (err) {
        console.error("Failed to open:", err);
    }
}

// Handler for suggestions rendering to maintain logic separation
const handleRenderSuggestions = (items) => renderSuggestions(items, resultsList, executeAction);

// --- Keyboard Handlers ---
searchInput.addEventListener("keydown", (e) => {
    const { suggestions, selectedIndex } = getSuggestionsState();
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
                setSelected(Math.min(selectedIndex + 1, itemCount - 1), resultsList);
            }
            break;

        case "ArrowUp":
            e.preventDefault();
            if (itemCount > 0) {
                setSelected(Math.max(selectedIndex - 1, 0), resultsList);
            }
            break;

        case "Escape":
            e.preventDefault();
            invoke("hide_window");
            break;

        case "Tab":
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                searchInput.value = suggestions[selectedIndex].title;
                fetchSuggestions(searchInput.value, handleRenderSuggestions);
            }
            break;
    }
});

document.addEventListener('mousedown', (e) => {
    const target = e.target;
    const isInteractive = target.closest('input, textarea, button, a, .result-item');

    if (!isInteractive && e.button === 0) {
        window.__TAURI__.window.Window.getCurrent().startDragging().catch(console.error);
    }
});

/** Input handler with debounce */
searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = searchInput.value.trim();

    const parsed = parseInput(value);
    updateUI(parsed, iconEl);

    if (!value) {
        handleRenderSuggestions([]);
        return;
    }

    debounceTimer = setTimeout(() => {
        fetchSuggestions(value, handleRenderSuggestions);
    }, 150);
});

/** Listen for focus event from Rust backend */
listen("focus-input", () => {
    searchInput.focus();
    searchInput.select();
    if (!searchInput.value) {
        adjustWindowSize(false);
    }
});

/** Initial setup */
searchInput.focus();
adjustWindowSize(false);