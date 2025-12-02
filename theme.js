/* ============================================
   GLOBAL THEME HANDLER FOR ALL PAGES
============================================ */

// Available themes
const THEMES = ["light", "neon", "dark"];

// Apply theme function
function applyTheme(mode) {
    if (!THEMES.includes(mode)) mode = "neon";

    // Remove old classes and add new
    document.body.classList.remove("light", "dark", "neon");
    document.body.classList.add(mode);

    // Save
    localStorage.setItem("theme", mode);

    // Move slider thumb
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
        toggle.classList.remove("pos-light", "pos-neon", "pos-dark");
        toggle.classList.add(`pos-${mode}`);
    }
}

/* ============================================
   LOAD THEME WHEN PAGE OPENS
============================================ */
document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("theme") || "neon";
    applyTheme(saved);

    // Attach button listeners
    document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
        btn.onclick = () => applyTheme(btn.dataset.theme);
    });
});