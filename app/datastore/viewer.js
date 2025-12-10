// Datastore Viewer
import api from '../api.js';

console.log('datastore viewer loading');

const tables = ['addresses', 'visits', 'content', 'tags', 'blobs', 'scripts_data', 'feeds'];

let currentTable = null;
let datastoreApi = null;

// Format timestamp to readable date
const formatTimestamp = (ts) => {
  if (!ts) return '-';
  const date = new Date(ts);
  return date.toLocaleString();
};

// Format cell value for display
const formatCell = (key, value) => {
  if (value === null || value === undefined) return '-';

  // Timestamps
  if (key.includes('At') || key === 'timestamp') {
    return formatTimestamp(value);
  }

  // URLs
  if (key === 'uri' || key.includes('url') || key.includes('address')) {
    return value;
  }

  // JSON fields
  if (key === 'metadata') {
    try {
      const parsed = JSON.parse(value);
      return Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : '-';
    } catch {
      return value || '-';
    }
  }

  // Boolean-like numbers
  if (key === 'starred' || key === 'archived' || key === 'synced' || key === 'enabled' || key === 'interacted' || key === 'changed') {
    return value === 1 ? 'Yes' : 'No';
  }

  return String(value);
};

// Get CSS class for cell
const getCellClass = (key) => {
  if (key === 'id') return 'cell-id';
  if (key.includes('At') || key === 'timestamp') return 'cell-timestamp';
  if (key === 'uri' || key.includes('url')) return 'cell-url';
  return '';
};

// Render table list in sidebar
const renderTableList = async () => {
  const tableList = document.getElementById('tableList');
  tableList.innerHTML = '';

  for (const tableName of tables) {
    const item = document.createElement('div');
    item.className = 'table-item' + (currentTable === tableName ? ' active' : '');

    const name = document.createElement('span');
    name.textContent = tableName;
    item.appendChild(name);

    // Get row count
    let count = 0;
    if (datastoreApi) {
      try {
        const result = await datastoreApi.getTable(tableName);
        count = result ? Object.keys(result).length : 0;
      } catch (e) {
        console.error('Error getting table count:', e);
      }
    }

    const countEl = document.createElement('span');
    countEl.className = 'table-count';
    countEl.textContent = count;
    item.appendChild(countEl);

    item.addEventListener('click', () => showTable(tableName));
    tableList.appendChild(item);
  }
};

// Render overview stats
const renderOverview = async () => {
  const statsArea = document.getElementById('statsArea');
  const tableContainer = document.getElementById('tableContainer');
  const tableTitle = document.getElementById('tableTitle');

  tableTitle.textContent = 'Overview';

  // Get stats
  let stats = {};
  if (datastoreApi) {
    try {
      stats = await datastoreApi.getStats();
    } catch (e) {
      console.error('Error getting stats:', e);
    }
  }

  statsArea.innerHTML = '';

  const statItems = [
    { label: 'Addresses', value: stats.totalAddresses || 0 },
    { label: 'Visits', value: stats.totalVisits || 0 },
    { label: 'Content', value: stats.totalContent || 0 },
  ];

  statItems.forEach(({ label, value }) => {
    const stat = document.createElement('div');
    stat.className = 'stat';
    stat.innerHTML = `
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    `;
    statsArea.appendChild(stat);
  });

  // Show overview content
  tableContainer.innerHTML = `
    <div class="empty-state">
      <h3>Datastore Viewer</h3>
      <p>Select a table from the sidebar to view its contents.</p>
      <p style="margin-top: 16px; font-size: 12px;">
        The datastore is currently in-memory only and resets on app restart.
      </p>
    </div>
  `;
};

// Show table data
const showTable = async (tableName) => {
  currentTable = tableName;

  const statsArea = document.getElementById('statsArea');
  const tableContainer = document.getElementById('tableContainer');
  const tableTitle = document.getElementById('tableTitle');

  tableTitle.textContent = tableName;

  // Update sidebar active state
  document.querySelectorAll('.table-item').forEach(item => {
    item.classList.remove('active');
    if (item.querySelector('span').textContent === tableName) {
      item.classList.add('active');
    }
  });

  // Show refresh button in stats area
  statsArea.innerHTML = `
    <button class="refresh-btn" id="refreshBtn">Refresh</button>
  `;
  document.getElementById('refreshBtn').addEventListener('click', () => showTable(tableName));

  // Get table data
  let tableData = {};
  if (datastoreApi) {
    try {
      tableData = await datastoreApi.getTable(tableName) || {};
    } catch (e) {
      console.error('Error getting table data:', e);
    }
  }

  const rows = Object.entries(tableData);

  if (rows.length === 0) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <h3>No data</h3>
        <p>The ${tableName} table is empty.</p>
      </div>
    `;
    return;
  }

  // Get all columns from first row
  const columns = ['id', ...Object.keys(rows[0][1])];

  // Build table HTML
  let html = '<table class="data-table"><thead><tr>';
  columns.forEach(col => {
    html += `<th>${col}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach(([id, row]) => {
    html += '<tr>';
    columns.forEach(col => {
      const value = col === 'id' ? id : row[col];
      const cellClass = getCellClass(col);
      const formatted = formatCell(col, value);
      html += `<td class="${cellClass}" title="${formatted}">${formatted}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  tableContainer.innerHTML = html;
};

// Initialize
const init = async () => {
  console.log('datastore viewer init');

  // Set up back link
  document.getElementById('backLink').addEventListener('click', () => {
    window.close();
  });

  // Get datastore API from main process
  if (api.datastore) {
    datastoreApi = api.datastore;
    console.log('datastore api available');
  } else {
    console.warn('datastore api not available');
  }

  await renderTableList();
  await renderOverview();
};

window.addEventListener('load', init);
