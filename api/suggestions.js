import { SEARCH_ENGINES, URLS } from '../constants/search.js';

const { invoke } = window.__TAURI__.core;

const DEFAULT_ENGINE = URLS.GOOGLE;

/**
 * Checks if the given input string resembles a URL.
 * @param {string} input - The string to check.
 * @returns {boolean} True if it looks like a URL, false otherwise.
 */
export function isLikelyURL(input) {
    if (input.includes(".") && !input.includes(" ")) return true;
    if (input.startsWith("http://") || input.startsWith("https://")) return true;
    return false;
}

/**
 * Parses user input to determine the type of action (URL, Bang, or Search).
 * @param {string} input - The raw user input.
 * @returns {Object|null} An object containing the action type and details, or null if input is empty.
 */
export function parseInput(input) {
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
 * Fetches search suggestions from Google and updates the UI.
 * @param {string} query - The search query string.
 * @param {Function} renderSuggestions - Callback to render suggestions in UI.
 */
export async function fetchSuggestions(query, renderSuggestions) {
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
