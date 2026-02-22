const { invoke } = window.__TAURI__.core;
const { Window } = window.__TAURI__.window;

const appWindow = Window.getCurrent();

const SEARCH_BAR_HEIGHT = 68;
const MAX_WINDOW_HEIGHT = 500;

let selectedIndex = -1;
let suggestions = [];

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
export function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Adjusts the application window size based on whether suggestions are being displayed.
 * @param {boolean} hasSuggestions - True if suggestions are visible, false otherwise.
 */
export async function adjustWindowSize(hasSuggestions) {
    if (!hasSuggestions) {
        await appWindow.setSize(new window.__TAURI__.dpi.PhysicalSize(680, SEARCH_BAR_HEIGHT));
    } else {
        const LIST_ITEM_HEIGHT = 55;
        const suggestionCount = suggestions.length;
        const LIST_PADDING = 12;
        let totalHeight = SEARCH_BAR_HEIGHT + LIST_PADDING + (suggestionCount * LIST_ITEM_HEIGHT);
        totalHeight = Math.min(totalHeight, MAX_WINDOW_HEIGHT);
        await appWindow.setSize(new window.__TAURI__.dpi.PhysicalSize(680, totalHeight));
    }
}

/**
 * Sets the selected state for a suggestion item at the specified index.
 * @param {number} index - The index of the item to select.
 * @param {HTMLElement} resultsList - The container of result items.
 */
export function setSelected(index, resultsList) {
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
 * Renders the provided suggestion items into the results list.
 * @param {Array} items - The list of suggestion objects to render.
 * @param {HTMLElement} resultsList - The container to render items into.
 * @param {Function} executeAction - Callback to execute an action.
 */
export function renderSuggestions(items, resultsList, executeAction) {
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
            setSelected(index, resultsList);
        });
        resultsList.appendChild(el);
    });

    setSelected(0, resultsList);
    adjustWindowSize(true);
}

/**
 * Updates the search icon UI based on the type of input detected.
 * @param {Object} parsed - The parsed input object.
 * @param {HTMLElement} iconEl - The search icon element.
 */
export function updateUI(parsed, iconEl) {
    if (parsed && parsed.type === "bang") {
        iconEl.innerHTML = parsed.icon;
    } else if (parsed && parsed.type === "url") {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    } else {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    }
}

/**
 * Resets the search state and UI.
 * @param {HTMLInputElement} searchInput - The search input element.
 * @param {HTMLElement} resultsList - The results list element.
 * @param {HTMLElement} iconEl - The search icon element.
 */
export function resetSearch(searchInput, resultsList, iconEl) {
    searchInput.value = "";
    resultsList.innerHTML = "";
    suggestions = [];
    selectedIndex = -1;
    updateUI(null, iconEl);
    adjustWindowSize(false);
}

/**
 * Logic to get current suggestions and index (read-only for main.js)
 */
export function getSuggestionsState() {
    return { suggestions, selectedIndex };
}
