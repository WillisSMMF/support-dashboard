/* ==========================================================================
   MANTIS DASHBOARD ENGINE CORE LOGIC
   ========================================================================== */

// URL Google Sheet yang dipublish sebagai CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=408991878&single=true&output=csv';

// Global Memory State Variables
let masterTickets = [];
let filteredTickets = [];
let activeCharts = {};

// Pagination & Sort States
let currentPage = 1;
const rowsPerPage = 12;
let sortColumn = 'id';
let sortDirection = 'desc';

// Chart Theme Palette Colors
const chartColors = ['#6366f1', '#8b5cf6', '#22d3ee', '#10b981', '#f59e0b', '#f43f5e', '#ec4899', '#3b82f6', '#14b8a6', '#a855f7'];

document.addEventListener('DOMContentLoaded', () => {
  setupTabNavigation();
  fetchSpreadsheetData();
});

// Setup Mekanisme Tab SPA Navigation
function setupTabNavigation() {
  document.querySelectorAll('.menu-item').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.remove('active'));
      
      button.classList.add('active');
      const targetSection = button.dataset.section;
      document.getElementById(`section-${targetSection}`).classList.add('active');
      
      // Update Header Text Topbar
      document.getElementById('pageTitle').innerText = button.innerText.substring(3);
      
      // Render Charts Khusus Setiap Tab Aktif demi Performa Rendering
      triggerSectionSpecificRender(targetSection);
    });
  });
}

// Fetch dan Parsing Data Google Sheets (PapaParse Engine)
function fetchSpreadsheetData() {
  const statusBadge = document.getElementById('loadStatus');
  statusBadge.className = 'status-badge loading';
  statusBadge.innerText = 'Memuat Data...';

  Papa.parse(SHEET_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      if (results.data && results.data.length > 0) {
        masterTickets = normalizeData(results.data);
        filteredTickets = [...masterTickets];
        
        statusBadge.className = 'status-badge success';
        statusBadge.innerText = '⚡ Terhubung';
        
        // Populate Dropdowns Filter Utama
        populateFilterDropdowns();
        
        // Render Awal Section Overview
        triggerSectionSpecificRender('overview');
      } else {
        showLoadingError();
      }
    },
    error: function() {
      showLoadingError();
    }
  });
}

function refreshData() {
  fetchSpreadsheetData();
}

function showLoadingError() {
  const statusBadge = document.getElementById('loadStatus');
  statusBadge.className = 'status-badge text-danger';
  statusBadge.innerText = '❌ Gagal Sync';
}

