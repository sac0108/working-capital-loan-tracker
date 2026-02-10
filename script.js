const STORAGE_KEY = "wcLoanTrackerDataV2";

const PRODUCT_GROUPS = {
  fund: ["CC", "OD", "TERM_LOAN", "WCDL"],
  nonfund: ["LC", "BG", "LCBN"],
};

const FACILITY_LABELS = {
  CC: "Cash Credit (CC)",
  OD: "Overdraft (OD)",
  TERM_LOAN: "Term Loan",
  WCDL: "Term Loan (Legacy WCDL)",
  LC: "Letter of Credit (LC)",
  BG: "Bank Guarantee (BG)",
  LCBN: "LC Buyer’s Credit (LCBN)",
};

const state = {
  borrowers: [],
  selectedBorrowerId: "",
  filters: { risk: "", rm: "", renewalDays: "" },
  dashboardProductTab: "fund",
};

const todayISO = () => new Date().toISOString().split("T")[0];
const uid = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date(todayISO());
  const target = new Date(dateStr);
  return Math.ceil((target - today) / 86400000);
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function pct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function normalizeBorrower(b) {
  return {
    id: b.id || uid("bor"),
    name: b.name || "",
    industry: b.industry || "",
    relationshipManager: b.relationshipManager || "",
    riskRating: b.riskRating || "Low",
    gstNumber: b.gstNumber || "NA",
    bankName: b.bankName || "NA",
    contactNumber: b.contactNumber || "NA",
    loanAccountNumber: b.loanAccountNumber || "NA",
    facilities: Array.isArray(b.facilities)
      ? b.facilities.map((f) => ({
          id: f.id || uid("fac"),
          facilityType: f.facilityType || "CC",
          sanctionedLimit: toNumber(f.sanctionedLimit),
          drawingPower: toNumber(f.drawingPower),
          currentUtilization: toNumber(f.currentUtilization),
          interestRate: toNumber(f.interestRate),
          tenure: toNumber(f.tenure) || 12,
          collateralType: f.collateralType || "Current Assets",
          totalInterestPaid: toNumber(f.totalInterestPaid),
          interestPayable: toNumber(f.interestPayable),
          renewalDate: f.renewalDate || addDays(todayISO(), 45),
        }))
      : [],
  };
}

function computeFacilityMetrics(facility) {
  const sanctioned = toNumber(facility.sanctionedLimit);
  const dp = toNumber(facility.drawingPower);
  const utilized = toNumber(facility.currentUtilization);
  const exposure = Math.min(sanctioned || 0, dp || 0) || sanctioned || dp || 0;
  const utilizationPct = exposure > 0 ? (utilized / exposure) * 100 : 0;
  const availableLimit = Math.max(exposure - utilized, 0);
  const daysToRenewal = daysUntil(facility.renewalDate);

  let riskFlag = "Low";
  if (utilizationPct > 90 || daysToRenewal <= 30 || availableLimit <= 1) riskFlag = "High";
  else if (utilizationPct > 75 || daysToRenewal <= 60) riskFlag = "Medium";

  const alerts = [];
  if (utilizationPct > 90) alerts.push("Utilization > 90%");
  if (daysToRenewal <= 30) alerts.push("Renewal due within 30 days");
  if (availableLimit <= 1) alerts.push("Available limit ≈ 0");

  return { exposure, utilized, utilizationPct, availableLimit, daysToRenewal, riskFlag, alerts };
}

function getBorrowerById(id) {
  return state.borrowers.find((b) => b.id === id);
}

function getActiveBorrower() {
  if (!state.borrowers.length) return null;
  if (!state.selectedBorrowerId || !getBorrowerById(state.selectedBorrowerId)) {
    state.selectedBorrowerId = state.borrowers[0].id;
  }
  return getBorrowerById(state.selectedBorrowerId);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ borrowers: state.borrowers }));
}

