/***********************************************************************
 * app.js
 * Spendora Dashboard - Auth + Firestore realtime + Charts + Exports
 *
 * Uses:
 *  - Firebase (compat)
 *  - Chart.js
 *  - jsPDF + autotable
 *
 * Notes:
 *  - Exports PDF & Word (HTML -> .doc) are implemented.
 *  - Export filters (from, to, category) will be applied.
 *  - Keeps chart instances safe (destroy before recreate).
 **********************************************************************/

/* =======================
   Configuration / Globals
   ======================= */
const STORAGE_RATES_KEY = 'neon_rates_v1';
let currency = localStorage.getItem('neon_currency') || 'INR';
let currentUser = null; // will hold firebase user object
window.currentUser = null; // expose for export filename usage

// Small helpers
function sym(c) {
    return c === 'INR' ? '₹' : (c === 'USD' ? '$' : (c === 'EUR' ? '€' : c));
}

function toFixed(n) { return Number(n).toFixed(2); }

// static currency rates (basic)
let rates = JSON.parse(localStorage.getItem(STORAGE_RATES_KEY) || 'null');
if (!rates) {
    rates = { INR: 1, USD: 0.012, EUR: 0.011 };
    localStorage.setItem(STORAGE_RATES_KEY, JSON.stringify(rates));
}

/* ===========================
   Firebase Initialization
   (ensure config matches your project)
   =========================== */
const firebaseConfig = {
    apiKey: "AIzaSyAXu1FJ0VhjM0XxYIfs7KLDx1Chh1tDBfw",
    authDomain: "expense-tracker-akif-832fb.firebaseapp.com",
    projectId: "expense-tracker-akif-832fb",
    storageBucket: "expense-tracker-akif-832fb.firebasestorage.app",
    messagingSenderId: "846826483222",
    appId: "1:846826483222:web:2fcc5d66100a14c6fc0f37",
    measurementId: "G-ZSM3KCK8RF"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();



/* ===========================
   DOM elements + local state
   =========================== */
const userEmailEl = document.getElementById("userEmail");
const listEl = document.getElementById("list");
const totalEl = document.getElementById("total");
const monthEl = document.getElementById("monthTotal");
const countEl = document.getElementById("count");
const currencySelect = document.getElementById("currency");

currencySelect.value = currency;

let expenses = []; // in-memory list of expenses for current user

// Chart instances (kept global so we can destroy safely)
window.lineChartInstance = null;
window.pieChartInstance = null;
window.barChartInstance = null;

/* ===========================
   Authentication & Realtime
   =========================== */
auth.onAuthStateChanged(async(user) => {
    if (!user) {
        // not logged in -> redirect
        window.location.href = "index.html";
        return;
    }

    currentUser = user;
    window.currentUser = user;
    userEmailEl.textContent = user.email || "";

    // ensure date input default
    const dateEl = document.getElementById("date");
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

    // subscribe to expenses subcollection for this user
    const ref = db.collection("users").doc(user.uid).collection("expenses");
    ref.orderBy("createdAt", "desc").onSnapshot((snap) => {
        expenses = [];
        snap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            // Firestore Timestamp -> leave as-is for export; UI uses .date field
            expenses.push(data);
        });
        renderAll();
    });
});

/* sign out helper */
function signOut() {
    auth.signOut();
    window.location.href = "index.html";
}
window.signOut = signOut;

/* currency setter */
window.setCurrency = (c) => {
    currency = c;
    localStorage.setItem('neon_currency', c);
    renderAll();
};

/* ===========================
   ADD / EDIT / DELETE Expense
   =========================== */
