import React, { useState, useEffect } from "react";
import PriceListSidebar from "./PriceListSidebar";
import PriceListEditor from "./PriceListEditor";
import PriceListPreview from "./PriceListPreview";

export default function PriceListView() {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [items, setItems] = useState([]);

  // Document meta (saved to localStorage)
  const [docTitle, setDocTitle] = useState("מחירון צנרת וחשמל");
  const [companyName, setCompanyName] = useState("נ.א קאסם פלסט בע״מ");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const productsRes = await fetch("./src/data/products.json");
        const productsJson = await productsRes.json();
        const productsArray = Array.isArray(productsJson)
          ? productsJson
          : Object.values(productsJson || {});
        setProducts(productsArray);

        const clientsRes = await fetch("./src/data/clients.json");
        const clientsJson = await clientsRes.json();
        const clientsArray = Array.isArray(clientsJson)
          ? clientsJson
          : Object.values(clientsJson || {});
        setClients(clientsArray);

        // Load document meta from localStorage
        const savedMeta = JSON.parse(
          window.localStorage.getItem("pricelist_meta") || "null"
        );
        if (savedMeta) {
          if (savedMeta.docTitle) setDocTitle(savedMeta.docTitle);
          if (savedMeta.companyName) setCompanyName(savedMeta.companyName);
          if (savedMeta.issueDate) setIssueDate(savedMeta.issueDate);
          if (savedMeta.validUntil) setValidUntil(savedMeta.validUntil);
          if (savedMeta.notes) setNotes(savedMeta.notes);
        }
      } catch (err) {
        console.error("Failed to load price list data", err);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    // Persist meta whenever it changes
    const meta = {
      docTitle,
      companyName,
      issueDate,
      validUntil,
      notes,
    };
    try {
      window.localStorage.setItem("pricelist_meta", JSON.stringify(meta));
    } catch (err) {
      console.warn("Failed to persist pricelist meta", err);
    }
  }, [docTitle, companyName, issueDate, validUntil, notes]);

  const handleAddProduct = (product) => {
    if (!product) return;
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        qty: 1,
        unitPrice: product.base_price ?? 0,
      },
    ]);
  };

  const handleUpdateItem = (index, patch) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-2">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900">ניהול מחירון</h1>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {products.length} מוצרים בקטלוג
              </span>
            </div>
            <p className="text-sm text-gray-500">
              יצירת מחירון מותאם ללקוח לפי קטגוריות מוצרים ותוקף מסמך.
            </p>
          </div>
        </div>

        {/* Document meta */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              כותרת מחירון
            </label>
            <input
              type="text"
              className="rounded-md border-gray-200 text-sm px-2 py-1.5 focus:border-emerald-500 focus:ring-emerald-500"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              חברה מנפיקה
            </label>
            <input
              type="text"
              className="rounded-md border-gray-200 text-sm px-2 py-1.5 focus:border-emerald-500 focus:ring-emerald-500"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              תאריך הנפקה
            </label>
            <input
              type="date"
              className="rounded-md border-gray-200 text-sm px-2 py-1.5 focus:border-emerald-500 focus:ring-emerald-500"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              בתוקף עד
            </label>
            <input
              type="date"
              className="rounded-md border-gray-200 text-sm px-2 py-1.5 focus:border-emerald-500 focus:ring-emerald-500"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">
            הערות כלליות
          </label>
          <textarea
            className="w-full rounded-md border-gray-200 text-sm px-2 py-1.5 focus:border-emerald-500 focus:ring-emerald-500"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="לדוגמה: המחירים לפני מע״מ, המחירון בכפוף לשינויים בשער נחושת ופוליאתילן..."
          />
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-6 gap-4">
        {/* Left: product categories */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full">
            <PriceListSidebar products={products} onAddProduct={handleAddProduct} />
          </div>
        </div>

        {/* Middle: editor */}
        <div className="xl:col-span-2">
          <PriceListEditor
            clients={clients}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClient}
            items={items}
            products={products}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
          />
        </div>

        {/* Right: preview */}
        <div className="xl:col-span-2">
          <PriceListPreview
            items={items}
            products={products}
            client={selectedClient}
          />
        </div>
      </div>
    </div>
  );
}