function seedData() {
  const borId = uid("bor");
  state.borrowers = [
    {
      id: borId,
      name: "Apex Textiles Pvt Ltd",
      industry: "Textiles",
      relationshipManager: "Rhea Kapoor",
      riskRating: "Medium",
      gstNumber: "27AAECA1234F1Z5",
      bankName: "Axis Bank",
      contactNumber: "+91 9898989898",
      loanAccountNumber: "WC-AXIS-000182",
      facilities: [
        {
          id: uid("fac"),
          facilityType: "CC",
          sanctionedLimit: 5000000,
          drawingPower: 4700000,
          currentUtilization: 4300000,
          interestRate: 10.25,
          tenure: 12,
          collateralType: "Current Assets",
          totalInterestPaid: 415000,
          interestPayable: 35000,
          renewalDate: addDays(todayISO(), 28),
        },
        {
          id: uid("fac"),
          facilityType: "BG",
          sanctionedLimit: 2200000,
          drawingPower: 2200000,
          currentUtilization: 1600000,
          interestRate: 3.2,
          tenure: 12,
          collateralType: "SOCP",
          totalInterestPaid: 86000,
          interestPayable: 12000,
          renewalDate: addDays(todayISO(), 68),
        },
      ],
    },
  ];
  state.selectedBorrowerId = borId;
  saveData();
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedData();
  try {
    const parsed = JSON.parse(raw);
    state.borrowers = Array.isArray(parsed.borrowers) ? parsed.borrowers.map(normalizeBorrower) : [];
    if (!state.borrowers.length) seedData();
  } catch {
    seedData();
  }
}

function borrowerAggregate(borrower) {
  const metrics = borrower.facilities.map(computeFacilityMetrics);
  const exposure = metrics.reduce((s, m) => s + m.exposure, 0);
  const utilized = metrics.reduce((s, m) => s + m.utilized, 0);
  const avgUtil = metrics.length ? metrics.reduce((s, m) => s + m.utilizationPct, 0) / metrics.length : 0;
  const minDaysRenewal = metrics.length ? Math.min(...metrics.map((m) => m.daysToRenewal)) : Infinity;
  return { exposure, utilized, avgUtil, minDaysRenewal };
}

function customerPanelHtml(borrower) {
  if (!borrower) return "<div class='empty-state'><p>Create a borrower to view customer information.</p></div>";
  const items = [
    ["Customer Name", borrower.name],
    ["GST Number", borrower.gstNumber],
    ["Bank Name", borrower.bankName],
    ["Industry", borrower.industry],
    ["Contact Number", borrower.contactNumber],
    ["Loan Account Number", borrower.loanAccountNumber],
  ];
  return `<div class="customer-grid">${items
    .map(([k, v]) => `<div class="info-chip"><div class="label">${k}</div><div class="value">${v || "NA"}</div></div>`)
    .join("")}</div>`;
}

function riskBadgeClass(risk) {
  return (risk || "low").toLowerCase();
}

function categoryFacilities(borrower) {
  if (!borrower) return [];
  const wanted = PRODUCT_GROUPS[state.dashboardProductTab];
  return borrower.facilities.filter((f) => wanted.includes(f.facilityType));
}

function deriveCcTrend(facility) {
  const base = computeFacilityMetrics(facility).utilizationPct;
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  return months.map((m, idx) => {
    const variance = ((idx % 2 === 0 ? -1 : 1) * (idx + 1) * 2.2) % 9;
    const val = Math.max(35, Math.min(99, base + variance));
    return { month: m, value: Number(val.toFixed(1)) };
  });
}

