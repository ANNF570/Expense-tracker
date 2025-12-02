/* ============================================
   GLOBAL THEME HANDLER (Works for all pages)
============================================ */

const THEMES = ["light", "neon", "dark"];

function applyTheme(mode) {
    if (!THEMES.includes(mode)) mode = "neon";

    // Apply theme to <html> NOT <body>
    document.documentElement.setAttribute("data-theme", mode);

    // Save
    localStorage.setItem("theme", mode);
}

document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("theme") || "neon";
    applyTheme(saved);

    document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
        btn.onclick = () => applyTheme(btn.dataset.theme);
    });
});