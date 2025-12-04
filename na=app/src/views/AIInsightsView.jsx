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

export default function AIInsightsView({ notes, clientsDB, productsDB }) {
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');

  const notesWithDate = useMemo(
    () => notes.map(note => ({ ...note, parsedDate: parseDocDate(note.docDate) })).filter(note => note.parsedDate),
    [notes]
  );

  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = startOfMonth(lastMonthEnd);

  const currentMonthNotes = notesWithDate.filter(note => note.parsedDate >= monthStart);
  const previousMonthNotes = notesWithDate.filter(note => note.parsedDate >= lastMonthStart && note.parsedDate <= lastMonthEnd);

  const totalRevenue = notesWithDate.reduce((sum, note) => sum + note.totalRevenue, 0);
  const totalOrders = notesWithDate.length;
  const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

  const currentMonthRevenue = currentMonthNotes.reduce((sum, note) => sum + note.totalRevenue, 0);
  const previousMonthRevenue = previousMonthNotes.reduce((sum, note) => sum + note.totalRevenue, 0);
  const monthGrowth = formatPercentChange(currentMonthRevenue, previousMonthRevenue);

  const last30DaysNotes = notesWithDate.filter(note => note.parsedDate >= addDays(today, -29));
  const revenueLast30Days = last30DaysNotes.reduce((sum, note) => sum + note.totalRevenue, 0);
  const avgDailyRevenue = revenueLast30Days / (last30DaysNotes.length ? 30 : 1);
  const forecastNextWeekRevenue = avgDailyRevenue * 7;

  const clientsByKey = Object.entries(clientsDB).reduce((acc, [key, client]) => {
    acc[key] = client;
    return acc;
  }, {});

  const clientLastOrder = {};
  notesWithDate.forEach(note => {
    const key = note.clientKey || note.clientName;
    if (!key) return;
    if (!clientLastOrder[key] || note.parsedDate > clientLastOrder[key]) {
      clientLastOrder[key] = note.parsedDate;
    }
  });

  const atRiskClients = Object.entries(clientsDB)
    .map(([key, client]) => ({
      key,
      name: client.name,
      lastOrder: clientLastOrder[key] || null
    }))
    .filter(entry => !entry.lastOrder || entry.lastOrder < addDays(today, -60));

  const productTrends = currentMonthNotes.reduce((acc, note) => {
    note.items?.forEach(item => {
      const base = acc[item.code] || {
        code: item.code,
        name: item.name,
        revenue: 0,
        quantity: 0
      };
      base.revenue += item.revenue || 0;
      base.quantity += item.pieces || item.amount || 0;
      acc[item.code] = base;
    });
    return acc;
  }, {});

  const topProducts = Object.values(productTrends).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const analyzeWithAI = async () => {
    setLoading(true);
    try {
      const analysisData = {
        totalRevenue,
        averageOrderValue,
        monthGrowth,
        forecastNextWeekRevenue,
        atRiskClients: atRiskClients.slice(0, 5).map(c => ({ name: c.name, lastOrder: c.lastOrder ? c.lastOrder.toISOString() : null })),
        topProducts
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{
            role: 'user',
            content: `אתה מנתח עסק בתחום ייצור הפלסטיק. בנה דו"ח תובנות מקיף בעברית על סמך הנתונים הבאים:

${JSON.stringify(analysisData, null, 2)}

ספק 6 סעיפים:
1. תחזית מכירות לשבוע הבא
2. הזדמנויות תמחור ללקוחות או מוצרים
3. מוצרים או אזורים לצמיחה
4. לקוחות בסיכון (לא הזמינו זמן רב)
5. המלצות פעולה ל-14 הימים הקרובים
6. הערות חשובות נוספות
`
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.find(c => c.type === 'text')?.text || '';
      setAiSummary(text.trim());
    } catch (error) {
      console.error('AI Analysis Error:', error);
      setAiSummary('אירעה שגיאה בקריאת תובנות AI. בדוק חיבור ומפתח API.');
    }
    setLoading(false);
  };

  const askCustomQuestion = async () => {
    if (!customQuestion.trim()) return;
    setLoading(true);
    setCustomAnswer('');
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `ענה בעברית על השאלה העסקית הבאה בהתבסס על נתוני המכירות:

שאלה: ${customQuestion}

נתונים זמינים:
- סה"כ הכנסות: ${formatCurrency(totalRevenue)}
- הזמנה ממוצעת: ${formatCurrency(averageOrderValue)}
- הכנסות חודש נוכחי: ${formatCurrency(currentMonthRevenue)}
- מוצרים מובילים: ${topProducts.map(p => `${p.name} (${formatCurrency(p.revenue)})`).join(', ')}
- לקוחות בסיכון: ${atRiskClients.slice(0, 5).map(c => c.name).join(', ')}
`
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.find(c => c.type === 'text')?.text || '';
      setCustomAnswer(text.trim());
    } catch (error) {
      console.error('AI Question Error:', error);
      setCustomAnswer('אירעה שגיאה בקבלת תשובה מה-AI.');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">🤖 תובנות AI עסקיות</h2>
          <p className="text-sm text-gray-500">קבל תחזיות, המלצות וסימוני חריגים מבוססי נתונים בזמן אמת.</p>
        </div>
        <button onClick={analyzeWithAI} disabled={loading || !notes.length} className="btn-primary text-sm">
          {loading ? '🔄 מפעיל ניתוח...' : '⚡ הפק דו"ח AI'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-semibold">תחזית שבוע קדימה</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(forecastNextWeekRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">מבוסס על ממוצע 30 הימים האחרונים</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-purple-100">
          <div className="text-sm text-purple-600 font-semibold">הכנסות חודש נוכחי</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(currentMonthRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">שינוי חודשי: {monthGrowth}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-amber-100">
          <div className="text-sm text-amber-600 font-semibold">לקוחות בסיכון</div>
          <div className="mt-2 text-3xl font-bold">{atRiskClients.length}</div>
          <div className="mt-1 text-xs text-gray-500">לא הזמינו מעל 60 ימים</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-emerald-100">
          <div className="text-sm text-emerald-600 font-semibold">ערך הזמנה ממוצע</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(averageOrderValue)}</div>
          <div className="mt-1 text-xs text-gray-500">מבוסס על {totalOrders} הזמנות נמדדות</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">לקוחות הדורשים מעקב</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {atRiskClients.length ? (
              atRiskClients.slice(0, 6).map(client => (
                <div key={client.key} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{client.name}</div>
                    <div className="text-xs text-gray-500">{client.lastOrder ? `הזמנה אחרונה: ${client.lastOrder.toLocaleDateString('he-IL')}` : 'טרם בוצעו הזמנות'}</div>
                  </div>
                  <span className="text-xs text-rose-500">צור קשר</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">כל הלקוחות הזמינו לאחרונה.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">מוצרים במיקוד AI</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {topProducts.length ? (
              topProducts.map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.quantity.toFixed(0)} יחידות • {formatCurrency(product.revenue)}</div>
                  </div>
                  <span className="text-xs text-blue-500">בדוק מלאי</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין מספיק נתונים להצגת מוצרים מובילים.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">דו"ח AI מפורט</h3>
        {aiSummary ? (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-4">
            {aiSummary}
          </pre>
        ) : (
          <p className="text-sm text-gray-500">לחץ על "הפק דו"ח AI" לקבלת סיכום אוטומטי ומעמיק.</p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">שאל את ה-AI על העסק שלך</h3>
        <textarea
          value={customQuestion}
          onChange={e => setCustomQuestion(e.target.value)}
          rows={4}
          className="input-field"
          placeholder="לדוגמה: אילו לקוחות קונים הכי הרבה צינורות קוברה?"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">השאלות נשלחות ל-LLM ומנתחות את נתוני ה-CRM שלך.</span>
          <button onClick={askCustomQuestion} disabled={loading || !customQuestion.trim()} className="btn-secondary text-sm">
            שלח שאלה ל-AI
          </button>
        </div>
        {customAnswer && (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-4">
            {customAnswer}
          </pre>
        )}
      </div>
    </div>
  );
}

