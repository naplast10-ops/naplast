import React, { useMemo } from "react";

export default function PriceListSidebar({ products, onAddProduct }) {
  const grouped = useMemo(() => {
    const byCat = {};
    for (const p of products) {
      const cat = p.category || "אחר";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(p);
    }
    return byCat;
  }, [products]);

  return (
    <aside className="w-72 border-r border-gray-200 bg-white p-3 overflow-auto">
      <h2 className="text-lg font-semibold mb-3">מוצרים</h2>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm text-slate-700">{cat}</h3>
            <button
              className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
              onClick={() => items.forEach((p) => onAddProduct(p))}
            >
              הוסף הכל
            </button>
          </div>
          <ul className="space-y-1">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <button
                  className="text-right hover:underline"
                  onClick={() => onAddProduct(p)}
                >
                  {p.name}
                </button>
                <span className="text-slate-500">{p.base_price}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
