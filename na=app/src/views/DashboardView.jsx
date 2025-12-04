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

export default function DashboardView({ notes, clientsDB, productsDB, onNavigate, onDeleteNote }) {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEnd = addDays(weekStart, -1);
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = startOfMonth(lastMonthEnd);
  const sixtyDaysAgo = addDays(today, -60);

  const clientsByName = useMemo(
    () => Object.fromEntries(Object.entries(clientsDB).map(([key, client]) => [client.name, key])),
    [clientsDB]
  );

  const notesWithDate = notes
    .map(note => ({ ...note, parsedDate: parseDocDate(note.docDate) }))
    .filter(note => note.parsedDate);

  const revenueByDate = notesWithDate.reduce((acc, note) => {
    const key = getDateKey(note.parsedDate);
    acc[key] = (acc[key] || 0) + note.totalRevenue;
    return acc;
  }, {});

  const reducerForRange = (start, end) => {
    return notesWithDate.reduce((sum, note) => {
      if (note.parsedDate >= start && note.parsedDate <= end) {
        return sum + note.totalRevenue;
      }
      return sum;
    }, 0);
  };

  const filterNotesInRange = (start, end) => notesWithDate.filter(note => note.parsedDate >= start && note.parsedDate <= end);

  const todayRevenue = reducerForRange(today, today);
  const yesterdayRevenue = reducerForRange(yesterday, yesterday);
  const ordersToday = filterNotesInRange(today, today).length;
  const ordersYesterday = filterNotesInRange(yesterday, yesterday).length;

  const weekRevenue = reducerForRange(weekStart, today);
  const lastWeekRevenue = reducerForRange(lastWeekStart, lastWeekEnd);

  const monthRevenue = reducerForRange(monthStart, today);
  const lastMonthRevenue = reducerForRange(lastMonthStart, lastMonthEnd);

  const weekNotes = filterNotesInRange(weekStart, today);
  const monthNotes = filterNotesInRange(monthStart, today);

  const trendData = Array.from({ length: 30 }, (_, idx) => {
    const date = addDays(today, -(29 - idx));
    const key = getDateKey(date);
    return {
      date,
      label: date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
      revenue: revenueByDate[key] || 0
    };
  });
  const maxTrendRevenue = Math.max(...trendData.map(d => d.revenue), 1);

  const clientAggregates = notesWithDate.reduce((acc, note) => {
    const key = note.clientKey || clientsByName[note.clientName] || note.clientKey || note.clientName;
    if (!key) return acc;
    if (!acc[key]) {
      acc[key] = {
        clientName: note.clientName,
        totalRevenue: 0,
        orders: 0,
        lastOrderDate: note.parsedDate
      };
    }
    acc[key].totalRevenue += note.totalRevenue;
    acc[key].orders += 1;
    if (note.parsedDate > acc[key].lastOrderDate) {
      acc[key].lastOrderDate = note.parsedDate;
    }
    return acc;
  }, {});

  const topClientsThisMonth = monthNotes.reduce((acc, note) => {
    const key = note.clientKey || clientsByName[note.clientName] || note.clientName;
    if (!key) return acc;
    if (!acc[key]) {
      const displayName = clientsDB[key]?.name || note.clientName || key;
      acc[key] = { name: displayName, revenue: 0, orders: 0 };
    }
    acc[key].revenue += note.totalRevenue;
    acc[key].orders += 1;
    return acc;
  }, {});

  const topClientsList = Object.values(topClientsThisMonth)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const staleClients = Object.entries(clientsDB)
    .map(([key, client]) => {
      const stats = clientAggregates[key];
      return {
        key,
        name: client.name,
        lastOrderDate: stats?.lastOrderDate || null
      };
    })
    .filter(entry => !entry.lastOrderDate || entry.lastOrderDate < sixtyDaysAgo);

  const lowStockProducts = Object.entries(productsDB)
    .filter(([, product]) => product.stock !== undefined && product.reorderThreshold !== undefined && product.stock <= product.reorderThreshold);

  const alerts = [];
  if (staleClients.length) {
    const preview = staleClients.slice(0, 3).map(c => c.name).join(', ');
    alerts.push({
      icon: '⏱️',
      title: 'לקוחות שלא הזמינו בזמן האחרון',
      description: `${staleClients.length} לקוחות לא הזמינו מעל 60 ימים. ${preview}${staleClients.length > 3 ? ' ועוד.' : ''}`
    });
  }
  if (lowStockProducts.length) {
    const preview = lowStockProducts.slice(0, 2).map(([code, product]) => `${product.name} (${code})`).join(', ');
    alerts.push({
      icon: '📦',
      title: 'מלאי נמוך',
      description: `${lowStockProducts.length} מוצרים קרובים לאפס מלאי: ${preview}${lowStockProducts.length > 2 ? ' ועוד.' : ''}`
    });
  }
  if (!alerts.length) {
    alerts.push({
      icon: '✅',
      title: 'אין התרעות דחופות',
      description: 'כל המערכות נראות מצוין. המשך כך!'
    });
  }

  const quickActions = [
    { label: '📸 סרוק תעודה חדשה', target: 'ocr' },
    { label: '➕ הוסף לקוח', target: 'clients' },
    { label: '💰 נתח מכירות', target: 'sales' },
    { label: '📦 נהל מוצרים', target: 'products' }
  ];

  const recentActivity = [...notesWithDate]
    .sort((a, b) => b.parsedDate - a.parsedDate)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">📊 תמונת מצב יומית</h2>
            <p className="text-sm text-gray-500">מעודכן ל- {today.toLocaleDateString('he-IL')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={() => onNavigate(action.target)}
                className="btn-primary text-sm"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-semibold">הכנסות היום</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(todayRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">{formatPercentChange(todayRevenue, yesterdayRevenue)} לעומת אתמול</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-emerald-100">
          <div className="text-sm text-emerald-600 font-semibold">הזמנות היום</div>
          <div className="mt-2 text-3xl font-bold">{ordersToday}</div>
          <div className="mt-1 text-xs text-gray-500">{formatPercentChange(ordersToday, ordersYesterday)} לעומת אתמול</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-purple-100">
          <div className="text-sm text-purple-600 font-semibold">הכנסות השבוע</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(weekRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">{formatPercentChange(weekRevenue, lastWeekRevenue)} לעומת שבוע קודם</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-orange-100">
          <div className="text-sm text-orange-600 font-semibold">הכנסות החודש</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(monthRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">{formatPercentChange(monthRevenue, lastMonthRevenue)} לעומת חודש קודם</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">📈 מגמת הכנסות (30 הימים האחרונים)</h3>
            <span className="text-xs text-gray-500">סכום יומי</span>
          </div>
          <div className="h-40 flex items-end gap-1">
            {trendData.map(entry => (
              <div key={entry.label} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-t-full bg-gradient-to-t from-blue-200 to-blue-600"
                  style={{ height: `${Math.max(4, (entry.revenue / maxTrendRevenue) * 100)}%` }}
                  title={`${entry.label}: ${formatCurrency(entry.revenue)}`}
                />
                <span className="mt-2 text-[10px] text-gray-400">{entry.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-lg border border-amber-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">🏆 הלקוחות המובילים החודש</h3>
            <div className="mt-4 space-y-3">
              {topClientsList.length ? (
                topClientsList.map((client, idx) => (
                  <div key={client.name} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-semibold text-gray-800">#{idx + 1} {client.name}</div>
                      <div className="text-xs text-gray-500">{client.orders} הזמנות</div>
                    </div>
                    <div className="font-bold text-blue-600">{formatCurrency(client.revenue)}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">עוד לא נסרקו תעודות החודש.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg border border-red-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">⚠️ התרעות חשובות</h3>
            <ul className="mt-4 space-y-3 text-sm text-gray-600">
              {alerts.map(alert => (
                <li key={alert.title} className="flex gap-2">
                  <span className="text-lg">{alert.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-800">{alert.title}</div>
                    <div className="text-xs text-gray-500">{alert.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">📅 פעילות אחרונה</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {recentActivity.length ? (
              recentActivity.map(note => (
                <div key={note.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-800">{note.clientName}</div>
                    <div className="text-xs text-gray-500">{note.docDate}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                    <span>#{note.docNum || '—'}</span>
                    <span>{note.items?.length || 0} פריטים</span>
                    <span>{formatCurrency(note.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => onDeleteNote(note.id)} className="text-xs text-red-500 hover:underline">
                      מחק רישום
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">עוד לא קיימת פעילות להצגה.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">🗺️ סיכום אזורי (שבוע נוכחי)</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {['מרכז', 'משולש', 'צפון'].map(region => {
              const regionRevenue = weekNotes
                .filter(note => note.region === region)
                .reduce((sum, note) => sum + note.totalRevenue, 0);
              const regionOrders = weekNotes.filter(note => note.region === region).length;
              return (
                <div key={region} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{region}</div>
                    <div className="text-xs text-gray-500">{regionOrders} הזמנות</div>
                  </div>
                  <div className="font-bold text-blue-600">{formatCurrency(regionRevenue)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyDashboard({ notes, onDelete }) {
  const total = notes.reduce((sum, n) => sum + n.totalRevenue, 0);
  const totalMeters = notes.reduce((sum, n) => sum + n.totalAmount, 0);
  const totalPieces = notes.reduce((sum, n) => sum + n.totalPieces, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">📊 לוח בקרה</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">תעודות משלוח</div>
          <div className="text-4xl font-bold mt-2">{notes.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">סה"כ הכנסות</div>
          <div className="text-3xl font-bold mt-2">{formatCurrency(total)}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">סה"כ מטרים</div>
          <div className="text-4xl font-bold mt-2">{totalMeters.toFixed(0)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">סה"כ יחידות</div>
          <div className="text-4xl font-bold mt-2">{totalPieces}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-2xl font-bold mb-4">📋 תעודות אחרונות</h3>
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔭</div>
            <p className="text-xl text-gray-500">אין תעודות עדיין</p>
            <p className="text-gray-400">השתמש ב-OCR כדי לסרוק תעודה</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.slice().reverse().map((note) => (
              <div key={note.id} className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border-r-4 border-blue-500">
                <div>
                  <div className="font-bold text-lg">{note.clientName}</div>
                  <div className="text-sm text-gray-600">
                    🏢 {note.region} | 📄 {note.docNum} | 📅 {note.docDate}
                  </div>
                  <div className="text-sm text-gray-500">
                    {note.items.length} פריטים | {note.totalPieces} יחידות | {note.totalAmount.toFixed(2)} מטר
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600">{formatCurrency(note.totalRevenue)}</div>
                    <div className="text-sm text-gray-500">הכנסה</div>
                  </div>
                  <button onClick={() => onDelete(note.id)} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Analytics Component with AI Integration
function LegacyAnalyticsView({ notes, clientsDB, productsDB }) {
  const [regionFilter, setRegionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [widthFilter, setWidthFilter] = useState('all');
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const filteredNotes = notes.filter(note => {
    if (regionFilter !== 'all' && note.region !== regionFilter) return false;
    if (typeFilter !== 'all') {
      const hasType = note.items.some(item => productsDB[item.code]?.type === typeFilter);
      if (!hasType) return false;
    }
    if (widthFilter !== 'all') {
      const hasWidth = note.items.some(item => productsDB[item.code]?.width === parseInt(widthFilter));
      if (!hasWidth) return false;
    }
    return true;
  });

  const totalRevenue = filteredNotes.reduce((sum, n) => sum + n.totalRevenue, 0);
  const totalMeters = filteredNotes.reduce((sum, n) => sum + n.totalAmount, 0);
  const totalPieces = filteredNotes.reduce((sum, n) => sum + n.totalPieces, 0);

  const regionStats = {};
  filteredNotes.forEach(note => {
    if (!regionStats[note.region]) regionStats[note.region] = { count: 0, revenue: 0, meters: 0, pieces: 0 };
    regionStats[note.region].count++;
    regionStats[note.region].revenue += note.totalRevenue;
    regionStats[note.region].meters += note.totalAmount;
    regionStats[note.region].pieces += note.totalPieces;
  });

  const typeStats = {};
  filteredNotes.forEach(note => {
    note.items.forEach(item => {
      const prod = productsDB[item.code];
      if (prod) {
        if (!typeStats[prod.type]) typeStats[prod.type] = { amount: 0, revenue: 0, count: 0, pieces: 0 };
        typeStats[prod.type].amount += item.meters || item.amount;
        typeStats[prod.type].revenue += item.revenue;
        typeStats[prod.type].count++;
        typeStats[prod.type].pieces += item.pieces || item.amount;
      }
    });
  });

  const widthStats = {};
  filteredNotes.forEach(note => {
    note.items.forEach(item => {
      const prod = productsDB[item.code];
      if (prod && prod.width) {
        if (!widthStats[prod.width]) widthStats[prod.width] = { amount: 0, revenue: 0, pieces: 0 };
        widthStats[prod.width].amount += item.meters || item.amount;
        widthStats[prod.width].revenue += item.revenue;
        widthStats[prod.width].pieces += item.pieces || item.amount;
      }
    });
  });

  const clientStats = {};
  filteredNotes.forEach(note => {
    if (!clientStats[note.clientName]) {
      clientStats[note.clientName] = { revenue: 0, orders: 0, meters: 0, pieces: 0, region: note.region };
    }
    clientStats[note.clientName].revenue += note.totalRevenue;
    clientStats[note.clientName].orders++;
    clientStats[note.clientName].meters += note.totalAmount;
    clientStats[note.clientName].pieces += note.totalPieces;
  });

  const topClients = Object.entries(clientStats).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

  const analyzeWithAI = async () => {
    setLoading(true);
    try {
      const analysisData = {
        totalNotes: filteredNotes.length,
        totalRevenue,
        totalMeters,
        totalPieces,
        avgRevenue: totalRevenue / (filteredNotes.length || 1),
        regions: regionStats,
        productTypes: typeStats,
        topClients: topClients.slice(0, 5)
      };

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `נתח את נתוני המכירות הבאים ותן תובנות עסקיות:

${JSON.stringify(analysisData, null, 2)}

אנא ספק ניתוח מקצועי בעברית הכולל:
1. 📈 ניתוח מגמות - מה בולט בנתונים?
2. 🎯 המלצות אסטרטגיות - איפה כדאי להתמקד?
3. 🚀 הזדמנויות צמיחה - איך להגדיל מכירות?
4. ⚠️ התראות - מה דורש תשומת לב?
5. 🗺️ תובנות אזוריות - מאפיינים ייחודיים של כל אזור

השב בפורמט JSON עם המפתחות: trends, recommendations, opportunities, alerts, regional`
          }]
        })
      });

      const data = await response.json();
      const text = data.content.find(c => c.type === 'text')?.text || '';
      const cleanText = text.replace(/```json|```/g, '').trim();
      const insights = JSON.parse(cleanText);
      setAiInsights(insights);
    } catch (error) {
      console.error('AI Analysis Error:', error);
      alert('שגיאה בניתוח AI');
    }
    setLoading(false);
  };

  const productTypes = [...new Set(Object.values(productsDB).map(p => p.type))];
  const widths = [...new Set(Object.values(productsDB).map(p => p.width).filter(w => w))].sort((a,b) => a-b);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">🤖 ניתוח AI מתקדם</h2>
        <button onClick={analyzeWithAI} disabled={loading || filteredNotes.length === 0} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg">
          {loading ? '🔄 מנתח...' : '✨ נתח עם AI'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">🔍 סינונים</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">אזור</label>
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="w-full border-2 border-gray-300 rounded-lg p-2">
              <option value="all">כל האזורים</option>
              <option value="מרכז">מרכז</option>
              <option value="משולש">משולש</option>
              <option value="צפון">צפון</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">סוג מוצר</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full border-2 border-gray-300 rounded-lg p-2">
              <option value="all">כל הסוגים</option>
              {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">רוחב</label>
            <select value={widthFilter} onChange={e => setWidthFilter(e.target.value)} className="w-full border-2 border-gray-300 rounded-lg p-2">
              <option value="all">כל הרוחבים</option>
              {widths.map(w => <option key={w} value={w}>{w}mm</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">תעודות מסוננות</div>
          <div className="text-4xl font-bold mt-2">{filteredNotes.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">הכנסות מסוננות</div>
          <div className="text-3xl font-bold mt-2">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">מטרים מסוננים</div>
          <div className="text-4xl font-bold mt-2">{totalMeters.toFixed(0)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-lg shadow-lg text-white">
          <div className="text-sm opacity-90">יחידות מסוננות</div>
          <div className="text-4xl font-bold mt-2">{totalPieces}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">🗺️ ניתוח אזורי</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(regionStats).map(([region, stats]) => (
            <div key={region} className="bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-lg border-2 border-blue-200">
              <div className="text-xl font-bold mb-2">{region}</div>
              <div className="space-y-1 text-sm">
                <div>📦 {stats.count} תעודות</div>
                <div className="text-green-600 font-bold">{formatCurrency(stats.revenue)}</div>
                <div>📏 {stats.meters.toFixed(0)} מטר</div>
                <div>📦 {stats.pieces} יחידות</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">📊 ניתוח לפי סוג מוצר</h3>
        <div className="space-y-3">
          {Object.entries(typeStats).sort((a, b) => b[1].revenue - a[1].revenue).map(([type, stats]) => (
            <div key={type} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-bold text-lg">{type}</div>
                <div className="text-sm text-gray-600">{stats.amount.toFixed(2)} מטר | {stats.pieces} יחידות | {stats.count} מכירות</div>
              </div>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.revenue)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">🏆 10 הלקוחות המובילים</h3>
        <div className="space-y-3">
          {topClients.map(([name, stats], i) => (
            <div key={name} className="flex justify-between items-center p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border-r-4 border-yellow-500">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold text-yellow-600">#{i + 1}</div>
                <div>
                  <div className="font-bold text-lg">{name}</div>
                  <div className="text-sm text-gray-600">🏢 {stats.region} | 📦 {stats.orders} הזמנות</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.revenue)}</div>
            </div>
          ))}
        </div>
      </div>

      {aiInsights && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg shadow-lg p-6 border-4 border-purple-300">
          <h3 className="text-2xl font-bold mb-6 text-purple-700">✨ תובנות AI</h3>
          <div className="space-y-4">
            {Object.entries({
              '📈 ניתוח מגמות': { text: aiInsights.trends, color: 'blue' },
              '🎯 המלצות אסטרטגיות': { text: aiInsights.recommendations, color: 'green' },
              '🚀 הזדמנויות צמיחה': { text: aiInsights.opportunities, color: 'purple' },
              '⚠️ התראות': { text: aiInsights.alerts, color: 'red' },
              '🗺️ תובנות אזוריות': { text: aiInsights.regional, color: 'orange' }
            }).map(([title, data]) => (
              <div key={title} className="bg-white rounded-lg p-4">
                <div className={`text-lg font-bold text-${data.color}-600 mb-2`}>{title}</div>
                <div className="text-gray-700">{data.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