// Data Normalization Engine (Mengamankan anomali beda struktur header kolom)
function normalizeData(rawData) {
  return rawData.map((row, index) => {
    const findValue = (possibleHeaders) => {
      for (let header of possibleHeaders) {
        if (row[header] !== undefined) return row[header].trim();
        // Fallback case-insensitive
        let foundKey = Object.keys(row).find(k => k.toLowerCase().trim() === header.toLowerCase().trim());
        if (foundKey) return row[foundKey].trim();
      }
      return '';
    };

    let id = findValue(['Id', 'Ticket Id']) || `T-${1000 + index}`;
    let status = findValue(['Status']) || 'open';
    let rootCause = findValue(['Root Cause', 'RootCause', 'Root_Cause']) || 'Unassigned';
    let category = findValue(['Category', 'Kategori']) || 'Others';
    let product = findValue(['Product Source', 'Issued Product', 'Product']) || 'Mufins';
    let branch = findValue(['Branch Name', 'Branch', 'Cabang']) || 'KPNO';
    
    let slaVal = findValue(['SLA', 'Sla Days']);
    let sla = slaVal !== '' ? parseFloat(slaVal) : 0;
    if (isNaN(sla)) sla = 0;

    let summary = findValue(['Summary', 'Ringkasan']) || '-';
    let assignee = findValue(['Assigned To', 'AssignedTo']) || 'Unassigned';
    let dateSubmitted = findValue(['Date Submitted', 'DateSubmitted', 'Tanggal']);

    // Manajemen Parsing Nama Bulan Tren
    let month = findValue(['Month', 'Months', 'Month_DD_Name', 'Month_Name']);
    if (!month && dateSubmitted) {
      const d = new Date(dateSubmitted);
      if (!isNaN(d.getTime())) {
        const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        month = `${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
    if (!month || month === '0' || month === '') month = 'Lain-lain';

    return { id, status, rootCause, category, product, branch, sla, summary, assignee, month };
  });
}

// Sinkronisasi Penghancuran Canvas Lama (Anti Chart-Overlap Bug)
function createCleanChart(canvasId, config) {
  if (activeCharts[canvasId]) {
    activeCharts[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId).getContext('2d');
  activeCharts[canvasId] = new Chart(ctx, config);
}

// Router Trigger Rendering Berdasarkan Section Tab Aktif
function triggerSectionSpecificRender(section) {
  if (masterTickets.length === 0) return;
  
  switch(section) {
    case 'overview':
      renderOverviewKPIs();
      renderOverviewCharts();
      break;
    case 'tiket':
      currentPage = 1;
      renderTicketTable();
      break;
    case 'sla':
      renderSlaKPIs();
      renderSlaCharts();
      break;
    case 'cabang':
      renderCabangSection();
      break;
  }
}

// Populate Dropdown Filter Tabel & Cabang
function populateFilterDropdowns() {
  const statuses = [...new Set(masterTickets.map(t => t.status))].filter(Boolean);
  const rootCauses = [...new Set(masterTickets.map(t => t.rootCause))].filter(Boolean);
  const branches = [...new Set(masterTickets.map(t => t.branch))].filter(Boolean).sort();

  // Populate Status Filter
  const fStatus = document.getElementById('filterStatus');
  fStatus.innerHTML = '<option value="">Semua Status</option>';
  statuses.forEach(s => fStatus.innerHTML += `<option value="${s}">${s.toUpperCase()}</option>`);

  // Populate Root Cause Filter
  const fRc = document.getElementById('filterRootCause');
  fRc.innerHTML = '<option value="">Semua Root Cause</option>';
  rootCauses.forEach(rc => fRc.innerHTML += `<option value="${rc}">${rc}</option>`);

  // Populate Branch dropdown Analisis Lanjutan
  const bSelect = document.getElementById('branchSelect');
  bSelect.innerHTML = '<option value="ALL">Semua Cabang (Kumulatif)</option>';
  branches.forEach(b => bSelect.innerHTML += `<option value="${b}">${b}</option>`);
}

/* ================= UTILITY COUNTER DATA ENGINE ================= */
function getAggregatedData(data, key) {
  let counts = {};
  data.forEach(item => { counts[item[key]] = (counts[item[key]] || 0) + 1; });
  return counts;
}

function getAverageSlaData(data, key) {
  let groups = {};
  data.forEach(item => {
    if (!groups[item[key]]) groups[item[key]] = { totalSla: 0, count: 0 };
    groups[item[key]].totalSla += item.sla;
    groups[item[key]].count += 1;
  });
  
  let averages = {};
  for (let g in groups) {
    averages[g] = parseFloat((groups[g].totalSla / groups[g].count).toFixed(1));
  }
  return averages;
}

/* ================= SECTION 1: LOGIK ENGINE OVERVIEW ================= */
function renderOverviewKPIs() {
  const total = masterTickets.length;
  const resolved = masterTickets.filter(t => t.status.toLowerCase() === 'resolved' || t.status.toLowerCase() === 'fixed' || t.status.toLowerCase() === 'closed').length;
  const open = total - resolved;
  const avgSla = masterTickets.reduce((acc, curr) => acc + curr.sla, 0) / total;

  document.getElementById('kpi-total').innerText = total.toLocaleString('id-ID');
  document.getElementById('kpi-resolved').innerText = resolved.toLocaleString('id-ID');
  document.getElementById('kpi-open').innerText = open.toLocaleString('id-ID');
  document.getElementById('kpi-avg-sla').innerText = avgSla.toFixed(1);
}

function renderOverviewCharts() {
  // 1. Tren per Bulan (Line Chart)
  const monthData = getAggregatedData(masterTickets, 'month');
  createCleanChart('chartTrend', {
    type: 'line',
    data: {
      labels: Object.keys(monthData),
      datasets: [{ label: 'Volume Tiket', data: Object.values(monthData), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.3 }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // 2. Status Donut Chart
  const statusData = getAggregatedData(masterTickets, 'status');
  createCleanChart('chartStatus', {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusData).map(s => s.toUpperCase()),
      datasets: [{ data: Object.values(statusData), backgroundColor: chartColors }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 3. Top Kategori (Horizontal Bar)
  const catData = Object.entries(getAggregatedData(masterTickets, 'category'))
                        .sort((a,b) => b[1] - a[1]).slice(0, 7);
  createCleanChart('chartCategory', {
    type: 'bar',
    data: {
      labels: catData.map(c => c[0]),
      datasets: [{ label: 'Jumlah Masalah', data: catData.map(c => c[1]), backgroundColor: '#8b5cf6' }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
  });

  // 4. Root Cause
  const rcData = getAggregatedData(masterTickets, 'rootCause');
  createCleanChart('chartRootCause', {
    type: 'pie',
    data: {
      labels: Object.keys(rcData),
      datasets: [{ data: Object.values(rcData), backgroundColor: ['#10b981', '#f59e0b', '#f43f5e', '#6366f1'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 5. Per Produk
  const prodData = getAggregatedData(masterTickets, 'product');
  createCleanChart('chartProduct', {
    type: 'bar',
    data: {
      labels: Object.keys(prodData),
      datasets: [{ label: 'Tiket', data: Object.values(prodData), backgroundColor: '#22d3ee' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* ================= SECTION 2: DAFTAR TIKET TABLE ENGINE ================= */
function handleTableFilter() {
  const keyword = document.getElementById('tableSearch').value.toLowerCase();
  const statusFilter = document.getElementById('filterStatus').value;
  const rcFilter = document.getElementById('filterRootCause').value;

  filteredTickets = masterTickets.filter(t => {
    const matchKeyword = t.id.toLowerCase().includes(keyword) || 
                         t.summary.toLowerCase().includes(keyword) || 
                         t.assignee.toLowerCase().includes(keyword) || 
                         t.branch.toLowerCase().includes(keyword);
    const matchStatus = statusFilter === "" || t.status === statusFilter;
    const matchRc = rcFilter === "" || t.rootCause === rcFilter;
    
    return matchKeyword && matchStatus && matchRc;
  });

  currentPage = 1;
  renderTicketTable();
}

// Pengurutan Kolom Tabel Dinamis
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.col;
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
    
    filteredTickets.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];
      
      if(typeof valA === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      } else {
        return sortDirection === 'asc' ? 
          String(valA).localeCompare(String(valB)) : 
          String(valB).localeCompare(String(valA));
      }
    });

    renderTicketTable();
  });
});

function renderTicketTable() {
  const tbody = document.getElementById('ticketTableBody');
  tbody.innerHTML = '';

  const total = filteredTickets.length;
  if(total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">Tidak ada data tiket yang cocok dengan filter.</td></tr>`;
    document.getElementById('paginationInfo').innerText = `Menampilkan 0 dari 0 data`;
    document.getElementById('paginationControls').innerHTML = '';
    return;
  }

  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, total);
  const pageItems = filteredTickets.slice(startIdx, endIdx);

  pageItems.forEach(t => {
    let statusClass = 'open';
    if(['resolved', 'fixed', 'closed'].includes(t.status.toLowerCase())) statusClass = 'resolved';
    if(['assigned', 'feedback'].includes(t.status.toLowerCase())) statusClass = t.status.toLowerCase();

    tbody.innerHTML += `
      <tr>
        <td><strong>#${t.id}</strong></td>
        <td><span title="${t.summary}">${t.summary.length > 55 ? t.summary.substring(0, 52) + '...' : t.summary}</span></td>
        <td><span class="badge ${statusClass}">${t.status}</span></td>
        <td>${t.category}</td>
        <td>${t.rootCause}</td>
        <td>${t.assignee}</td>
        <td>${t.branch}</td>
        <td><strong>${t.sla}</strong></td>
      </tr>
    `;
  });

  document.getElementById('paginationInfo').innerText = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${total} data`;
  renderPaginationControls(total);
}

function renderPaginationControls(totalItems) {
  const controls = document.getElementById('paginationControls');
  controls.innerHTML = '';
  const totalPages = Math.ceil(totalItems / rowsPerPage);

  if (totalPages <= 1) return;

  const btnPrev = document.createElement('button');
  btnPrev.className = 'page-btn';
  btnPrev.innerText = 'Sebelumnya';
  btnPrev.disabled = currentPage === 1;
  btnPrev.onclick = () => { currentPage--; renderTicketTable(); };
  controls.appendChild(btnPrev);

  // Render Pintasan Halaman Maksimal 5 Tombol
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  for(let i = startPage; i <= endPage; i++) {
    const btnPage = document.createElement('button');
    btnPage.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btnPage.innerText = i;
    btnPage.onclick = () => { currentPage = i; renderTicketTable(); };
    controls.appendChild(btnPage);
  }

  const btnNext = document.createElement('button');
  btnNext.className = 'page-btn';
  btnNext.innerText = 'Selanjutnya';
  btnNext.disabled = currentPage === totalPages;
  btnNext.onclick = () => { currentPage++; renderTicketTable(); };
  controls.appendChild(btnNext);
}

/* ================= SECTION 3: ANALISIS SLA ENGINE ================= */
function renderSlaKPIs() {
  const total = masterTickets.length;
  const s1 = masterTickets.filter(t => t.sla <= 1).length;
  const s2 = masterTickets.filter(t => t.sla > 1 && t.sla <= 3).length;
  const s3 = masterTickets.filter(t => t.sla > 3).length;

  document.getElementById('sla-bucket-1').innerText = ((s1 / total) * 100).toFixed(1) + '%';
  document.getElementById('sla-bucket-2').innerText = ((s2 / total) * 100).toFixed(1) + '%';
  document.getElementById('sla-bucket-3').innerText = ((s3 / total) * 100).toFixed(1) + '%';
}

function renderSlaCharts() {
  const total = masterTickets.length;
  const s1 = masterTickets.filter(t => t.sla <= 1).length;
  const s2 = masterTickets.filter(t => t.sla > 1 && t.sla <= 3).length;
  const s3 = masterTickets.filter(t => t.sla > 3).length;

  // 1. Distribusi Bucket SLA
  createCleanChart('chartSlaDist', {
    type: 'bar',
    data: {
      labels: ['≤ 1 Hari (Bagus)', '2-3 Hari (Sedang)', '> 3 Hari (Terlambat)'],
      datasets: [{ label: 'Jumlah Kasus', data: [s1, s2, s3], backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // 2. Avg SLA bulanan
  const avgSlaMonth = getAverageSlaData(masterTickets, 'month');
  createCleanChart('chartSlaMonth', {
    type: 'line',
    data: {
      labels: Object.keys(avgSlaMonth),
      datasets: [{ label: 'Rerata Durasi (Hari)', data: Object.values(avgSlaMonth), borderColor: '#22d3ee', fill: false, tension: 0.2 }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // 3. Avg SLA per Assignee (Top 15 Terbanyak Menangani Tiket)
  const topAssignees = Object.entries(getAggregatedData(masterTickets, 'assignee'))
                             .sort((a,b) => b[1] - a[1]).slice(0, 15).map(arr => arr[0]);
  const avgSlaAssignee = getAverageSlaData(masterTickets, 'assignee');
  
  let targetAssigneeData = {};
  topAssignees.forEach(name => { targetAssigneeData[name] = avgSlaAssignee[name] || 0; });

  createCleanChart('chartSlaAssignee', {
    type: 'bar',
    data: {
      labels: Object.keys(targetAssigneeData),
      datasets: [{ label: 'Rerata SLA (Hari)', data: Object.values(targetAssigneeData), backgroundColor: '#8b5cf6' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // 4. Avg SLA per Produk
  const avgSlaProd = getAverageSlaData(masterTickets, 'product');
  createCleanChart('chartSlaProduct', {
    type: 'bar',
    data: {
      labels: Object.keys(avgSlaProd),
      datasets: [{ label: 'Rerata SLA (Hari)', data: Object.values(avgSlaProd), backgroundColor: '#6366f1' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* ================= SECTION 4: ANALISIS CABANG (DYNAMICS) ================= */
function renderCabangSection() {
  // Hitung volume per cabang & ambil Top 20
  const branchCounts = Object.entries(getAggregatedData(masterTickets, 'branch'))
                             .sort((a,b) => b[1] - a[1]).slice(0, 20);
  const top20BranchNames = branchCounts.map(b => b[0]);

  // Siapkan dataset multi-layer stacked berdasarkan status unik
  const statuses = [...new Set(masterTickets.map(t => t.status))];
  
  const stackedDatasets = statuses.map((status, idx) => {
    const dataPoints = top20BranchNames.map(branch => {
      return masterTickets.filter(t => t.branch === branch && t.status === status).length;
    });
    return {
      label: status.toUpperCase(),
      data: dataPoints,
      backgroundColor: chartColors[idx % chartColors.length]
    };
  });

  // 1. Render Chart Utama Stacked Bar Top 20 Cabang
  createCleanChart('chartBranchTop20', {
    type: 'bar',
    data: {
      labels: top20BranchNames,
      datasets: stackedDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Render sub-chart cabang default (Kumulatif SEMUA)
  handleBranchSpecificAnalysis();
}

// Analisis Interaktif Lanjutan Kategori & Root Cause Khusus Cabang Pilihan Dropdown
function handleBranchSpecificAnalysis() {
  const selectedBranch = document.getElementById('branchSelect').value;
  
  // Saring data berdasarkan cabang terpilih
  const filteredSource = selectedBranch === 'ALL' ? 
    masterTickets : masterTickets.filter(t => t.branch === selectedBranch);

  // 2. Kategori per Cabang
  const catData = Object.entries(getAggregatedData(filteredSource, 'category'))
                        .sort((a,b) => b[1] - a[1]).slice(0, 8);
  createCleanChart('chartBranchCat', {
    type: 'bar',
    data: {
      labels: catData.map(c => c[0]),
      datasets: [{ label: `Volume (${selectedBranch})`, data: catData.map(c => c[1]), backgroundColor: '#8b5cf6' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // 3. Root Cause per Cabang
  const rcData = getAggregatedData(filteredSource, 'rootCause');
  createCleanChart('chartBranchRc', {
    type: 'bar',
    data: {
      labels: Object.keys(rcData),
      datasets: [{ label: 'Distribusi', data: Object.values(rcData), backgroundColor: '#10b981' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}