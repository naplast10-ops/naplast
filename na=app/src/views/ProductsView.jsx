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


const PRODUCT_CATEGORY_GROUPS = {
  'צינורות סטנדרטיים': {
    description: 'צינורות צבעוניים לשימוש כללי – שחור, ירוק, אדום, כחול ועוד',
    types: ['שחור', 'ירוק', 'אדום', 'צבוע', 'כחול', 'לבן', 'חום']
  },
  'פתרונות תקשורת וגמישות': {
    description: 'פתרונות להגנה על כבלים ותקשורת, כולל קוברה ושרשורי',
    types: ['קוברה', 'שרשורי', 'יקע']
  },
  'אביזרי חשמל ותשתית': {
    description: 'קופסאות ופתרונות עזר לתשתיות חשמל',
    types: ['קופסא']
  }
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

export default function ProductsView({ productsDB, setProductsDB, deliveryNotes = [] }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [widthFilter, setWidthFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const categoryOptions = useMemo(() => ['all', ...Object.keys(PRODUCT_CATEGORY_GROUPS)], []);

  const allTypes = useMemo(
    () => [...new Set(Object.values(productsDB).map(p => p.type))],
    [productsDB]
  );

  const widths = useMemo(
    () => ['all', ...new Set(Object.values(productsDB).map(p => p.width).filter(Boolean))].sort((a, b) => a - b),
    [productsDB]
  );

  const productsList = useMemo(
    () => Object.entries(productsDB).map(([code, product]) => ({ code, ...product })),
    [productsDB]
  );

  const availableTypes = useMemo(() => {
    if (selectedCategory === 'all') {
      return ['all', ...allTypes];
    }
    const groupTypes = PRODUCT_CATEGORY_GROUPS[selectedCategory]?.types || [];
    return ['all', ...groupTypes];
  }, [selectedCategory, allTypes]);

  useEffect(() => {
    if (!availableTypes.includes(selectedType)) {
      setSelectedType('all');
    }
  }, [availableTypes, selectedType]);

  const visibleProducts = useMemo(() => {
    const categoryTypes = selectedCategory === 'all' ? null : PRODUCT_CATEGORY_GROUPS[selectedCategory]?.types || [];
    const term = searchTerm.trim();

    return productsList
      .filter(product => !categoryTypes || categoryTypes.includes(product.type))
      .filter(product => selectedType === 'all' || product.type === selectedType)
      .filter(product => widthFilter === 'all' || product.width === parseInt(widthFilter))
      .filter(product => {
        if (!term) return true;
        return (
          product.name.includes(term) ||
          product.code.includes(term) ||
          (product.width && product.width.toString().includes(term))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [productsList, selectedCategory, selectedType, widthFilter, searchTerm]);

  const addProduct = (newProduct) => {
    setProductsDB({ ...productsDB, [newProduct.code]: newProduct });
    setShowAddModal(false);
  };

  const updateProduct = (code, updatedProduct) => {
    setProductsDB({ ...productsDB, [code]: updatedProduct });
    setShowEditModal(false);
  };

  const deleteProduct = (code) => {
    if (confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) {
      const updated = { ...productsDB };
      delete updated[code];
      setProductsDB(updated);
    }
  };

  const notesWithDate = useMemo(
    () => deliveryNotes.map(note => ({ ...note, parsedDate: parseDocDate(note.docDate) })).filter(note => note.parsedDate),
    [deliveryNotes]
  );

  const monthStart = startOfMonth(new Date());

  const { overallProductStats, monthProductStats } = useMemo(() => {
    const overall = {};
    const monthly = {};
    notesWithDate.forEach(note => {
      const isInMonth = note.parsedDate >= monthStart;
      note.items?.forEach(item => {
        const baseInfo = productsDB[item.code] || {};
        const ensureEntry = (container) => {
          if (!container[item.code]) {
            container[item.code] = {
              code: item.code,
              name: baseInfo.name || item.name || item.code,
              type: baseInfo.type || 'לא ידוע',
              revenue: 0,
              quantity: 0,
              orders: 0,
              lastSold: note.parsedDate
            };
          }
          const entry = container[item.code];
          entry.revenue += item.revenue || 0;
          entry.quantity += item.pieces || item.amount || 0;
          entry.orders += 1;
          if (note.parsedDate > entry.lastSold) {
            entry.lastSold = note.parsedDate;
          }
          return entry;
        };
        ensureEntry(overall);
        if (isInMonth) {
          ensureEntry(monthly);
        }
      });
    });
    return { overallProductStats: overall, monthProductStats: monthly };
  }, [notesWithDate, productsDB, monthStart]);

  const monthProductsList = Object.values(monthProductStats);
  const totalMonthRevenue = monthProductsList.reduce((sum, product) => sum + product.revenue, 0);
  const totalMonthQuantity = monthProductsList.reduce((sum, product) => sum + product.quantity, 0);

  const bestSeller = monthProductsList.length ? [...monthProductsList].sort((a, b) => b.revenue - a.revenue)[0] : null;
  const worstSeller = monthProductsList.filter(product => product.quantity > 0).sort((a, b) => a.revenue - b.revenue)[0] || null;

  const lowStockProducts = Object.entries(productsDB)
    .filter(([, product]) => product.stock !== undefined && product.reorderThreshold !== undefined && product.stock <= product.reorderThreshold)
    .map(([code, product]) => ({ code, ...product }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold">📦 ניהול מוצרים ({productsList.length})</h2>
          <p className="text-sm text-gray-500">מעקב אחר ביצועי המוצרים, מכירות ומלאי.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddModal(true)} className="btn-success">
            ➕ הוסף מוצר
          </button>
          <button onClick={() => { setSelectedCategory('all'); setSelectedType('all'); setWidthFilter('all'); setSearchTerm(''); }} className="btn-secondary">
            🔄 אפס סינונים
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-semibold">הכנסות החודש ממוצרים</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(totalMonthRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">נמכרו {totalMonthQuantity.toFixed(0)} יחידות בסך הכול</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-emerald-100">
          <div className="text-sm text-emerald-600 font-semibold">מוצר מוביל</div>
          <div className="mt-2 text-lg font-bold text-emerald-700">{bestSeller ? bestSeller.name : '—'}</div>
          <div className="mt-1 text-xs text-gray-500">{bestSeller ? `${bestSeller.quantity.toFixed(0)} יחידות • ${formatCurrency(bestSeller.revenue)}` : 'אין נתונים'}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-amber-100">
          <div className="text-sm text-amber-600 font-semibold">מוצר דורש תשומת לב</div>
          <div className="mt-2 text-lg font-bold text-amber-700">{worstSeller ? worstSeller.name : 'אין נתונים'}</div>
          <div className="mt-1 text-xs text-gray-500">{worstSeller ? `${worstSeller.quantity.toFixed(0)} יחידות • ${formatCurrency(worstSeller.revenue)}` : 'מתחיל לאסוף נתונים'}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-rose-100">
          <div className="text-sm text-rose-600 font-semibold">התראות מלאי</div>
          <div className="mt-2 text-3xl font-bold">{lowStockProducts.length}</div>
          <div className="mt-1 text-xs text-gray-500">{lowStockProducts.length ? 'בדוק מלאי בהקדם' : 'אין מוצרים מתחת לסף ההתרעה'}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map(category => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedType('all');
                }}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition ${
                  selectedCategory === category ? 'bg-green-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category === 'all' ? 'כל הקטגוריות' : category}
              </button>
            ))}
          </div>

          {selectedCategory !== 'all' && PRODUCT_CATEGORY_GROUPS[selectedCategory]?.description && (
            <p className="text-xs text-gray-500">
              {PRODUCT_CATEGORY_GROUPS[selectedCategory].description}
            </p>
          )}

          {availableTypes.filter(type => type !== 'all').length > 1 && (
            <div className="flex flex-wrap gap-2">
              {availableTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    selectedType === type ? 'bg-gray-900 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'all' ? 'כל הסוגים בקבוצה' : type}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="sm:w-48">
            <label className="block text-xs font-semibold mb-1 text-gray-500">רוחב</label>
            <select
              value={widthFilter}
              onChange={e => setWidthFilter(e.target.value)}
              className="input-field"
            >
              {widths.map(w => (
                <option key={w} value={w}>
                  {w === 'all' ? 'כל הרוחבים' : `${w}mm`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold mb-1 text-gray-500">חיפוש</label>
            <input
              type="text"
              placeholder="שם מוצר, קוד, רוחב..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">🔥 5 המוצרים הנמכרים ביותר בחודש</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {monthProductsList.length ? (
              [...monthProductsList].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.type} • {product.quantity.toFixed(0)} יחידות</div>
                  </div>
                  <div className="font-bold text-blue-600">{formatCurrency(product.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">עדיין אין מכירות החודש להציג.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">⚠️ התרעות מלאי ומוצרים חלשים</h3>
          <div className="space-y-3 text-sm text-gray-600">
            {lowStockProducts.length ? (
              lowStockProducts.slice(0, 5).map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                  <div>
                    <div className="font-semibold text-rose-700">{product.name}</div>
                    <div className="text-xs text-rose-600">מלאי: {product.stock} • סף: {product.reorderThreshold}</div>
                  </div>
                  <div className="text-xs font-semibold text-rose-600">בדוק רכש</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין התרעות מלאי כרגע. הוסף מעקב מלאי למוצרים כדי לקבל התרעות.</div>
            )}
          </div>
          <div className="pt-4 border-t border-gray-100 text-sm text-gray-600">
            {worstSeller ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-800">מוצר חלש: {worstSeller.name}</div>
                  <div className="text-xs text-gray-500">{worstSeller.quantity.toFixed(0)} יחידות • {formatCurrency(worstSeller.revenue)}</div>
                </div>
                <span className="text-xs text-gray-400">שקול מבצע או עדכון מחיר</span>
              </div>
            ) : (
              <span>אין עדיין נתונים על מוצרים חלשים.</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">מוצר</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">סוג</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">רוחב</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">מכירה</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">נמכר החודש</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">הכנסות החודש</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">מחיר בסיס</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleProducts.map(product => {
                  const monthlyStats = monthProductStats[product.code] || { quantity: 0, revenue: 0 };
                  return (
                    <tr key={product.code} className="hover:bg-gray-50/40 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-500">קוד: {product.code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{product.type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{product.width ? `${product.width}mm` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {product.soldBy === 'meters' ? 'למטר' : product.soldBy === 'units' ? 'ליחידה' : 'לגליל'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{monthlyStats.quantity.toFixed(0)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-purple-600">{formatCurrency(monthlyStats.revenue)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                        {formatCurrency(product.basePrice)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { setSelectedProduct(product); setShowEditModal(true); }}
                            className="btn-primary px-3 py-1 text-xs"
                          >
                            ✏️ עריכה
                          </button>
                          <button
                            onClick={() => deleteProduct(product.code)}
                            className="btn-danger px-3 py-1 text-xs"
                          >
                            🗑️ מחיקה
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {visibleProducts.length === 0 && (
          <div className="p-12 text-center text-gray-500">לא נמצאו מוצרים עבור הסינון הנוכחי</div>
        )}
      </div>

      {showAddModal && <AddProductModal onClose={() => setShowAddModal(false)} onAdd={addProduct} />}
      {showEditModal && selectedProduct && (
        <EditProductModal product={selectedProduct} onClose={() => setShowEditModal(false)} onUpdate={updateProduct} />
      )}
    </div>
  );
}

function AddProductModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'שחור', width: '', rollLength: 100, soldBy: 'rolls', basePrice: 0 });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.code || !form.name) {
      alert('נא למלא את כל השדות');
      return;
    }
    const product = {
      ...form,
      width: form.width ? parseInt(form.width) : null,
      rollLength: parseInt(form.rollLength),
      basePrice: parseFloat(form.basePrice)
    };
    onAdd(product);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-2xl font-bold mb-4">➕ הוסף מוצר חדש</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">קוד</label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">שם</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">סוג</label>
            <input
              type="text"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">רוחב (mm)</label>
            <input
              type="number"
              value={form.width}
              onChange={e => setForm({ ...form, width: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">אורך גליל (מ')</label>
            <input
              type="number"
              value={form.rollLength}
              onChange={e => setForm({ ...form, rollLength: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">סוג מכירה</label>
            <select
              value={form.soldBy}
              onChange={e => setForm({ ...form, soldBy: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            >
              <option value="rolls">ליחידה/גליל</option>
              <option value="meters">למטר</option>
              <option value="units">ליחידה (קופסא)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-2">מחיר בסיס</label>
            <input
              type="number"
              step="0.1"
              value={form.basePrice}
              onChange={e => setForm({ ...form, basePrice: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg">✅ הוסף</button>
            <button type="button" onClick={onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-2 rounded-lg">❌ ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProductModal({ product, onClose, onUpdate }) {
  const [form, setForm] = useState(product);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) {
      alert('נא למלא את כל השדות');
      return;
    }
    const updated = {
      ...form,
      width: form.width ? parseInt(form.width) : null,
      rollLength: parseInt(form.rollLength),
      basePrice: parseFloat(form.basePrice)
    };
    onUpdate(product.code, updated);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-2xl font-bold mb-4">✏️ ערוך מוצר</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">שם</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">סוג</label>
            <input
              type="text"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">רוחב (mm)</label>
            <input
              type="number"
              value={form.width || ''}
              onChange={e => setForm({ ...form, width: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">אורך גליל (מ')</label>
            <input
              type="number"
              value={form.rollLength}
              onChange={e => setForm({ ...form, rollLength: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">סוג מכירה</label>
            <select
              value={form.soldBy}
              onChange={e => setForm({ ...form, soldBy: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            >
              <option value="rolls">ליחידה/גליל</option>
              <option value="meters">למטר</option>
              <option value="units">ליחידה (קופסא)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-2">מחיר בסיס</label>
            <input
              type="number"
              step="0.1"
              value={form.basePrice}
              onChange={e => setForm({ ...form, basePrice: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-gray-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg">✅ עדכן</button>
            <button type="button" onClick={onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-2 rounded-lg">❌ ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
