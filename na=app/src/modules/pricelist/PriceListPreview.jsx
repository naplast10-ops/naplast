import React, { useMemo } from "react";

export default function PriceListPreview({ items, products, client }) {
  const rows = useMemo(() => {
    return items.map((item, idx) => {
      const p = products.find((p) => p.id === item.productId);
      const qty = item.qty || 1;
      const unitPrice = item.unitPrice ?? (p?.base_price || 0);
      const total = qty * unitPrice;
      return { index: idx + 1, product: p, qty, unitPrice, total };
    });
  }, [items, products]);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <section className="bg-white rounded shadow p-6">
      <div className="flex justify-between mb-4 text-sm">
        <div>
          <div className="font-semibold text-base">נ.א. קאסם פלסט בע״מ</div>
          <div className="text-xs text-slate-500">
            מחירון / הצעת מחיר
          </div>
        </div>
        <div className="text-right text-xs text-slate-600">
          {client ? (
            <>
              <div className="font-semibold">{client.name}</div>
              {client.city && <div>{client.city}</div>}
              {client.vat_number && <div>ע.מ/ת.ז: {client.vat_number}</div>}
            </>
          ) : (
            <div className="text-slate-400">לא נבחר לקוח</div>
          )}
        </div>
      </div>

      <table className="w-full text-xs border-t border-slate-200">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="text-right p-2">#</th>
            <th className="text-right p-2">תיאור</th>
            <th className="text-right p-2">מקט</th>
            <th className="text-right p-2">כמות</th>
            <th className="text-right p-2">מחיר יחידה</th>
            <th className="text-right p-2">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index} className="border-t">
              <td className="p-2 text-right">{row.index}</td>
              <td className="p-2 text-right">{row.product?.name}</td>
              <td className="p-2 text-right text-slate-500">
                {row.product?.sku}
              </td>
              <td className="p-2 text-right">{row.qty}</td>
              <td className="p-2 text-right">
                {row.unitPrice.toFixed(2)}
              </td>
              <td className="p-2 text-right">{row.total.toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-slate-400">
                אין פריטים להצגה.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t bg-slate-50">
              <td colSpan={5} className="p-2 text-right font-semibold">
                סה״כ
              </td>
              <td className="p-2 text-right font-semibold">
                {grandTotal.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
