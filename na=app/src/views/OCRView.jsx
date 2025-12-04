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

export default function OCRView({ onSave, clientsDB, productsDB, clientPrices }) {
  const [images, setImages] = useState([]);
  const [uploadName, setUploadName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const selectFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.onchange = async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      setLoading(true);
      setProgress(0);
      try {
        const imageList = await fileToImages(file);
        if (!imageList.length) {
          alert('לא ניתן לקרוא את הקובץ שנבחר');
          return;
        }
        setImages(imageList);
        setUploadName(file.name || 'מסמך ללא שם');
        setResult(null);
      } catch (error) {
        console.error('Error loading file for OCR:', error);
        alert('❌ שגיאה בטעינת הקובץ');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const clearSelection = () => {
    setImages([]);
    setUploadName('');
    setProgress(0);
    setResult(null);
    setLoading(false);
  };

  // Replace the runOCR function in your OCRView component with this updated version:

  const runOCR = async () => {
    if (!images.length) return;
    setLoading(true);
    setProgress(5);

    try {
      // Process ALL pages, not just the first one
      let allResults = [];

      for (let pageIndex = 0; pageIndex < images.length; pageIndex++) {
        // Update progress for each page
        const baseProgress = (pageIndex / images.length) * 90;
        
        const { data: { text } } = await Tesseract.recognize(images[pageIndex], 'heb+eng', {
          logger: (message) => {
            if (message.status === 'recognizing text') {
              const pageProgress = baseProgress + (message.progress * (90 / images.length));
              setProgress(Math.max(5, Math.min(95, Math.round(pageProgress))));
            }
          }
        });

        const lines = text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        // Extract delivery note from this page
        const noteFromPage = extractDeliveryNote(lines, pageIndex + 1);
        
        if (noteFromPage && noteFromPage.items.length > 0) {
          allResults.push(noteFromPage);
        }
      }

      setProgress(100);

      if (allResults.length === 0) {
        alert('לא נמצאו תעודות משלוח תקינות בקובץ');
        setLoading(false);
        return;
      }

      // If multiple notes found, let user review all of them
      if (allResults.length === 1) {
        setResult(allResults[0]);
      } else {
        // Show all found notes for review
        setResult({
          multipleNotes: true,
          notes: allResults,
          totalNotes: allResults.length
        });
      }

    } catch (error) {
      console.error('OCR Error:', error);
      alert('שגיאה בעיבוד המסמך');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to extract a single delivery note from text lines
  const extractDeliveryNote = (lines, pageNumber) => {
    let clientName = 'לא זוהה';
    let clientVAT = '';
    let region = '';
    let clientKey = '';

    // Find client by name or key
    for (const line of lines) {
      for (const [key, client] of Object.entries(clientsDB)) {
        if (line.includes(client.name) || line.includes(key)) {
          clientName = client.name;
          clientVAT = client.vat;
          region = client.region;
          clientKey = key;
          break;
        }
      }
      if (clientName !== 'לא זוהה') break;
    }

    // Find client by VAT if not found by name
    if (clientName === 'לא זוהה') {
      for (const line of lines) {
        const vats = line.match(/\b5[0-9]{8}\b/g);
        if (vats) {
          for (const vat of vats) {
            if (vat !== MY_VAT) {
              for (const [key, client] of Object.entries(clientsDB)) {
                if (client.vat === vat) {
                  clientName = client.name;
                  clientVAT = vat;
                  region = client.region;
                  clientKey = key;
                  break;
                }
              }
            }
            if (clientName !== 'לא זוהה') break;
          }
        }
        if (clientName !== 'לא זוהה') break;
      }
    }

    // Extract document number and date
    const combinedText = lines.join('\n');
    let docNum = '';
    let docDate = '';
    
    const docNumMatch = combinedText.match(/\b\d{2}\/\d{6}\b/);
    if (docNumMatch) docNum = docNumMatch[0];
    
    const dateMatch = combinedText.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    if (dateMatch) docDate = dateMatch[0];

    // Extract products
    const items = [];
    const foundProducts = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const [code, productInfo] of Object.entries(productsDB)) {
        if (!line.includes(code) || foundProducts.has(code)) continue;

        let quantity = 0;
        const decimalMatch = line.match(/(\d{1,4})\.\d{2}/);
        if (decimalMatch) {
          quantity = parseFloat(decimalMatch[0]);
        }

        if ((quantity === 0 || Number.isNaN(quantity)) && i > 0) {
          const prevMatch = lines[i - 1].match(/(\d{1,4})\.\d{2}/);
          if (prevMatch) quantity = parseFloat(prevMatch[0]);
        }

        if ((quantity === 0 || Number.isNaN(quantity)) && i < lines.length - 1) {
          const nextMatch = lines[i + 1].match(/(\d{1,4})\.\d{2}/);
          if (nextMatch) quantity = parseFloat(nextMatch[0]);
        }

        if (quantity <= 0 || quantity > 10000) continue;

        const basePrice = productInfo.basePrice ?? productInfo.price ?? 0;
        const clientPrice =
          clientKey &&
          clientPrices[clientKey] &&
          clientPrices[clientKey][code] !== undefined
            ? clientPrices[clientKey][code]
            : basePrice;

        const rollLength = productInfo.rollLength || 1;
        let meters = 0;
        let pieces = 0;
        let revenue = 0;

        if (productInfo.soldBy === 'meters') {
          meters = quantity;
          pieces = rollLength ? Math.ceil(quantity / rollLength) : quantity;
          revenue = quantity * clientPrice;
        } else if (productInfo.soldBy === 'units') {
          pieces = Math.round(quantity);
          if (!pieces && quantity > 0) pieces = Math.ceil(quantity);
          meters = rollLength ? pieces * rollLength : pieces;
          revenue = pieces * clientPrice;
        } else {
          pieces = Math.round(quantity);
          if (!pieces && quantity > 0) pieces = Math.ceil(quantity);
          meters = rollLength ? pieces * rollLength : pieces;
          revenue = pieces * clientPrice;
        }

        items.push({
          code,
          name: productInfo.name,
          amount: meters,
          pieces,
          rollLength,
          price: clientPrice,
          revenue,
          soldBy: productInfo.soldBy,
          quantity
        });

        foundProducts.add(code);
        break;
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const totalPieces = items.reduce((sum, item) => sum + item.pieces, 0);
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);

    return {
      clientName,
      clientVAT,
      clientKey,
      region,
      docNum,
      docDate,
      items,
      totalAmount,
      totalPieces,
      totalRevenue,
      sourceFile: uploadName,
      pageNumber
    };
  };
  const saveNote = () => {
    if (!result) return;
    onSave({
      ...result,
      createdAt: new Date().toISOString()
    });
    alert('✅ התעודה נשמרה בהצלחה!');
    clearSelection();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">📸 זיהוי תעודות משלוח</h2>

      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button onClick={selectFile} className="btn-primary px-6 py-3 text-lg">
              📁 בחר קובץ
            </button>
            {uploadName && (
              <div className="mt-2 text-sm text-gray-600">
                📄 {uploadName}
              </div>
            )}
          </div>

          {images.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={runOCR}
                disabled={loading}
                className="btn-success px-4 py-2 text-lg"
              >
                {loading ? `🔄 מעבד... ${progress}%` : '🚀 זהה תעודה'}
              </button>
              <button onClick={clearSelection} className="btn-danger px-4 py-2 text-lg">
                🗑️ איפוס
              </button>
            </div>
          )}
        </div>

        {images.length > 0 && (
          <div className="space-y-4">
            <img
              src={images[0]}
              alt="תצוגה מקדימה של התעודה"
              className="w-full rounded-lg border-4 border-gray-300"
            />
            {images.length > 1 && (
              <div className="text-sm text-gray-500">
                מציג עמוד 1 מתוך {images.length}. לעיבוד ישולבו כל העמודים.
              </div>
            )}
            {loading && (
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-green-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {result && !result.multipleNotes && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border-4 border-green-500 space-y-6">
            <div className="text-center text-2xl font-bold text-green-700">
              ✅ זוהתה תעודה בהצלחה
            </div>

            <div className="bg-white rounded-lg p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900 mb-2">
                    {result.clientName}
                  </div>
                  <div className="text-xl text-gray-600">
                    ח.פ: {result.clientVAT || 'לא זוהה'}
                  </div>
                </div>
                {result.region && (
                  <div className="bg-gray-100 text-blue-700 px-4 py-2 rounded-full font-bold self-start">
                    {result.region}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg">
                <div className="text-sm text-gray-600">תעודה</div>
                <div className="text-xl font-bold">{result.docNum || '—'}</div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <div className="text-sm text-gray-600">תאריך</div>
                <div className="text-xl font-bold">{result.docDate || '—'}</div>
              </div>
            </div>

            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
              {result.items.map((item, index) => (
                <div key={`${item.code}-${index}`} className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-lg">{item.name}</div>
                      <div className="text-xs text-gray-500">קוד: {item.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {item.soldBy === 'meters'
                          ? `${item.amount.toFixed(2)} מ'`
                          : `${item.pieces} יח'`}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t pt-2">
                    <div className="text-gray-600">
                      {item.soldBy === 'meters'
                        ? `${item.amount.toFixed(2)} מטר × ${formatCurrency(item.price)}`
                        : `${item.pieces} יחידות × ${formatCurrency(item.price)}${item.rollLength ? ` (גליל ${item.rollLength}מ')` : ''}`}
                    </div>
                    <div className="text-xl font-bold text-green-600">
                      {formatCurrency(item.revenue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-lg text-white text-center">
                <div className="text-sm font-bold">סה"כ מטרים</div>
                <div className="text-3xl font-black mt-2">
                  {result.totalAmount.toFixed(2)}
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 rounded-lg text-white text-center">
                <div className="text-sm font-bold">סה"כ יחידות</div>
                <div className="text-3xl font-black mt-2">
                  {result.totalPieces}
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 rounded-lg text-white text-center">
                <div className="text-sm font-bold">סה"כ הכנסה</div>
                <div className="text-3xl font-black mt-2">
                  {formatCurrency(result.totalRevenue)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={saveNote} className="btn-success text-lg px-6">
                💾 שמור תעודה
              </button>
              <button onClick={() => setResult(null)} className="btn-secondary">
                🔄 אפס תוצאה
              </button>
            </div>
          </div>
        )}

        {result && result.multipleNotes && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border-4 border-green-500 space-y-6">
            <div className="text-center text-2xl font-bold text-green-700">
              ✅ נמצאו {result.totalNotes} תעודות משלוח
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {result.notes.map((note, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 shadow-md">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-xl font-bold">{note.clientName}</div>
                      <div className="text-sm text-gray-600">
                        תעודה: {note.docNum} | תאריך: {note.docDate} | עמוד {note.pageNumber}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(note.totalRevenue)}
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    {note.items.length} פריטים | {note.totalPieces} יחידות | {note.totalAmount.toFixed(2)} מטר
                  </div>

                  <button
                    onClick={() => {
                      onSave({
                        ...note,
                        createdAt: new Date().toISOString()
                      });
                      alert(`✅ תעודה ${idx + 1} נשמרה בהצלחה!`);
                    }}
                    className="mt-3 btn-success text-sm w-full"
                  >
                    💾 שמור תעודה זו
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  result.notes.forEach((note, idx) => {
                    onSave({
                      ...note,
                      createdAt: new Date().toISOString()
                    });
                  });
                  alert(`✅ כל ${result.totalNotes} התעודות נשמרו בהצלחה!`);
                  clearSelection();
                }}
                className="flex-1 btn-success text-lg"
              >
                💾 שמור את כל התעודות ({result.totalNotes})
              </button>
              <button onClick={() => setResult(null)} className="btn-secondary">
                🔄 איפוס
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

