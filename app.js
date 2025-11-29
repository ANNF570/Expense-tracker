/*************************************************
 * app.js - Auth + Firestore realtime + Charts
 *************************************************/

/* ======= Utilities ======= */
const STORAGE_RATES_KEY = 'neon_rates_v1';
let currency = localStorage.getItem('neon_currency') || 'INR';

function sym(c) {
    return c === 'INR' ? '₹' : (c === 'USD' ? '$' : (c === 'EUR' ? '€' : c));
}

function toFixed(n) { return Number(n).toFixed(2); }

/* ======= Static currency rates ======= */
let rates = JSON.parse(localStorage.getItem(STORAGE_RATES_KEY) || 'null');
if (!rates) {
    rates = { INR: 1, USD: 0.012, EUR: 0.011 };
    localStorage.setItem(STORAGE_RATES_KEY, JSON.stringify(rates));
}

/* ======================================================
   AUTH LOGIC (index.html)
====================================================== */
if (document.getElementById("su-email")) {

    window.showSignup = () => {
        document.getElementById("loginView").style.display = "none";
        document.getElementById("signupView").style.display = "block";
    };

    window.showLogin = () => {
        document.getElementById("signupView").style.display = "none";
        document.getElementById("loginView").style.display = "block";
    };

    window.doSignup = async() => {
        const email = document.getElementById("su-email").value.trim();
        const pass = document.getElementById("su-pass").value.trim();

        if (!email || pass.length < 6) {
            alert("Enter email and password (min 6 chars)");
            return;
        }

        try {
            const res = await firebase.auth().createUserWithEmailAndPassword(email, pass);
            await firebase.firestore().collection("users").doc(res.user.uid).set({
                email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert("Signup successful!");
            window.location.href = "dashboard.html";

        } catch (err) {
            alert(err.message);
        }
    };

    window.doLogin = async() => {
        const email = document.getElementById("log-email").value.trim();
        const pass = document.getElementById("log-pass").value.trim();

        try {
            await firebase.auth().signInWithEmailAndPassword(email, pass);
            window.location.href = "dashboard.html";
        } catch (err) {
            alert(err.message);
        }
    };
}

/* ======================================================
   DASHBOARD LOGIC (dashboard.html)
====================================================== */
if (window.location.pathname.endsWith("dashboard.html")) {

    const userEmailEl = document.getElementById("userEmail");
    const listEl = document.getElementById("list");
    const totalEl = document.getElementById("total");
    const monthEl = document.getElementById("monthTotal");
    const countEl = document.getElementById("count");
    const currencySelect = document.getElementById("currency");

    currencySelect.value = currency;

    let currentUser = null;
    let expenses = [];

    /* ======================
       Require Auth
    ====================== */
    firebase.auth().onAuthStateChanged(async(user) => {
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        currentUser = user;
        userEmailEl.textContent = user.email;

        document.getElementById("date").value =
            new Date().toISOString().slice(0, 10);

        const ref = firebase
            .firestore()
            .collection("users")
            .doc(user.uid)
            .collection("expenses");

        ref.orderBy("createdAt", "desc").onSnapshot((snap) => {
            expenses = [];
            snap.forEach((doc) => {
                let data = doc.data();
                data.id = doc.id;
                expenses.push(data);
            });
            renderAll();
        });
    });

    window.signOut = () => {
        firebase.auth().signOut();
        window.location.href = "index.html";
    };

    window.setCurrency = (c) => {
        currency = c;
        localStorage.setItem("neon_currency", c);
        renderAll();
    };

    /* ======================
       Add Expense
    ====================== */
    window.addExpense = async() => {
        const title = document.getElementById("title").value.trim();
        const amt = Number(document.getElementById("amount").value);
        const category = document.getElementById("category").value;
        const date =
            document.getElementById("date").value ||
            new Date().toISOString().slice(0, 10);

        if (!title || !amt || amt <= 0) {
            alert("Enter valid title and amount");
            return;
        }

        const amountINR = Number((amt / (rates[currency] || 1)).toFixed(2));

        await firebase
            .firestore()
            .collection("users")
            .doc(currentUser.uid)
            .collection("expenses")
            .add({
                title,
                amount: amountINR,
                category,
                date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        document.getElementById("title").value = "";
        document.getElementById("amount").value = "";
        document.getElementById("category").value = "Food";
        document.getElementById("date").value =
            new Date().toISOString().slice(0, 10);
    };

    /* ======================
       Edit Expense
    ====================== */
    window.editExpense = async(id) => {
        const item = expenses.find((x) => x.id === id);
        if (!item) return;

        const newTitle = prompt("Edit title", item.title);
        if (newTitle === null) return;

        const newAmtRaw = prompt(
            "Edit amount (" + currency + ")",
            (item.amount * rates[currency]).toFixed(2)
        );
        if (newAmtRaw === null) return;

        const newAmt = Number(newAmtRaw);
        if (isNaN(newAmt) || newAmt <= 0) return;

        const inINR = Number((newAmt / rates[currency]).toFixed(2));

        await firebase
            .firestore()
            .collection("users")
            .doc(currentUser.uid)
            .collection("expenses")
            .doc(id)
            .update({
                title: newTitle.trim(),
                amount: inINR
            });
    };

    /* ======================================================
       CUSTOM DELETE MODAL — FIXED (buttons now work)
    ======================================================*/
    let deleteID = null;

    // this runs AFTER the page & user loads
    setTimeout(() => {
        const modal = document.getElementById("deleteModal");
        const cancelBtn = document.getElementById("cancelDelete");
        const confirmBtn = document.getElementById("confirmDelete");

        if (!modal || !cancelBtn || !confirmBtn) {
            console.warn("Modal elements not found yet.");
            return;
        }

        console.log("Delete modal buttons linked ✔");

        // CANCEL BUTTON
        cancelBtn.onclick = () => {
            deleteID = null;
            modal.style.display = "none";
        };

        // CONFIRM DELETE BUTTON
        confirmBtn.onclick = async() => {
            if (!deleteID) return;

            await firebase
                .firestore()
                .collection("users")
                .doc(currentUser.uid)
                .collection("expenses")
                .doc(deleteID)
                .delete();

            deleteID = null;
            modal.style.display = "none";
        };

    }, 500); // wait for UI to load fully


    // called when user clicks delete icon
    window.deleteExpense = (id) => {
        deleteID = id;
        const modal = document.getElementById("deleteModal");
        modal.style.display = "flex";
    };

    /* ======================
       Export / Import
    ====================== */
    window.exportUserData = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            expenses
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json"
        });

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = currentUser.email + "-expenses.json";
        a.click();
    };

    window.importUserData = async(ev) => {
        let file = ev.target.files[0];
        if (!file) return;

        const txt = await file.text();
        const json = JSON.parse(txt);

        let list = json.expenses || json;

        const col = firebase
            .firestore()
            .collection("users")
            .doc(currentUser.uid)
            .collection("expenses");

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

    /* ======================
       UI Rendering
    ====================== */
    function formatUI(val) {
        return (
            sym(currency) + (val * rates[currency]).toLocaleString()
        );
    }

    function renderAll() {
        const totalINR = expenses.reduce(
            (s, x) => s + Number(x.amount || 0),
            0
        );

        const now = new Date();
        const monthKey = now.toISOString().slice(0, 7);

        const monthTotal = expenses
            .filter((x) => x.date.slice(0, 7) === monthKey)
            .reduce((s, x) => s + Number(x.amount || 0), 0);

        totalEl.textContent = formatUI(totalINR);
        monthEl.textContent = formatUI(monthTotal);
        countEl.textContent = expenses.length;

        listEl.innerHTML = "";

        if (expenses.length === 0) {
            listEl.innerHTML =
                '<div style="padding:10px;opacity:0.8;">No expenses yet</div>';
        }

        expenses.forEach((e) => {
            const row = document.createElement("div");
            row.className = "exp-item";

            row.innerHTML = `
                <div>
                    <div style="font-weight:700">${e.title}</div>
                    <div style="opacity:0.8;font-size:12px">
                        ${e.date} • <span class="cat-badge">${e.category}</span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <b>${formatUI(e.amount)}</b>
                    <button class="icon-btn" onclick="editExpense('${e.id}')">✏️</button>
                    <button class="icon-btn" onclick="deleteExpense('${e.id}')">🗑️</button>
                </div>
            `;

            listEl.appendChild(row);
        });

        updateCharts();
    }

    /* ======================
       Charts Rendering (with destroy fix)
    ====================== */

    function computeMonthlyTrend() {
        const labels = [];
        const data = [];
        const now = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toISOString().slice(0, 7);

            labels.push(
                d.toLocaleString("default", {
                    month: "short",
                    year: "2-digit"
                })
            );

            const amount = expenses
                .filter((x) => x.date.slice(0, 7) === key)
                .reduce((s, x) => s + Number(x.amount || 0), 0);

            data.push(amount * rates[currency]);
        }

        return { labels, data };
    }

    function computeCategoryDistribution() {
        const map = {};

        expenses.forEach((e) => {
            map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
        });

        const labels = Object.keys(map);
        const data = labels.map(
            (l) => map[l] * rates[currency]
        );

        return { labels, data };
    }

    function updateCharts() {
        const trend = computeMonthlyTrend();
        const cat = computeCategoryDistribution();

        /* ----- LINE CHART ----- */
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
                layout: {
                    padding: { top: 20, bottom: 80 } // smaller height
                },
                scales: {
                    y: {
                        ticks: { maxTicksLimit: 3 }, // fewer scale lines
                        suggestedMax: Math.max(...trend.data) * 1.2
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }


        });

        /* ----- PIE CHART ----- */
        const ctxP = document.getElementById("pieChart").getContext("2d");
        if (window.pieChartInstance) window.pieChartInstance.destroy();
        window.pieChartInstance = new Chart(ctxP, {
            type: "pie",
            data: {
                labels: cat.labels,
                datasets: [{
                    data: cat.data,
                    backgroundColor: [
                        "#00f0ff",
                        "#ff2ec4",
                        "#7c4dff",
                        "#ffd166",
                        "#7efc6e",
                        "#ff8b5c"
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,

                layout: {
                    padding: {
                        top: 30, // more space above
                        bottom: 40 // more space below for legend
                    }
                },

                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            padding: 20 // spacing around legend items
                        }
                    }
                },

                radius: "72%" // slightly smaller for cleaner look
            }





        });

        /* ----- BAR CHART ----- */
        const ctxB = document.getElementById("barChart").getContext("2d");
        if (window.barChartInstance) window.barChartInstance.destroy();
        window.barChartInstance = new Chart(ctxB, {
            type: "bar",
            data: {
                labels: cat.labels,
                datasets: [{
                    data: cat.data,
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

                    /* ⭐ HERE — inside dataset */
                    barThickness: 22, // thinner bars
                    maxBarThickness: 24

                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,

                layout: {
                    padding: { top: 30, bottom: 80 } // BIGGER padding = smaller chart
                },

                scales: {
                    y: {
                        suggestedMax: Math.max(...cat.data) * 1.05, // very small bars
                        ticks: { maxTicksLimit: 4 },
                        grace: "5%"
                    },
                    x: {
                        ticks: { maxRotation: 0 }
                    }
                },

                plugins: {
                    legend: { display: false }
                }
            }





        });
    }
}

/* Safe fallback */
window.exportUserData = window.exportUserData || function() {
    alert("No user loaded");
};
window.importUserData = window.importUserData || function() {
    alert("No user loaded");
};
window.googleLogin = async() => {
    const provider = new firebase.auth.GoogleAuthProvider();

    try {
        const res = await firebase.auth().signInWithPopup(provider);
        const user = res.user;

        // Create firestore user doc if not exists
        const ref = firebase.firestore().collection("users").doc(user.uid);
        const doc = await ref.get();

        if (!doc.exists) {
            await ref.set({
                email: user.email,
                name: user.displayName || "",
                photo: user.photoURL || "",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        window.location.href = "dashboard.html";

    } catch (err) {
        alert(err.message || "Google Login Failed");
    }
};
// ========== Toast Function ==========
window.showToast = function(msg, type = "normal") {
    const box = document.getElementById("toastBox");
    const div = document.createElement("div");
    div.className = "toast" + (type === "error" ? " error" : "");
    div.innerText = msg;

    box.appendChild(div);

    setTimeout(() => {
        div.remove();
    }, 3200);
};
// ------------- Export: PDF + Word ----------------
// Requires: jspdf and autotable loaded (see CDN includes above).
// Place this code after currentUser and expenses are available (eg inside dashboard.js scope).

// Utility: format date -> YYYY-MM-DD (for filenames and display)
function fmtDateForFile(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

// Utility: convert ISO date or 'YYYY-MM-DD' to display form
function fmtDateDisplay(d) {
    if (!d) return '';
    const dd = new Date(d);
    if (isNaN(dd)) return d;
    return dd.toISOString().slice(0, 10);
}

// collect filters from UI
function getExportFilters() {
    const from = document.getElementById('exportFrom').value || null;
    const to = document.getElementById('exportTo').value || null;
    const cat = document.getElementById('exportCategory').value || '';
    return { from, to, category: cat };
}

// apply filters to the global 'expenses' array
function filteredExpensesList(filters) {
    const list = (window.expenses || []).slice(); // clone
    return list.filter(e => {
        if (!e) return false;
        if (filters.category && filters.category !== '' && e.category !== filters.category) return false;
        if (filters.from) {
            if (!e.date) return false;
            if (e.date < filters.from) return false;
        }
        if (filters.to) {
            if (!e.date) return false;
            if (e.date > filters.to) return false;
        }
        return true;
    });
}

// compute summaries: totals by category and date-range total
function computeSummaries(list) {
    const byCategory = {};
    let fullTotalINR = 0;
    for (const it of list) {
        const amt = Number(it.amount || 0);
        fullTotalINR += amt;
        byCategory[it.category] = (byCategory[it.category] || 0) + amt;
    }
    return { byCategory, fullTotalINR };
}

// Build PDF (using jsPDF + autoTable)
async function exportToPDF() {
    const filters = getExportFilters();
    const list = filteredExpensesList(filters);

    // filename
    const uid = (window.currentUser && window.currentUser.uid) || 'anon';
    const filename = `spendora-${uid}-${fmtDateForFile(new Date())}.pdf`;

    // Build document
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // pt-based sizing

    const margin = 40;
    let y = 40;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(240, 240, 255);
    doc.text('Spendora — Expense Report', margin, y);
    doc.setFontSize(10);
    y += 18;
    doc.setTextColor(180, 180, 200);
    const filText = `Generated: ${new Date().toLocaleString()}  •  Filters: ${filters.category || 'All'}, ${filters.from || 'Any'} → ${filters.to || 'Any'}`;
    doc.text(filText, margin, y);

    // Table rows
    y += 22;

    // Prepare table body
    const tableBody = list.map(it => {
        return [
            it.title || '',
            it.category || '',
            (it.amount ? (Number(it.amount) * (rates && rates[currency] ? rates[currency] : 1)).toFixed(2) : '0.00'),
            it.date || '',
            (it.createdAt && it.createdAt.toDate ? it.createdAt.toDate().toISOString().slice(0, 19).replace('T', ' ') : (it.createdAt || '')),
            it.id || '',
            (it.note ? 'Yes' : 'No')
        ];
    });

    // autoTable columns
    const columns = [
        { header: 'Title', dataKey: 'title' },
        { header: 'Category', dataKey: 'category' },
        { header: `Amount (${sym(currency)})`, dataKey: 'amount' },
        { header: 'Date', dataKey: 'date' },
        { header: 'CreatedAt', dataKey: 'createdAt' },
        { header: 'ID', dataKey: 'id' },
        { header: 'Note', dataKey: 'note' }
    ];

    // If no items, print message
    if (tableBody.length === 0) {
        doc.setFontSize(12);
        doc.text('No expense records match the selected filters.', margin, y + 10);
    } else {
        // Use autoTable
        doc.autoTable({
            startY: y,
            head: [columns.map(c => c.header)],
            body: tableBody,
            styles: {
                halign: 'left',
                fontSize: 10,
                cellPadding: 6,
                textColor: [220, 220, 230]
            },
            headStyles: {
                fillColor: [20, 20, 35],
                textColor: [200, 240, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [12, 8, 20] },
            margin: { left: margin, right: margin },
            theme: 'striped',
            didDrawPage: (data) => {
                // optional: could add footer
            }
        });
    }

    // After table, add totals & breakdown
    const { byCategory, fullTotalINR } = computeSummaries(list);
    const afterY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : doc.internal.pageSize.getHeight() - 120;

    doc.setFontSize(12);
    doc.text('Summary', margin, afterY);
    doc.setFontSize(10);

    let summaryY = afterY + 16;
    doc.text(`Total (all items): ${sym(currency)}${(fullTotalINR * (rates[currency] || 1)).toLocaleString()}`, margin, summaryY);
    summaryY += 14;

    // category breakdown
    doc.text('By Category:', margin, summaryY);
    summaryY += 12;

    Object.keys(byCategory).forEach(cat => {
        doc.text(`${cat}: ${sym(currency)}${(byCategory[cat] * (rates[currency] || 1)).toLocaleString()}`, margin + 10, summaryY);
        summaryY += 12;
    });

    // Save file
    doc.save(filename);
}

// Build Word (simple HTML -> .doc) - works with MS Word / LibreOffice
function exportToWord() {
    const filters = getExportFilters();
    const list = filteredExpensesList(filters);

    const uid = (window.currentUser && window.currentUser.uid) || 'anon';
    const filename = `spendora-${uid}-${fmtDateForFile(new Date())}.doc`;

    // Build HTML string for Word
    let html = `
  <!doctype html>
  <html>
  <head><meta charset="utf-8"><title>Spendora Report</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color:#111; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; }
      th { background:#222; color:#fff; text-align:left; }
    </style>
  </head>
  <body>
  <h2>Spendora Expense Report</h2>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <p>Filters: ${filters.category || 'All'}, ${filters.from || 'Any'} → ${filters.to || 'Any'}</p>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Category</th><th>Amount (${sym(currency)})</th>
        <th>Date</th><th>CreatedAt</th><th>ID</th><th>Note</th>
      </tr>
    </thead>
    <tbody>
  `;

    list.forEach(it => {
        const amt = (it.amount ? (Number(it.amount) * (rates[currency] || 1)).toFixed(2) : '0.00');
        const createdAt = it.createdAt && it.createdAt.toDate ? it.createdAt.toDate().toISOString().slice(0, 19).replace('T', ' ') : (it.createdAt || '');
        html += `<tr>
      <td>${(it.title||'')}</td>
      <td>${(it.category||'')}</td>
      <td style="text-align:right">${amt}</td>
      <td>${(it.date||'')}</td>
      <td>${createdAt}</td>
      <td>${(it.id||'')}</td>
      <td>${(it.note ? 'Yes' : 'No')}</td>
    </tr>`;
    });

    html += `</tbody></table>`;

    // Totals
    const { byCategory, fullTotalINR } = computeSummaries(list);
    html += `<h3>Summary</h3><p>Total: ${sym(currency)}${(fullTotalINR * (rates[currency] || 1)).toLocaleString()}</p>`;
    html += `<ul>`;
    for (const c in byCategory) {
        html += `<li>${c}: ${sym(currency)}${(byCategory[c] * (rates[currency] || 1)).toLocaleString()}</li>`;
    }
    html += `</ul>`;

    html += `</body></html>`;

    // Create blob and trigger download as .doc
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Button hookup
document.getElementById('btnExportPDF').addEventListener('click', exportToPDF);
document.getElementById('btnExportWord').addEventListener('click', exportToWord);

// Make these functions accessible if you need to call programmatically
window.exportToPDF = exportToPDF;
window.exportToWord = exportToWord;