function renderDashboard() {
  const borrower = getActiveBorrower();
  document.getElementById("dashboard-customer-panel").innerHTML = customerPanelHtml(borrower);

  const dashboardSelect = document.getElementById("dashboard-borrower-select");
  dashboardSelect.innerHTML = state.borrowers
    .map((b) => `<option value="${b.id}" ${b.id === state.selectedBorrowerId ? "selected" : ""}>${b.name}</option>`)
    .join("");

  const table = document.getElementById("dashboard-facilities-table");
  const cards = document.getElementById("dashboard-cards");
  const alerts = document.getElementById("portfolio-alerts");
  const chart = document.getElementById("cc-chart");
  const heading = state.dashboardProductTab === "fund" ? "Fund Based Facilities" : "Non-Fund Based Facilities";
  document.getElementById("dashboard-table-title").textContent = heading;

  const facilities = categoryFacilities(borrower);
  const rows = facilities.map((f) => ({ f, m: computeFacilityMetrics(f) }));

  const totalExposure = rows.reduce((s, r) => s + r.m.exposure, 0);
  const amountUtilized = rows.reduce((s, r) => s + r.m.utilized, 0);
  const weightedRate = totalExposure
    ? rows.reduce((s, r) => s + r.f.interestRate * r.m.exposure, 0) / totalExposure
    : 0;
  const collateral = [...new Set(rows.map((r) => r.f.collateralType).filter(Boolean))].join(" / ") || "--";
  const interestPaid = rows.reduce((s, r) => s + toNumber(r.f.totalInterestPaid), 0);
  const interestPayable = rows.reduce((s, r) => s + toNumber(r.f.interestPayable), 0);

  cards.innerHTML = [
    ["Total Exposure", money(totalExposure)],
    ["Amount Utilized", money(amountUtilized)],
    ["Rate of Interest", pct(weightedRate)],
    ["Collateral Attached", collateral],
    ["Total Interest Paid", money(interestPaid)],
    ["Interest Payable", money(interestPayable)],
  ]
    .map(([label, value]) => `<article class="card"><div class="label">${label}</div><div class="value">${value}</div></article>`)
    .join("");

  table.innerHTML = rows.length
    ? rows
        .map(
          ({ f, m }, idx) => `<tr>
            <td>${FACILITY_LABELS[f.facilityType] || f.facilityType} ${rows.filter((r) => r.f.facilityType === f.facilityType).length > 1 ? `#${idx + 1}` : ""}</td>
            <td>${money(m.exposure)}</td>
            <td>${money(m.utilized)}</td>
            <td>
              <div class="util-wrap">${pct(m.utilizationPct)}
                <div class="util-track"><div class="util-bar ${
                  m.utilizationPct > 90 ? "risk" : m.utilizationPct > 75 ? "warn" : "safe"
                }" style="width:${Math.min(100, m.utilizationPct)}%"></div></div>
              </div>
            </td>
            <td>${pct(f.interestRate)}</td>
            <td>${f.collateralType}</td>
            <td>${money(f.totalInterestPaid)}</td>
            <td>${money(f.interestPayable)}</td>
            <td>${f.renewalDate} (${m.daysToRenewal})</td>
            <td><span class="badge ${riskBadgeClass(m.riskFlag)}">${m.riskFlag}</span></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="10">No ${state.dashboardProductTab === "fund" ? "Fund Based" : "Non-Fund Based"} facilities availed.</td></tr>`;

  const tabAlerts = rows.flatMap(({ f, m }) =>
    m.alerts.map((a) => ({ text: `${FACILITY_LABELS[f.facilityType] || f.facilityType}: ${a}`, sev: a.includes("> 90") || a.includes("≈ 0") ? "danger" : "warning" }))
  );
  alerts.innerHTML = tabAlerts.length
    ? tabAlerts.map((a) => `<div class="alert-item ${a.sev}">${a.text}</div>`).join("")
    : "<div class='empty-state'><p>No active alerts for this category.</p></div>";

  const ccRows = rows.filter((r) => r.f.facilityType === "CC");
  chart.innerHTML = ccRows.length
    ? ccRows
        .map(({ f }, idx) => {
          const trend = deriveCcTrend(f);
          return `<div class="cc-facility-chart">
            <div><strong>${FACILITY_LABELS[f.facilityType]} ${ccRows.length > 1 ? `#${idx + 1}` : ""}</strong></div>
            <div class="chart-bars">
              ${trend
                .map(
                  (point) => `<div class="chart-col"><div class="chart-val">${point.value}%</div><div class="chart-bar" style="height:${Math.max(
                    10,
                    point.value
                  )}%"></div><div class="chart-label">${point.month}</div></div>`
                )
                .join("")}
            </div>
          </div>`;
        })
        .join("")
    : "<div class='empty-state'><p>No Cash Credit facilities available for utilization analytics in this tab.</p></div>";
}

function applyFilters(list) {
  return list.filter((b) => {
    const aggr = borrowerAggregate(b);
    const riskPass = !state.filters.risk || b.riskRating === state.filters.risk;
    const rmPass = !state.filters.rm || b.relationshipManager.toLowerCase().includes(state.filters.rm.toLowerCase());
    const renewPass = !state.filters.renewalDays || (aggr.minDaysRenewal !== Infinity && aggr.minDaysRenewal <= Number(state.filters.renewalDays));
    return riskPass && rmPass && renewPass;
  });
}

function renderBorrowers() {
  const table = document.getElementById("borrowers-table");
  const filtered = applyFilters(state.borrowers);

  table.innerHTML = filtered.length
    ? filtered
        .map((b) => {
          const aggr = borrowerAggregate(b);
          return `<tr>
            <td>${b.name}</td>
            <td>${b.industry}</td>
            <td>${b.relationshipManager}</td>
            <td><span class="badge ${riskBadgeClass(b.riskRating)}">${b.riskRating}</span></td>
            <td>${money(aggr.exposure)}</td>
            <td>${money(aggr.utilized)}</td>
            <td><div class="util-wrap">${pct(aggr.avgUtil)}<div class="util-track"><div class="util-bar ${
            aggr.avgUtil > 90 ? "risk" : aggr.avgUtil > 75 ? "warn" : "safe"
          }" style="width:${Math.min(100, aggr.avgUtil)}%"></div></div></div></td>
            <td><div class="actions-row">
              <button class="btn ghost" data-action="view" data-id="${b.id}">View</button>
              <button class="btn ghost" data-action="edit" data-id="${b.id}">Edit</button>
              <button class="btn ghost" data-action="delete" data-id="${b.id}">Delete</button>
            </div></td>
          </tr>`;
        })
        .join("")
    : "<tr><td colspan='8'>No borrowers match active filters.</td></tr>";
}

function renderBorrowerDetail() {
  const select = document.getElementById("detail-borrower-select");
  const borrower = getActiveBorrower();

  document.getElementById("details-customer-panel").innerHTML = customerPanelHtml(borrower);

  if (!borrower) {
    select.innerHTML = "<option value=''>No borrowers</option>";
    document.getElementById("borrower-detail-content").innerHTML = "<div class='empty-state'><p>Add borrower to continue.</p></div>";
    return;
  }

  select.innerHTML = state.borrowers
    .map((b) => `<option value="${b.id}" ${b.id === state.selectedBorrowerId ? "selected" : ""}>${b.name}</option>`)
    .join("");

  const aggr = borrowerAggregate(borrower);
  const facilityRows = borrower.facilities
    .map((f) => {
      const m = computeFacilityMetrics(f);
      return `<tr>
        <td>${FACILITY_LABELS[f.facilityType] || f.facilityType}</td>
        <td>${money(m.exposure)}</td>
        <td>${money(m.utilized)}</td>
        <td>${pct(m.utilizationPct)}</td>
        <td>${money(m.availableLimit)}</td>
        <td>${pct(f.interestRate)}</td>
        <td>${f.collateralType}</td>
        <td>${money(f.totalInterestPaid)}</td>
        <td>${money(f.interestPayable)}</td>
        <td>${f.renewalDate}</td>
        <td>${m.daysToRenewal}</td>
        <td><span class="badge ${riskBadgeClass(m.riskFlag)}">${m.riskFlag}</span></td>
        <td><div class="actions-row">
          <button class="btn ghost" data-action="edit-facility" data-facility-id="${f.id}">Edit</button>
          <button class="btn ghost" data-action="delete-facility" data-facility-id="${f.id}">Delete</button>
        </div></td>
      </tr>`;
    })
    .join("");

  const alerts = borrower.facilities
    .flatMap((f) => {
      const m = computeFacilityMetrics(f);
      return m.alerts.map((a) => ({ t: `${FACILITY_LABELS[f.facilityType] || f.facilityType}: ${a}`, s: a.includes("> 90") || a.includes("≈ 0") ? "danger" : "warning" }));
    })
    .map((a) => `<div class="alert-item ${a.s}">${a.t}</div>`)
    .join("");

  document.getElementById("borrower-detail-content").innerHTML = `
    <div class="cards">
      <article class="card"><div class="label">Risk Rating</div><div class="value"><span class="badge ${riskBadgeClass(borrower.riskRating)}">${borrower.riskRating}</span></div></article>
      <article class="card"><div class="label">Total Exposure</div><div class="value">${money(aggr.exposure)}</div></article>
      <article class="card"><div class="label">Total Utilized</div><div class="value">${money(aggr.utilized)}</div></article>
      <article class="card"><div class="label">Average Utilization</div><div class="value">${pct(aggr.avgUtil)}</div></article>
    </div>
    <div class="panel">
      <h3>Facility Alerts</h3>
      <div class="alert-list">${alerts || "<div class='empty-state'><p>No alerts.</p></div>"}</div>
    </div>
    <div class="panel">
      <h3>Facility Book</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Exposure</th><th>Utilized</th><th>Util%</th><th>Available</th><th>ROI</th><th>Collateral</th>
              <th>Interest Paid</th><th>Interest Payable</th><th>Renewal</th><th>Days</th><th>Risk</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${facilityRows || "<tr><td colspan='13'>No facilities added.</td></tr>"}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAll() {
  renderDashboard();
  renderBorrowers();
  renderBorrowerDetail();
}