window.addExpense = async() => {
    const title = document.getElementById("title").value.trim();
    const amt = Number(document.getElementById("amount").value);
    const category = document.getElementById("category").value;
    const date = document.getElementById("date").value || new Date().toISOString().slice(0, 10);

    if (!title || !amt || amt <= 0) {
        alert("Enter valid title and amount");
        return;
    }

    // store amounts in INR base (normalize by rates[currency])
    const amountINR = Number((amt / (rates[currency] || 1)).toFixed(2));

    await db.collection("users").doc(currentUser.uid).collection("expenses").add({
        title,
        amount: amountINR,
        category,
        date,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // reset form
    document.getElementById("title").value = "";
    document.getElementById("amount").value = "";
    document.getElementById("category").value = "Food";
    document.getElementById("date").value = new Date().toISOString().slice(0, 10);
};

window.editExpense = async(id) => {
    const item = expenses.find(x => x.id === id);
    if (!item) return;

    const newTitle = prompt("Edit title", item.title);
    if (newTitle === null) return;

    const newAmtRaw = prompt("Edit amount (" + currency + ")", (item.amount * rates[currency]).toFixed(2));
    if (newAmtRaw === null) return;

    const newAmt = Number(newAmtRaw);
    if (isNaN(newAmt) || newAmt <= 0) return;

    const inINR = Number((newAmt / rates[currency]).toFixed(2));

    await db.collection("users").doc(currentUser.uid).collection("expenses").doc(id).update({
        title: newTitle.trim(),
        amount: inINR
    });
};

/* DELETE with modal control (fixes button timing issues) */
let deleteID = null;
(function initDeleteModal() {
    // run after a short timeout to ensure DOM elements exist
    setTimeout(() => {
        const modal = document.getElementById("deleteModal");
        const cancelBtn = document.getElementById("cancelDelete");
        const confirmBtn = document.getElementById("confirmDelete");
        if (!modal || !cancelBtn || !confirmBtn) return;

        cancelBtn.onclick = () => {
            deleteID = null;
            modal.style.display = "none";
        };

        confirmBtn.onclick = async() => {
            if (!deleteID) return;
            await db.collection("users").doc(currentUser.uid).collection("expenses").doc(deleteID).delete();
            deleteID = null;
            modal.style.display = "none";
        };
    }, 300);
})();

window.deleteExpense = (id) => {
    deleteID = id;
    const modal = document.getElementById("deleteModal");
    if (modal) modal.style.display = "flex";
};

/* ===========================
   UI: Render List + Totals + Charts
   =========================== */
function formatUI(val) {
    return sym(currency) + (val * rates[currency]).toLocaleString();
}

function renderAll() {
    // compute totals (base stored in INR)
    const totalINR = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);

    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const monthTotal = expenses.filter(x => (x.date || '').slice(0, 7) === monthKey).reduce((s, x) => s + Number(x.amount || 0), 0);

    totalEl.textContent = formatUI(totalINR);
    monthEl.textContent = formatUI(monthTotal);
    countEl.textContent = expenses.length;

    // list
    listEl.innerHTML = "";
    if (expenses.length === 0) {
        listEl.innerHTML = '<div style="padding:10px;opacity:0.8;">No expenses yet</div>';
    } else {
        expenses.forEach(e => {
            const row = document.createElement("div");
            row.className = "exp-item";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.alignItems = "center";
            row.style.padding = "8px";
            row.style.marginBottom = "8px";
            row.style.borderRadius = "8px";
            row.style.background = "linear-gradient(90deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))";

            row.innerHTML = `
        <div>
          <div style="font-weight:700">${e.title || ''}</div>
          <div style="opacity:0.8;font-size:12px">${e.date || ''} • <span class="cat-badge">${e.category || ''}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <b>${formatUI(e.amount || 0)}</b>
          <button class="icon-btn" onclick="editExpense('${e.id}')">✏️</button>
          <button class="icon-btn" onclick="deleteExpense('${e.id}')">🗑️</button>
        </div>
      `;
            listEl.appendChild(row);
        });
    }

    // charts
    updateCharts();
}

/* Chart helpers: compute datasets */
function computeMonthlyTrend() {
    const labels = [];
    const data = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        labels.push(d.toLocaleString("default", { month: "short", year: "2-digit" }));
        const amount = expenses.filter(x => (x.date || '').slice(0, 7) === key).reduce((s, x) => s + Number(x.amount || 0), 0);
        data.push(amount * rates[currency]);
    }
    return { labels, data };
}

