/* ============================================
   GLOBAL THEME HANDLER FOR ALL PAGES
============================================ */

const THEMES = ["light", "neon", "dark"];

function applyTheme(mode) {
    if (!THEMES.includes(mode)) mode = "neon";

    // APPLY CORRECTLY (HTML ATTRIBUTE)
    document.documentElement.setAttribute("data-theme", mode);

    // Save
    localStorage.setItem("theme", mode);
}

/* ============================================
   LOAD SAVED THEME
============================================ */
document.addEventListener("DOMContentLoaded", () => {

    const saved = localStorage.getItem("theme") || "neon";
    applyTheme(saved);

    // Attach theme buttons
    document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            applyTheme(btn.dataset.theme);
        });
    });
});