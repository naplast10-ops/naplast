
// -------------------------------
// Pure Analytics Engine for NA KASEM CRM
// -------------------------------

// Utility: parse dd/mm/yy into JS Date
function parseDocDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yy] = parts.map((x) => parseInt(x, 10));
  if (!dd || !mm || isNaN(yy)) return null;
  return new Date(2000 + yy, mm - 1, dd);
}

// Filter notes by date range
export function filterNotesByRange(notes, { from, to }) {
  if (!from || !to) return notes;
  return notes.filter((n) => {
    const d = parseDocDate(n.docDate);
    if (!d) return false;
    return d >= from && d <= to;
  });
}

// -------------------------------
// A. Summary KPIs
// -------------------------------
export function getSalesSummary(notes) {
  const totalRevenue = notes.reduce((sum, n) => sum + (n.totalRevenue || 0), 0);
  const orderCount   = notes.length;
  const avgOrderValue = orderCount > 0 ? (totalRevenue / orderCount) : 0;

  return {
    totalRevenue,
    orderCount,
    avgOrderValue,
  };
}

// -------------------------------
// B. Sales by Region
// -------------------------------
export function getSalesByRegion(notes, clientsDB) {
  const regionMap = {};

  for (const note of notes) {
    const client = clientsDB.find((c) => c.id === note.clientId);
    const region = client?.region || note.region || "לא מוגדר";

    regionMap[region] = (regionMap[region] || 0) + (note.totalRevenue || 0);
  }

  return Object.entries(regionMap)
    .map(([region, revenue]) => ({ region, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

// -------------------------------
// C. Product Performance
// -------------------------------
export function getSalesByProduct(notes) {
  const map = {};

  for (const note of notes) {
    for (const item of note.items || []) {
      const code = item.code || item.sku || "unknown";
      if (!map[code]) {
        map[code] = {
          code,
          name: item.name || item.description || code,
          quantity: 0,
          revenue: 0,
        };
      }
      map[code].quantity += item.quantity || 0;
      map[code].revenue  += item.revenue  || 0;
    }
  }

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue);
}

// -------------------------------
// D. Sales by Client
// -------------------------------
export function getSalesByClient(notes, clientsDB) {
  const map = {};

  for (const note of notes) {
    const clientId = note.clientId || "unknown";
    if (!map[clientId]) {
      const c = clientsDB.find((x) => x.id === clientId);
      map[clientId] = {
        clientId,
        clientName: c ? c.name : note.clientName || "לא מזוהה",
        orders: 0,
        revenue: 0,
      };
    }

    map[clientId].orders += 1;
    map[clientId].revenue += note.totalRevenue || 0;
  }

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue);
}

// -------------------------------
// E. Timeline (graph analytics)
// granularity: "day" | "week" | "month"
// -------------------------------
export function getSalesTimeline(notes, granularity = "day") {
  const bucket = {};

  for (const note of notes) {
    const d = parseDocDate(note.docDate);
    if (!d) continue;

    let key;

    if (granularity === "day") {
      key = d.toISOString().slice(0, 10);
    } else if (granularity === "week") {
      const week = Math.floor((d.getDate() - 1) / 7) + 1;
      key = `${d.getFullYear()}-${d.getMonth() + 1}-W${week}`;
    } else if (granularity === "month") {
      key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    } else {
      key = d.toISOString().slice(0, 10);
    }

    bucket[key] = (bucket[key] || 0) + (note.totalRevenue || 0);
  }

  return Object.entries(bucket)
    .map(([label, revenue]) => ({ label, revenue }))
    .sort((a, b) => a.label.localeCompare(b.label, "he-IL"));
}