function computeCategoryDistribution() {
    const map = {};
    expenses.forEach(e => {
        map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    const labels = Object.keys(map);
    const data = labels.map(l => map[l] * rates[currency]);
    return { labels, data };
}

/* updateCharts: destroys previous instances before creating new ones */
function updateCharts() {
    const trend = computeMonthlyTrend();
    const cat = computeCategoryDistribution();

    // LINE
    const ctxL = document.getElementById("lineChart").getContext("2d");
    if (window.lineChartInstance) window.lineChartInstance.destroy();
    window.lineChartInstance = new Chart(ctxL, {
        type: "line",
        data: {
            labels: trend.labels,
            datasets: [{
                data: trend.data,
                borderColor: "#00f0ff",
                backgroundColor: "rgba(0,240,255,0.08)",
                tension: 0.25,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 80 } },
            scales: { y: { ticks: { maxTicksLimit: 3 }, suggestedMax: Math.max(...trend.data) * 1.2 } },
            plugins: { legend: { display: false } }
        }
    });

    // PIE
    const ctxP = document.getElementById("pieChart").getContext("2d");
    if (window.pieChartInstance) window.pieChartInstance.destroy();
    window.pieChartInstance = new Chart(ctxP, {
        type: "pie",
        data: {
            labels: cat.labels,
            datasets: [{ data: cat.data, backgroundColor: ["#00f0ff", "#ff2ec4", "#7c4dff", "#ffd166", "#7efc6e", "#ff8b5c"] }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 40 } },
            plugins: { legend: { position: "bottom", labels: { padding: 12 } } },
            radius: "72%"
        }
    });

    // BAR
    const ctxB = document.getElementById("barChart").getContext("2d");
    if (window.barChartInstance) window.barChartInstance.destroy();
    window.barChartInstance = new Chart(ctxB, {
        type: "bar",
        data: {
            labels: cat.labels,
            datasets: [{
                data: cat.data,
                backgroundColor: ["#00f0ff", "#ff2ec4", "#7c4dff", "#ffd166", "#7efc6e", "#ff8b5c"],
                borderColor: "#ffffff22",
                borderWidth: 1,
                barThickness: 22,
                maxBarThickness: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 80 } },
            scales: { y: { suggestedMax: Math.max(...cat.data) * 1.05, ticks: { maxTicksLimit: 4 }, grace: "5%" }, x: { ticks: { maxRotation: 0 } } },
            plugins: { legend: { display: false } }
        }
    });
}
/* ============================================================
   EXPORT / IMPORT – SAFE VERSION (No Optional Chaining)
   ============================================================ */

/* ---------- 1. Helpers ---------- */
function fmtDateForFile(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}

function getExportFilters() {
    return {
        from: document.getElementById("exportFrom").value || null,
        to: document.getElementById("exportTo").value || null,
        category: document.getElementById("exportCategory").value || ""
    };
}

/* IMPORTANT: use the real `expenses` array (NOT window.expenses) */
function filteredExpensesList(filters) {
    const list = (expenses || []).slice(); // <--- changed

    return list.filter(e => {
        if (!e) return false;

        // category match
        if (filters.category && e.category !== filters.category) return false;

        // date filters (assuming e.date is "YYYY-MM-DD")
        if (filters.from && e.date < filters.from) return false;
        if (filters.to && e.date > filters.to) return false;

        return true;
    });
}

function computeSummaries(list) {
    const byCategory = {};
    let fullTotalINR = 0;

    list.forEach(it => {
        const amt = Number(it.amount || 0);
        fullTotalINR += amt;
        byCategory[it.category] = (byCategory[it.category] || 0) + amt;
    });

    return { byCategory, fullTotalINR };
}
/* ============================================================
   2. PDF EXPORT – HEADER + FOOTER + CLEAN TEXT (NO OPTIONAL CHAINING)
   ============================================================ */

async function exportToPDF() {
    const filters = getExportFilters();
    const list = filteredExpensesList(filters);

    const uid = (window.currentUser && window.currentUser.uid) || "anon";
    const filename = "spendora-" + uid + "-" + fmtDateForFile(new Date()) + ".pdf";

    const jsPDFClass = window.jspdf.jsPDF;
    const doc = new jsPDFClass({ unit: "pt", format: "a4" });

    doc.setFont("courier", "normal");

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let startY = 90;

    /* ---------------- HEADER ---------------- */
    function drawHeader() {
        doc.setFontSize(16);
        doc.text("📘 Spendora — Expense Report", margin, 40);

        doc.setFontSize(9);
        doc.text("Generated: " + new Date().toLocaleString(), margin, 55);

        var filterText =
            "Filters → Category: " + (filters.category || "All") +
            ", Date: " + (filters.from || "Any") +
            " → " + (filters.to || "Any");

        doc.text(filterText, margin, 68);

        doc.setLineWidth(0.4);
        doc.line(margin, 75, pageWidth - margin, 75);
    }

    /* ---------------- FOOTER ---------------- */
    function drawFooter() {
        var pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(9);

        for (var i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            var pageHeight = doc.internal.pageSize.getHeight();

            doc.setLineWidth(0.2);
            doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);

            doc.text(
                "Generated by Spendora | Page " + i + " of " + pageCount,
                margin,
                pageHeight - 25
            );
        }
    }

    drawHeader();

    /* ---------------- TABLE BODY ---------------- */
    var body = list.map(function(it) {
        var createdAt = "";
        if (it.createdAt && it.createdAt.toDate) {
            createdAt = it.createdAt.toDate().toISOString().replace("T", " ").slice(0, 19);
        }

        return [
            it.title || "",
            it.category || "",
            String((Number(it.amount) * (rates[currency] || 1)).toFixed(2)),
            it.date || "",
            createdAt,
            it.id || "",
            it.note ? "Yes" : "No"
        ];
    });

    if (body.length === 0) {
        doc.text("No data found for selected filters.", margin, startY);
    } else {
        doc.autoTable({
            startY: startY,
            head: [
                ["Title", "Category", "Amount (Rs)", "Date", "CreatedAt", "ID", "Note"]
            ],
            body: body,
            theme: "striped",
            margin: { left: margin, right: margin },
            headStyles: { fillColor: [25, 25, 30] },

            didDrawPage: function() {
                drawHeader();
            }
        });
    }

    /* ---------------- SUMMARY ---------------- */
    var finalY = startY + 30;

    if (doc.lastAutoTable && doc.lastAutoTable.finalY) {
        finalY = doc.lastAutoTable.finalY + 25;
    }

    var summaryData = computeSummaries(list);
    var byCategory = summaryData.byCategory;
    var fullTotalINR = summaryData.fullTotalINR;

    doc.setFontSize(13);
    doc.text("Summary", margin, finalY);
    finalY += 18;

    doc.setFontSize(10);
    doc.text("Total: Rs " + (fullTotalINR * (rates[currency] || 1)).toLocaleString(), margin, finalY);
    finalY += 18;

    doc.text("Breakdown by Category:", margin, finalY);

    for (var cat in byCategory) {
        finalY += 15;
        doc.text(
            cat + ": Rs " + (byCategory[cat] * (rates[currency] || 1)).toLocaleString(),
            margin + 12,
            finalY
        );
    }

    drawFooter();
    doc.save(filename);
}