function openBorrowerDialog(b = null) {
  document.getElementById("borrower-form-title").textContent = b ? "Edit Borrower" : "Add Borrower";
  document.getElementById("borrower-id").value = b?.id || "";
  document.getElementById("borrower-name").value = b?.name || "";
  document.getElementById("borrower-industry").value = b?.industry || "";
  document.getElementById("borrower-rm").value = b?.relationshipManager || "";
  document.getElementById("borrower-risk").value = b?.riskRating || "Low";
  document.getElementById("borrower-gst").value = b?.gstNumber || "";
  document.getElementById("borrower-bank").value = b?.bankName || "";
  document.getElementById("borrower-contact").value = b?.contactNumber || "";
  document.getElementById("borrower-loan-account").value = b?.loanAccountNumber || "";
  document.getElementById("borrower-dialog").showModal();
}

function openFacilityDialog(borrowerId, f = null) {
  document.getElementById("facility-form-title").textContent = f ? "Edit Facility" : "Add Facility";
  document.getElementById("facility-borrower-id").value = borrowerId;
  document.getElementById("facility-id").value = f?.id || "";
  document.getElementById("facility-type").value = f?.facilityType || "CC";
  document.getElementById("facility-sanctioned").value = f?.sanctionedLimit || "";
  document.getElementById("facility-dp").value = f?.drawingPower || "";
  document.getElementById("facility-utilization").value = f?.currentUtilization || "";
  document.getElementById("facility-rate").value = f?.interestRate || "";
  document.getElementById("facility-tenure").value = f?.tenure || "";
  document.getElementById("facility-collateral").value = f?.collateralType || "Current Assets";
  document.getElementById("facility-interest-paid").value = f?.totalInterestPaid || "";
  document.getElementById("facility-interest-payable").value = f?.interestPayable || "";
  document.getElementById("facility-renewal").value = f?.renewalDate || todayISO();
  document.getElementById("facility-dialog").showModal();
}

