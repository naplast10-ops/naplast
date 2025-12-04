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

export default function ReportsView({ notes, clientsDB, productsDB }) {
  const reportCards = [
    {
      icon: '📄',
      title: 'דו"ח מכירות לפי טווח תאריכים',
      description: 'פירוט הכנסות, הזמנות ומגמות לפי תאריכים, לקוחות ואזורים.'
    },
    {
      icon: '💰',
      title: 'דו"ח רווח והפסד',
      description: 'שלב נתוני עלות (COGS) לקבלת תמונת רווחיות מלאה.'
    },
    {
      icon: '👥',
      title: 'דו"ח פעילות לקוחות',
      description: 'הכנסות, הזמנות פתוחות, יתרת תשלום וסטטוסים ללקוחות.'
    },
    {
      icon: '📦',
      title: 'דו"ח ביצועי מוצרים',
      description: 'ניתוח לפי קטגוריות, יחידות שנמכרו, הכנסות ומלאי.'
    }
  ];

  const exportReport = (format) => {
    alert(`ייצוא דוחות ל-${format} יתווסף בקרוב עם תבניות מקצועיות.`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">📈 מרכז דוחות</h2>
          <p className="text-sm text-gray-500">הפק דוחות מעמיקים לשיתוף עם הנהלה, כספים ולקוחות.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportReport('Excel')} className="btn-primary text-sm">📊 ייצוא ל-Excel</button>
          <button onClick={() => exportReport('PDF')} className="btn-secondary text-sm">📄 ייצוא ל-PDF</button>
          <button onClick={() => exportReport('Email')} className="btn-secondary text-sm">📧 שליחת דוח במייל</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportCards.map(card => (
          <div key={card.title} className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-start gap-3">
              <div className="text-3xl">{card.icon}</div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{card.description}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => exportReport('Excel')} className="btn-secondary text-sm">Excel</button>
              <button onClick={() => exportReport('PDF')} className="btn-secondary text-sm">PDF</button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">🔧 מה נצטרך ממך?</h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
          <li>הגדרת עלות מוצרים (COGS) למוצרים לבניית דו"חות רווחיות.</li>
          <li>הזנת יתרות פתוחות וסטטוס תשלום ללקוחות עבור דו"חות כספיים.</li>
          <li>אפשרות יצוא נתונים אוטומטי למיילים של הלקוחות או ההנהלה.</li>
        </ul>
        <p className="text-xs text-gray-400">פיצ'ר זה בפיתוח. עדכונים ישלחו עם הוספת תמיכה מלאה בייצוא.</p>
      </div>
    </div>
  );
}
