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

export default function ClientsView({ clientsDB, setClientsDB, clientPrices, setClientPrices, productsDB, deliveryNotes, clientNotes, setClientNotes, clientTags, setClientTags }) {
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientKey, setSelectedClientKey] = useState(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const safeClientsEntries = useMemo(
    () => Object.entries(clientsDB || {}).filter(([, client]) => client && client.name),
    [clientsDB]
  );

  const clientsList = useMemo(
    () => safeClientsEntries.map(([key, client]) => ({ key, ...client })),
    [safeClientsEntries]
  );

  const regions = useMemo(
    () => ['all', ...new Set(clientsList.map(client => client.region).filter(Boolean))],
    [clientsList]
  );

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim();
    return clientsList
      .filter(client => selectedRegion === 'all' || client.region === selectedRegion)
      .filter(client => {
        if (!term) return true;
        return client.name.includes(term) || client.key.includes(term) || client.vat?.includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [clientsList, selectedRegion, searchTerm]);

  const clientsByName = useMemo(
    () => Object.fromEntries(safeClientsEntries.map(([key, client]) => [client.name, key])),
    [safeClientsEntries]
  );


  const clientStats = useMemo(() => {
    const stats = {};
    deliveryNotes.forEach(note => {
      const key = note.clientKey || clientsByName[note.clientName] || note.clientName;
      if (!key) return;
      const parsedDate = parseDocDate(note.docDate);
      if (!parsedDate) return;
      if (!stats[key]) {
        stats[key] = {
          totalRevenue: 0,
          orders: 0,
          lastOrderDate: parsedDate
        };
      }
      stats[key].totalRevenue += note.totalRevenue;
      stats[key].orders += 1;
      if (parsedDate > stats[key].lastOrderDate) {
        stats[key].lastOrderDate = parsedDate;
      }
    });
    return stats;
  }, [deliveryNotes, clientsByName]);

  const regionLabel = (region) => (region === 'all' ? 'כל האזורים' : region);

  useEffect(() => {
    if (!visibleClients.length) {
      if (selectedClientKey !== null) {
        setSelectedClientKey(null);
      }
      return;
    }

    if (!selectedClientKey || !visibleClients.some(client => client.key === selectedClientKey)) {
      setSelectedClientKey(visibleClients[0].key);
    }
  }, [visibleClients, selectedClientKey]);

  const selectedClient = useMemo(() => {
    if (!selectedClientKey) return null;
    const raw = clientsDB[selectedClientKey];
    if (!raw) return null;
    return { key: selectedClientKey, ...raw };
  }, [selectedClientKey, clientsDB]);

  const selectedClientPrices = selectedClient ? clientPrices[selectedClient.key] || {} : {};
  const selectedClientPriceEntries = selectedClient ? Object.entries(selectedClientPrices) : [];
  const selectedStats = selectedClient ? clientStats[selectedClient.key] : null;
  const lifetimeValue = selectedStats?.totalRevenue || 0;
  const totalOrders = selectedStats?.orders || 0;
  const averageOrderValue = totalOrders ? lifetimeValue / totalOrders : 0;
  const lastOrderDate = selectedStats?.lastOrderDate || null;
  const lastOrderDisplay = lastOrderDate ? lastOrderDate.toLocaleDateString('he-IL') : '—';
  const needsFollowUp = !lastOrderDate || lastOrderDate < addDays(new Date(), -30);
  const tags = selectedClient ? clientTags[selectedClient.key] || [] : [];

  const addClient = (newClient) => {
    setClientsDB({ ...clientsDB, [newClient.key]: newClient });
    setSelectedClientKey(newClient.key);
    setShowAddModal(false);
  };

  const updateClient = (key, updatedClient) => {
    setClientsDB({ ...clientsDB, [key]: updatedClient });
    setShowEditModal(false);
  };

  const deleteClient = (key) => {
    if (confirm('האם אתה בטוח שברצונך למחוק לקוח זה?')) {
      const updated = { ...clientsDB };
      delete updated[key];
      setClientsDB(updated);
      if (selectedClientKey === key) {
        setSelectedClientKey(null);
      }
    }
  };

  const [notesDraft, setNotesDraft] = useState('');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (selectedClientKey) {
      setNotesDraft(clientNotes[selectedClientKey] || '');
      setTagInput('');
    } else {
      setNotesDraft('');
      setTagInput('');
    }
  }, [selectedClientKey, clientNotes]);

  const handleSaveNotes = () => {
    if (!selectedClient) return;
    setClientNotes(prev => {
      const updated = { ...prev };
      const trimmed = notesDraft.trim();
      if (trimmed) {
        updated[selectedClient.key] = trimmed;
      } else {
        delete updated[selectedClient.key];
      }
      return updated;
    });
  };

  const handleAddTag = () => {
    if (!selectedClient) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    setClientTags(prev => {
      const existing = prev[selectedClient.key] || [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, [selectedClient.key]: [...existing, trimmed] };
    });
    setTagInput('');
  };

  const handleRemoveTag = (tag) => {
    if (!selectedClient) return;
    setClientTags(prev => {
      const existing = prev[selectedClient.key] || [];
      const updatedTags = existing.filter(t => t !== tag);
      const updated = { ...prev };
      if (updatedTags.length) {
        updated[selectedClient.key] = updatedTags;
      } else {
        delete updated[selectedClient.key];
      }
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold">👥 ניהול לקוחות ({clientsList.length})</h2>
          <p className="text-sm text-gray-500">נהל את רשימת הלקוחות שלך, תעריפים מותאמים ותצוגה מהירה של נתוני זיהוי.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddModal(true)} className="btn-success">
            ➕ הוסף לקוח
          </button>
          <button onClick={() => setSelectedRegion('all')} className="btn-secondary">
            🔄 אפס סינונים
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {regions.map(region => (
            <button
              key={region}
              onClick={() => setSelectedRegion(region)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                selectedRegion === region ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {regionLabel(region)} ({regionCounts[region] || 0})
            </button>
          ))}
        </div>
        <div className="w-full lg:w-72">
          <input
            type="text"
            placeholder="🔍 חיפוש לפי שם, מזהה או ח.פ"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: clients list */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 h-[600px] flex flex-col">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">רשימת לקוחות</h3>
              <span className="text-xs text-gray-400">נמצאו {visibleClients.length}</span>
            </div>
            <div className="mt-1 border-t border-gray-100 divide-y divide-gray-100 overflow-y-auto px-2">
              {visibleClients.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-500">
                  לא נמצאו לקוחות מתאימים.
                </div>
              )}
              {visibleClients.map(client => {
                const isActive = selectedClientKey === client.key;
                const customCount = clientPrices[client.key] ? Object.keys(clientPrices[client.key]).length : 0;

                return (
                  <button
                    key={client.key}
                    onClick={() => setSelectedClientKey(client.key)}
                    className={`w-full text-right px-4 py-3 rounded-lg border text-sm transition flex flex-col gap-1 cursor-pointer ${
                      isActive ? 'border-green-500 bg-emerald-50 shadow-sm' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {client.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 truncate">
                          {client.city || '—'} · ח.פ: {client.vat || '—'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
                          {client.region}
                        </span>
                        {customCount > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            💰 {customCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: selected client details */}
        <div className="xl:col-span-2 mt-6 xl:mt-0">
          <div className="bg-white rounded-xl shadow-xl p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedClient.name}</h3>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-blue-700">
                    {selectedClient.region}
                  </span>
                  {selectedClientPrices && Object.keys(selectedClientPrices).length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                      💰 {Object.keys(selectedClientPrices).length} מוצרים מותאמים
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-600">מזהה מערכת: {selectedClient.key}</div>
                <div className="mt-1 text-sm text-gray-600">ח.פ: {selectedClient.vat || '—'}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowPricingModal(true)} className="btn-secondary">
                  💰 ניהול תמחור
                </button>
                <button onClick={() => setShowEditModal(true)} className="btn-primary">
                  ✏️ עריכת פרטי לקוח
                </button>
                <button onClick={() => deleteClient(selectedClient.key)} className="btn-danger">
                  🗑️ מחיקת לקוח
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-gray-50 p-4 text-blue-700">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">שווי חיים</div>
                <div className="mt-2 text-xl font-bold">{formatCurrency(lifetimeValue)}</div>
                <div className="text-xs text-blue-600/70">סה"כ הכנסות מהלקוח</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-purple-700">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">מספר הזמנות</div>
                <div className="mt-2 text-xl font-bold">{totalOrders}</div>
                <div className="text-xs text-purple-600/70">ערך ממוצע: {formatCurrency(averageOrderValue)}</div>
              </div>
              <div className={`rounded-lg p-4 ${needsFollowUp ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">הזמנה אחרונה</div>
                <div className="mt-2 text-xl font-bold">{lastOrderDisplay}</div>
                <div className="text-xs">{needsFollowUp ? 'מומלץ לעקוב - עבר יותר מחודש' : 'מעודכן'}</div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-800">מוצרים עם תמחור מותאם</h4>
                  {selectedClientPriceEntries.length > 0 && (
                    <button onClick={() => setShowPricingModal(true)} className="text-sm text-blue-600 hover:underline">
                      ערוך תמחור
                    </button>
                  )}
                </div>
                {selectedClientPriceEntries.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selectedClientPriceEntries.slice(0, 6).map(([code, price]) => {
                      const product = productsDB[code];
                      return (
                        <div key={code} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-gray-800">
                              {product ? product.name : code}
                            </div>
                            <div className="text-xs text-gray-500">{code}</div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                            <span>
                              מחיר מותאם: {formatCurrency(price)}
                            </span>
                            {product?.basePrice !== undefined && (
                              <span className="text-gray-400">
                                בסיס: {formatCurrency(product.basePrice)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                    אין מוצרים עם תמחור מותאם ללקוח זה עדיין.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-800">🏷️ תגים</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      placeholder="הוסף תג"
                      className="input-field w-40"
                    />
                    <button onClick={handleAddTag} className="btn-primary text-sm">הוסף</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.length ? (
                    tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="text-blue-500 hover:text-blue-700">×</button>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">עדיין לא הוגדרו תגים.</span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-lg font-semibold text-gray-800">📝 הערות לקוח</h4>
                <textarea
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  rows={4}
                  className="input-field"
                  placeholder="רשום הערות, תשלומים באיחור, הזדמנויות upsell ועוד"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">הערות נשמרות מקומית ב-CRM</span>
                  <div className="flex gap-2">
                    <button onClick={handleSaveNotes} className="btn-primary text-sm">💾 שמור הערות</button>
                    <button onClick={() => setNotesDraft(clientNotes[selectedClient?.key] || '')} className="btn-secondary text-sm">איפוס</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            בחר לקוח מהכרטיסיות כדי לראות מידע מפורט.
          </div>
          </div>
        </div>
      </div>

      {showAddModal && <AddClientModal onClose={() => setShowAddModal(false)} onAdd={addClient} />}
      {showEditModal && selectedClient && (
        <EditClientModal client={selectedClient} onClose={() => setShowEditModal(false)} onUpdate={updateClient} />
      )}
      {showPricingModal && selectedClient && (
        <PricingModal
          client={selectedClient}
          clientPrices={clientPrices[selectedClient.key] || {}}
          productsDB={productsDB}
          onUpdatePrice={(code, price) => setClientPrices(prev => ({
            ...prev,
            [selectedClient.key]: { ...prev[selectedClient.key], [code]: price }
          }))}
          onResetPrice={(code) => {
            const updated = { ...clientPrices };
            if (updated[selectedClient.key]) {
              delete updated[selectedClient.key][code];
              if (Object.keys(updated[selectedClient.key]).length === 0) delete updated[selectedClient.key];
            }
            setClientPrices(updated);
          }}
          onClose={() => setShowPricingModal(false)}
        />
      )}
    </div>
  );
}

function AddClientModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ key: '', name: '', region: 'מרכז', vat: '', pricing: {} });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.key || !form.name) {
      alert('נא למלא את כל השדות');
      return;
    }
    onAdd(form);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-2xl font-bold mb-4">➕ הוסף לקוח חדש</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">מזהה</label>
            <input
              type="text"
              value={form.key}
              onChange={e => setForm({ ...form, key: e.target.value })}
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
            <label className="block font-semibold mb-2">אזור</label>
            <select
              value={form.region}
              onChange={e => setForm({ ...form, region: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            >
              <option value="מרכז">מרכז</option>
              <option value="משולש">משולש</option>
              <option value="צפון">צפון</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-2">ח.פ</label>
            <input
              type="text"
              value={form.vat}
              onChange={e => setForm({ ...form, vat: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
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

function EditClientModal({ client, onClose, onUpdate }) {
  const [form, setForm] = useState(client);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) {
      alert('נא למלא את כל השדות');
      return;
    }
    onUpdate(client.key, form);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-2xl font-bold mb-4">✏️ ערוך לקוח</h3>
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
            <label className="block font-semibold mb-2">אזור</label>
            <select
              value={form.region}
              onChange={e => setForm({ ...form, region: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
            >
              <option value="מרכז">מרכז</option>
              <option value="משולש">משולש</option>
              <option value="צפון">צפון</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-2">ח.פ</label>
            <input
              type="text"
              value={form.vat}
              onChange={e => setForm({ ...form, vat: e.target.value })}
              className="w-full border-2 border-gray-300 rounded-lg p-2"
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

function PricingModal({ client, clientPrices, productsDB, onUpdatePrice, onResetPrice, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [editPrice, setEditPrice] = useState('');

  const productTypes = ['all', ...new Set(Object.values(productsDB).map(p => p.type))];

  const filteredProducts = Object.entries(productsDB).filter(([code, product]) => {
    if (selectedType !== 'all' && product.type !== selectedType) return false;
    if (searchTerm && !product.name.includes(searchTerm) && !code.includes(searchTerm)) return false;
    return true;
  });

  const getPrice = (code) => {
    return clientPrices[code] !== undefined ? clientPrices[code] : productsDB[code].basePrice;
  };

  const hasCustomPrice = (code) => {
    return clientPrices[code] !== undefined;
  };

  const startEdit = (code) => {
    setEditingProduct(code);
    setEditPrice(getPrice(code).toString());
  };

  const saveEdit = (code) => {
    const newPrice = parseFloat(editPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      onUpdatePrice(code, newPrice);
    }
    setEditingProduct(null);
    setEditPrice('');
  };

  const customPriceCount = Object.keys(clientPrices).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold mb-2">💰 ניהול מחירים - {client.name}</h3>
              <div className="text-sm opacity-90">{client.region} | ח.פ: {client.vat}</div>
              <div className="mt-2 bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm inline-block">
                {customPriceCount} מוצרים עם תמחור מותאם
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition">✕</button>
          </div>
        </div>

        <div className="p-6 border-b space-y-4">
          <input
            type="text"
            placeholder="🔍 חיפוש מוצר או קוד..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border-2 border-gray-300 rounded-lg p-3"
          />
          <div className="flex gap-2 overflow-x-auto pb-2">
            {productTypes.map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition ${selectedType === type ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {type === 'all' ? 'הכל' : type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {filteredProducts.map(([code, product]) => (
              <div
                key={code}
                className={`p-4 rounded-lg border-2 transition ${hasCustomPrice(code) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-bold text-lg">{product.name}</div>
                      {hasCustomPrice(code) && <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">מותאם</span>}
                    </div>
                    <div className="text-sm text-gray-600">קוד: {code} | סוג: {product.type} | גליל: {product.rollLength}מ'</div>
                    {hasCustomPrice(code) && <div className="text-xs text-gray-500 mt-1">מחיר בסיס: {formatCurrency(productsDB[code].basePrice)}</div>}
                  </div>

                  <div className="flex items-center gap-3">
                    {editingProduct === code ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          className="w-24 border-2 border-gray-300 rounded-lg p-2 text-center"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(code); }}
                        />
                        <button onClick={() => saveEdit(code)} className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg">✔</button>
                        <button onClick={() => { setEditingProduct(null); setEditPrice(''); }} className="p-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg">✕</button>
                      </div>
                    ) : (
                      <>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">{formatCurrency(getPrice(code))}</div>
                          <div className="text-xs text-gray-500">{product.soldBy === 'meters' ? 'למטר' : 'לגליל'}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(code)} className="p-2 bg-gray-500 hover:bg-green-600 text-white rounded-lg">✏️</button>
                          {hasCustomPrice(code) && <button onClick={() => onResetPrice(code)} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg">🔄</button>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl text-gray-500">לא נמצאו מוצרים</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 rounded-b-lg">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">💡 טיפ: לחץ על ✏️ לעריכת מחיר, 🔄 לאיפוס למחיר בסיס</div>
            <button onClick={onClose} className="bg-gray-500 hover:bg-green-600 text-white font-bold px-6 py-2 rounded-lg">סגור</button>
          </div>
        </div>
      </div>
    </div>
  );
}