function setActiveView(view) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => setActiveView(b.dataset.view)));

  document.querySelectorAll(".segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.dashboardProductTab = btn.dataset.productTab;
      document.querySelectorAll(".segment-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderDashboard();
    });
  });

  document.getElementById("dashboard-borrower-select").addEventListener("change", (e) => {
    state.selectedBorrowerId = e.target.value;
    renderAll();
  });

  document.getElementById("detail-borrower-select").addEventListener("change", (e) => {
    state.selectedBorrowerId = e.target.value;
    renderAll();
  });

  document.getElementById("filter-risk").addEventListener("change", (e) => {
    state.filters.risk = e.target.value;
    renderBorrowers();
  });
  document.getElementById("filter-rm").addEventListener("input", (e) => {
    state.filters.rm = e.target.value.trim();
    renderBorrowers();
  });
  document.getElementById("filter-renewal").addEventListener("change", (e) => {
    state.filters.renewalDays = e.target.value;
    renderBorrowers();
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    state.filters = { risk: "", rm: "", renewalDays: "" };
    document.getElementById("filter-risk").value = "";
    document.getElementById("filter-rm").value = "";
    document.getElementById("filter-renewal").value = "";
    renderBorrowers();
  });

  document.getElementById("open-borrower-form").addEventListener("click", () => openBorrowerDialog());
  document.getElementById("cancel-borrower").addEventListener("click", () => document.getElementById("borrower-dialog").close());

  document.getElementById("borrower-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("borrower-id").value;
    const payload = {
      id: id || uid("bor"),
      name: document.getElementById("borrower-name").value.trim(),
      industry: document.getElementById("borrower-industry").value.trim(),
      relationshipManager: document.getElementById("borrower-rm").value.trim(),
      riskRating: document.getElementById("borrower-risk").value,
      gstNumber: document.getElementById("borrower-gst").value.trim(),
      bankName: document.getElementById("borrower-bank").value.trim(),
      contactNumber: document.getElementById("borrower-contact").value.trim(),
      loanAccountNumber: document.getElementById("borrower-loan-account").value.trim(),
      facilities: [],
    };

    if (id) {
      const ex = getBorrowerById(id);
      Object.assign(ex, payload, { facilities: ex.facilities });
    } else {
      state.borrowers.push(payload);
      state.selectedBorrowerId = payload.id;
    }

    saveData();
    document.getElementById("borrower-dialog").close();
    renderAll();
  });

  document.getElementById("borrowers-table").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const borrower = getBorrowerById(btn.dataset.id);
    if (!borrower) return;

    if (btn.dataset.action === "view") {
      state.selectedBorrowerId = borrower.id;
      setActiveView("details");
      renderAll();
    }
    if (btn.dataset.action === "edit") openBorrowerDialog(borrower);
    if (btn.dataset.action === "delete") {
      if (!window.confirm(`Delete borrower ${borrower.name}?`)) return;
      state.borrowers = state.borrowers.filter((b) => b.id !== borrower.id);
      state.selectedBorrowerId = state.borrowers[0]?.id || "";
      saveData();
      renderAll();
    }
  });

  document.getElementById("open-facility-form").addEventListener("click", () => {
    if (!state.selectedBorrowerId) return;
    openFacilityDialog(state.selectedBorrowerId);
  });
  document.getElementById("cancel-facility").addEventListener("click", () => document.getElementById("facility-dialog").close());

  document.getElementById("facility-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const borrower = getBorrowerById(document.getElementById("facility-borrower-id").value);
    if (!borrower) return;
    const facilityId = document.getElementById("facility-id").value;
    const payload = {
      id: facilityId || uid("fac"),
      facilityType: document.getElementById("facility-type").value,
      sanctionedLimit: toNumber(document.getElementById("facility-sanctioned").value),
      drawingPower: toNumber(document.getElementById("facility-dp").value),
      currentUtilization: toNumber(document.getElementById("facility-utilization").value),
      interestRate: toNumber(document.getElementById("facility-rate").value),
      tenure: toNumber(document.getElementById("facility-tenure").value),
      collateralType: document.getElementById("facility-collateral").value,
      totalInterestPaid: toNumber(document.getElementById("facility-interest-paid").value),
      interestPayable: toNumber(document.getElementById("facility-interest-payable").value),
      renewalDate: document.getElementById("facility-renewal").value,
    };

    if (facilityId) {
      const idx = borrower.facilities.findIndex((f) => f.id === facilityId);
      borrower.facilities[idx] = payload;
    } else {
      borrower.facilities.push(payload);
    }

    saveData();
    document.getElementById("facility-dialog").close();
    renderAll();
  });

  document.getElementById("borrower-detail-content").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || !state.selectedBorrowerId) return;
    const borrower = getBorrowerById(state.selectedBorrowerId);
    if (!borrower) return;

    if (btn.dataset.action === "edit-facility") {
      const facility = borrower.facilities.find((f) => f.id === btn.dataset.facilityId);
      if (facility) openFacilityDialog(borrower.id, facility);
    }

    if (btn.dataset.action === "delete-facility") {
      const facility = borrower.facilities.find((f) => f.id === btn.dataset.facilityId);
      if (!facility || !window.confirm(`Delete ${FACILITY_LABELS[facility.facilityType] || facility.facilityType}?`)) return;
      borrower.facilities = borrower.facilities.filter((f) => f.id !== facility.id);
      saveData();
      renderAll();
    }
  });
}

function init() {
  loadData();
  bindEvents();
  renderAll();
}

init();
