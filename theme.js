/* ==========================================
   GLOBAL THEME HANDLER (HTML attribute version)
=========================================== */

// Available themes
const THEMES = ["light", "neon", "dark"];

// Apply theme
function applyTheme(mode) {
    if (!THEMES.includes(mode)) mode = "neon";

    // 🔥 Apply theme to <html> (NOT body)
    document.documentElement.setAttribute("data-theme", mode);

    // Save theme
    localStorage.setItem("theme", mode);
}

/* ==========================================
   LOAD THEME ON PAGE START
=========================================== */
document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("theme") || "neon";

    // Apply saved theme
    applyTheme(saved);

    // Attach click events
    document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            applyTheme(btn.dataset.theme);
        });
    });
});