window.exportToPDF = exportToPDF;

/* ============================================================
   3. WORD EXPORT (.doc)
   ============================================================ */
function exportToWord() {
    const filters = getExportFilters();
    const list = filteredExpensesList(filters);

    const uid = (currentUser && currentUser.uid) || "anon";
    const filename = `spendora-${uid}-${fmtDateForFile(new Date())}.doc`;

    let html = `
    <html><head><meta charset="utf-8">
    <style>
        body { font-family: Arial; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 6px; }
        th { background: #222; color: white; }
    </style>
    </head><body>
    <h2>Spendora Expense Report</h2>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <p>Filters: ${filters.category || "All"}, ${filters.from || "Any"} → ${filters.to || "Any"}</p>
    <table>
        <thead>
            <tr>
                <th>Title</th><th>Category</th><th>Amount (${sym(currency)})</th>
                <th>Date</th><th>CreatedAt</th><th>ID</th><th>Note</th>
            </tr>
        </thead>
        <tbody>`;

    list.forEach(it => {
        let createdAt = "";
        if (it.createdAt && it.createdAt.toDate) {
            createdAt = it.createdAt.toDate().toISOString().replace("T", " ").slice(0, 19);
        }

        html += `
        <tr>
            <td>${it.title || ""}</td>
            <td>${it.category || ""}</td>
            <td>${(Number(it.amount) * (rates[currency] || 1)).toFixed(2)}</td>
            <td>${it.date || ""}</td>
            <td>${createdAt}</td>
            <td>${it.id || ""}</td>
            <td>${it.note ? "Yes" : "No"}</td>
        </tr>`;
    });

    html += `</tbody></table></body></html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

window.exportToWord = exportToWord;

/* ============================================================
   4. JSON Import/Export
   ============================================================ */
window.exportUserData = () => {
    // Use the real `expenses` array
    const payload = { exportedAt: new Date().toISOString(), expenses: expenses };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (currentUser && currentUser.email ? currentUser.email : "export") + "-expenses.json";
    a.click();
};

window.importUserData = async ev => {
    const file = ev.target.files[0];
    if (!file) return;

    const json = JSON.parse(await file.text());
    const list = json.expenses || json;

    const col = db.collection("users").doc(currentUser.uid).collection("expenses");

    for (const it of list) {
        await col.add({
            title: it.title || "Imported",
            amount: Number(it.amount) || 0,
            category: it.category || "Other",
            date: it.date || new Date().toISOString().slice(0, 10),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    ev.target.value = "";
};

/* ============================================================
   5. Connect Buttons
   ============================================================ */
firebase.auth().onAuthStateChanged(() => {
    const btnPDF = document.getElementById("btnExportPDF");
    const btnWord = document.getElementById("btnExportWord");

    if (btnPDF) btnPDF.onclick = exportToPDF;
    if (btnWord) btnWord.onclick = exportToWord;
});


/* ===========================
   Toast (small helper) - optional
   =========================== */
window.showToast = function(msg, type = "normal") {
    const boxId = "toastBox";
    let box = document.getElementById(boxId);
    if (!box) {
        box = document.createElement('div');
        box.id = boxId;
        box.style.position = "fixed";
        box.style.right = "18px";
        box.style.bottom = "18px";
        box.style.zIndex = 9999;
        document.body.appendChild(box);
    }
    const div = document.createElement("div");
    div.className = "toast" + (type === "error" ? " error" : "");
    div.style.background = "rgba(0,0,0,0.75)";
    div.style.color = "#eaf7ff";
    div.style.padding = "10px 14px";
    div.style.borderLeft = `4px solid ${type === "error" ? '#ff4e4e' : '#00f0ff'}`;
    div.style.borderRadius = "8px";
    div.style.marginTop = "8px";
    div.innerText = msg;
    box.appendChild(div);
    setTimeout(() => div.remove(), 3200);
};
/* =====================================
   TOTAL EXPENDITURE CHART (Daily/Monthly/Yearly)
===================================== */

// Chart instance
let totalTrendChartInstance = null;

// Build datasets
function buildTotalData(mode) {
    const map = {};

    expenses.forEach(e => {
        let key = "unknown";

        if (mode === "daily") {
            key = e.date; // YYYY-MM-DD
        } else if (mode === "monthly") {
            key = e.date.slice(0, 7); // YYYY-MM
        } else if (mode === "yearly") {
            key = e.date.slice(0, 4); // YYYY
        }

        const amt = Number(e.amount || 0) * rates[currency];
        map[key] = (map[key] || 0) + amt;
    });

    // Sorted keys
    const labels = Object.keys(map).sort();
    const data = labels.map(l => map[l]);

    return { labels, data };
}

// Render Total Chart
function renderTotalChart(mode = "daily") {
    const ctx = document.getElementById("totalTrendChart").getContext("2d");

    const { labels, data } = buildTotalData(mode);

    if (totalTrendChartInstance) totalTrendChartInstance.destroy();

    totalTrendChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: [
                    "#00f0ff",
                    "#ff2ec4",
                    "#7c4dff",
                    "#ffd166",
                    "#7efc6e",
                    "#ff8b5c"
                ],
                borderColor: "#ffffff22",
                borderWidth: 1,
                borderRadius: 6, // smooth bar edges
                barThickness: 28, // bar width
                maxBarThickness: 32
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            scales: {
                y: {
                    ticks: { maxTicksLimit: 3, padding: 4 },
                    grid: { color: "rgba(255,255,255,0.07)" }
                },
                x: {
                    ticks: { maxRotation: 0, padding: 6 },
                    grid: { display: false }
                }
            },

            plugins: {
                legend: { display: false }
            },

            layout: {
                padding: { top: 10, bottom: 5 }
            }
        }
    });
}


// Button events
document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {

        // remove active from all
        document.querySelectorAll(".toggle-btn")
            .forEach(b => b.classList.remove("active"));

        // add active to clicked
        btn.classList.add("active");

        const mode = btn.getAttribute("data-mode");
        renderTotalChart(mode);
    });
});

// Auto-load Daily on page load
setTimeout(() => renderTotalChart("daily"), 1000);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js")
        .then(() => console.log("Service Worker Registered"))
        .catch(err => console.log("SW registration failed", err));
}

let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById("installBtn").style.display = "block";
});

document.getElementById("installBtn").addEventListener("click", async() => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
            console.log("App Installed!");
        }
        deferredPrompt = null;
        document.getElementById("installBtn").style.display = "none";
    }
});