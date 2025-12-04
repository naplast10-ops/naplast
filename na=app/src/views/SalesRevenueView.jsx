import { useState, useEffect, useMemo } from 'react';

const MY_VAT = '515396513';

const formatCurrency = (amount) => new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0
}).format(amount);

const parseDocDate = (value) => {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // make Monday the first day
  return addDays(d, diff);
};

const startOfMonth = (date) => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const formatPercentChange = (current, previous) => {
  if (previous === 0 && current === 0) return '0%';
  if (previous === 0) return '+∞%';
  const diff = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = diff.toFixed(1);
  return `${diff >= 0 ? '+' : ''}${rounded}%`;
};

const getDateKey = (date) => {
  const d = startOfDay(date);
  return d.toISOString().slice(0, 10);
};

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

const bytesToDataUrl = (bytes, extension) => {
  if (!bytes) return null;
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = window.btoa(binary);
  const mime = extension ? `image/${extension.toLowerCase()}` : 'image/png';
  return `data:${mime};base64,${base64}`;
};

export default function SalesRevenueView({ notes, clientsDB, productsDB }) {
  const [rangeKey, setRangeKey] = useState('month');

  const rangeOptions = {
    week: {
      label: 'השבוע',
      getStart: (today) => startOfWeek(today)
    },
    month: {
      label: 'החודש',
      getStart: (today) => startOfMonth(today)
    },
    quarter: {
      label: '3 חודשים אחרונים',
      getStart: (today) => addDays(today, -89)
    },
    year: {
      label: '12 חודשים אחרונים',
      getStart: (today) => addDays(today, -364)
    }
  };

  const today = startOfDay(new Date());
  const selectedRange = rangeOptions[rangeKey] || rangeOptions.month;
  const rangeStart = selectedRange.getStart(today);
  const rangeEnd = today;

  const notesWithDate = useMemo(
    () => notes.map(note => ({ ...note, parsedDate: parseDocDate(note.docDate) })).filter(note => note.parsedDate),
    [notes]
  );

  const rangeLengthInDays = Math.max(1, Math.round((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1);

  const filteredNotes = notesWithDate.filter(note => note.parsedDate >= rangeStart && note.parsedDate <= rangeEnd);

  const previousRangeEnd = addDays(rangeStart, -1);
  const previousRangeStart = addDays(rangeStart, -rangeLengthInDays);
  const previousNotes = notesWithDate.filter(note => note.parsedDate >= previousRangeStart && note.parsedDate <= previousRangeEnd);

  const sumRevenue = (list) => list.reduce((sum, note) => sum + note.totalRevenue, 0);
  const totalRevenue = sumRevenue(filteredNotes);
  const previousRevenue = sumRevenue(previousNotes);

  const orderCount = filteredNotes.length;
  const avgOrderValue = orderCount ? totalRevenue / orderCount : 0;

  const revenueByRegion = filteredNotes.reduce((acc, note) => {
    const region = note.region || clientsDB[note.clientKey || '']?.region || 'אחר';
    acc[region] = (acc[region] || 0) + note.totalRevenue;
    return acc;
  }, {});

  const productPerformance = filteredNotes.reduce((acc, note) => {
    note.items?.forEach(item => {
      const entry = acc[item.code] || {
        code: item.code,
        name: item.name,
        type: productsDB[item.code]?.type || 'לא ידוע',
        revenue: 0,
        quantity: 0
      };
      entry.revenue += item.revenue || 0;
      entry.quantity += item.pieces || item.amount || 0;
      acc[item.code] = entry;
    });
    return acc;
  }, {});

  const bestProducts = Object.values(productPerformance)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const worstProducts = Object.values(productPerformance)
    .filter(product => product.revenue > 0)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5);

  const clientPerformance = filteredNotes.reduce((acc, note) => {
    const key = note.clientKey || note.clientName;
    if (!acc[key]) {
      const displayName = clientsDB[key]?.name || note.clientName || key;
      acc[key] = {
        name: displayName,
        revenue: 0,
        orders: 0
      };
    }
    acc[key].revenue += note.totalRevenue;
    acc[key].orders += 1;
    return acc;
  }, {});

  const topClients = Object.values(clientPerformance)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const determineGranularity = () => {
    if (rangeLengthInDays <= 31) return 'day';
    if (rangeLengthInDays <= 120) return 'week';
    return 'month';
  };

  const granularity = determineGranularity();

  const trendBuckets = filteredNotes.reduce((acc, note) => {
    let bucketKey;
    let label;
    if (granularity === 'day') {
      bucketKey = getDateKey(note.parsedDate);
      label = note.parsedDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    } else if (granularity === 'week') {
      const weekStart = startOfWeek(note.parsedDate);
      bucketKey = `W-${getDateKey(weekStart)}`;
      label = `${weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`;
    } else {
      const monthStart = startOfMonth(note.parsedDate);
      bucketKey = `M-${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`;
      label = monthStart.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
    }

    if (!acc[bucketKey]) {
      acc[bucketKey] = { label, revenue: 0, orders: 0 };
    }
    acc[bucketKey].revenue += note.totalRevenue;
    acc[bucketKey].orders += 1;
    return acc;
  }, {});

  const trendData = Object.values(trendBuckets).sort((a, b) => a.label.localeCompare(b.label));
  const maxTrendRevenue = Math.max(...trendData.map(d => d.revenue), 1);

  const regionEntries = Object.entries(revenueByRegion).sort((a, b) => b[1] - a[1]);
  const totalRegionRevenue = regionEntries.reduce((sum, [, revenue]) => sum + revenue, 0);

  const growthPercent = formatPercentChange(totalRevenue, previousRevenue);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">💰 ניתוח מכירות והכנסות</h2>
          <p className="text-sm text-gray-500">עמוד ניתוח מכירות מפורט עם פילוחים אזוריים, לפי מוצר ולפי לקוח.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">טווח זמן:</label>
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            className="input-field w-48"
          >
            {Object.entries(rangeOptions).map(([key, option]) => (
              <option key={key} value={key}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-semibold">הכנסות בטווח הנבחר</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(totalRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">{growthPercent} לעומת התקופה הקודמת</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-emerald-100">
          <div className="text-sm text-emerald-600 font-semibold">ערך הזמנה ממוצע</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(avgOrderValue)}</div>
          <div className="mt-1 text-xs text-gray-500">{orderCount} הזמנות</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-purple-100">
          <div className="text-sm text-purple-600 font-semibold">מספר לקוחות פעילים</div>
          <div className="mt-2 text-3xl font-bold">{Object.keys(clientPerformance).length}</div>
          <div className="mt-1 text-xs text-gray-500">לקוחות שביצעו לפחות הזמנה אחת בטווח</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-orange-100">
          <div className="text-sm text-orange-600 font-semibold">מרווח רווח משוער</div>
          <div className="mt-2 text-3xl font-bold text-gray-400">N/A</div>
          <div className="mt-1 text-xs text-gray-500">הוסף עלויות מוצרים כדי לחשב רווח אמיתי</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">📈 מגמת הכנסות ({rangeOptions[rangeKey].label})</h3>
          <span className="text-xs text-gray-500">הכנסה ומספר הזמנות ביחידת זמן</span>
        </div>
        <div className="h-48 flex items-end gap-2">
          {trendData.length ? (
            trendData.map((entry, idx) => (
              <div key={`${entry.label}-${idx}`} className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t-full bg-gradient-to-t from-indigo-200 to-indigo-600" style={{ height: `${Math.max(4, (entry.revenue / maxTrendRevenue) * 100)}%` }} />
                <span className="mt-2 text-[10px] text-gray-400">{entry.label}</span>
                <span className="text-[10px] text-gray-300">{entry.orders} הזמנות</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">אין נתונים להצגה בטווח זה.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">📍 פילוח לפי אזורים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {regionEntries.length ? (
              regionEntries.map(([region, revenue]) => (
                <div key={region} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{region}</div>
                    <div className="text-xs text-gray-500">{((revenue / totalRegionRevenue) * 100).toFixed(1)}% מההכנסות</div>
                  </div>
                  <div className="font-bold text-blue-600">{formatCurrency(revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין נתוני מכירות לפי אזור.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">🏆 לקוחות מובילים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {topClients.length ? (
              topClients.map((client, idx) => (
                <div key={client.name} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">#{idx + 1} {client.name}</div>
                    <div className="text-xs text-gray-500">{client.orders} הזמנות</div>
                  </div>
                  <div className="font-bold text-green-600">{formatCurrency(client.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין לקוחות מובילים בטווח זה.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">🔥 מוצרים מובילים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {bestProducts.length ? (
              bestProducts.map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.type} • {product.quantity} יחידות</div>
                  </div>
                  <div className="font-bold text-purple-600">{formatCurrency(product.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין נתונים למוצרים בטווח זה.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">📉 מוצרים דורשים תשומת לב</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {worstProducts.length ? (
              worstProducts.map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.type} • {product.quantity} יחידות</div>
                  </div>
                  <div className="font-bold text-red-600">{formatCurrency(product.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין מספיק נתונים לזיהוי מוצרים חלשים.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

