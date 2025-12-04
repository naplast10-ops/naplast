import React from "react";

export default function PriceListEditor({
  clients,
  selectedClient,
  onSelectClient,
  items,
  products,
  onUpdateItem,
  onRemoveItem,
}) {
  const getProduct = (id) => products.find((p) => p.id === id);

  return (
    <section className="bg-white rounded shadow p-4">
      <div className="flex flex-wrap gap-4 items-center mb-4">
        <div className="flex flex-col min-w-[200px]">
          <label className="text-xs text-slate-500 mb-1">לקוח</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={selectedClient?.id || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const c = clients.find((c) => c.id === id) || null;
              onSelectClient(c);
            }}
          >
            <option value="">בחר לקוח...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.city ? `(${c.city})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="w-full text-sm border-t border-slate-200">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-600">
            <th className="text-right p-2">#</th>
            <th className="text-right p-2">תיאור</th>
            <th className="text-right p-2">מקט</th>
            <th className="text-right p-2">כמות</th>
            <th className="text-right p-2">מחיר יחידה</th>
            <th className="text-right p-2">סה״כ</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const p = getProduct(item.productId);
            const qty = item.qty || 1;
            const unitPrice = item.unitPrice ?? (p?.base_price || 0);
            const total = qty * unitPrice;

            return (
              <tr key={idx} className="border-t">
                <td className="p-2 text-right text-xs">{idx + 1}</td>
                <td className="p-2 text-right">{p?.name || ""}</td>
                <td className="p-2 text-right text-slate-500">
                  {p?.sku}
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min="1"
                    className="w-20 border rounded px-1 py-0.5 text-sm text-right"
                    value={qty}
                    onChange={(e) =>
                      onUpdateItem(idx, { qty: Number(e.target.value) || 1 })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-24 border rounded px-1 py-0.5 text-sm text-right"
                    value={unitPrice}
                    onChange={(e) =>
                      onUpdateItem(idx, {
                        unitPrice: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="p-2 text-right">{total.toFixed(2)}</td>
                <td className="p-2 text-center">
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => onRemoveItem(idx)}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="p-4 text-center text-sm text-slate-500">
                עדיין לא נבחרו פריטים.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
