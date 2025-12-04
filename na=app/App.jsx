import { useState, useEffect, useMemo } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const fileToImages = async (file) => {
  const name = file?.name || '';
  const isPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const images = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL('image/png'));
      canvas.width = 0;
      canvas.height = 0;
    }

    return images;
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve([result]);
      } else {
        reject(new Error('Unsupported file result'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Complete Client Database (61 clients sorted by region)
const INITIAL_CLIENTS_DB = {
  // מרכז
  'אור יהודה': { name: 'חשמל ישיר אור יהודה', region: 'מרכז', vat: '001', pricing: {} },
  'הרצליה': { name: 'חשמל ישיר הרצליה בע"מ', region: 'מרכז', vat: '002', pricing: {} },
  'כפר סבא': { name: 'חשמל ישיר הוד השרון-כפר סבא', region: 'מרכז', vat: '003', pricing: {} },
  'נתניה א.א': { name: 'א.א סיטונאות חשמל הזולים בשרון', region: 'מרכז', vat: '004', pricing: {} },
  'נתניה אור': { name: 'אור לכל חשמל ותאורה', region: 'מרכז', vat: '005', pricing: {} },
  'נתניה אמפריה': { name: 'אמפריה זאב מ.ש בע"מ', region: 'מרכז', vat: '006', pricing: {} },
  'נתניה דור': { name: 'דור חדש חומרי חשמל', region: 'מרכז', vat: '007', pricing: {} },
  'נתניה פלא': { name: 'פלא ייעוץ תאורה וחשמל בע"מ', region: 'מרכז', vat: '008', pricing: {} },
  'פתח תקווה': { name: 'חשמל ישיר השרון ג"מ', region: 'מרכז', vat: '009', pricing: {} },
  'ראשון לציון': { name: 'ה.צ.ח. מוצרי חשמל בע"מ שוש', region: 'מרכז', vat: '010', pricing: {} },
  'רעננה': { name: 'ראש חשמל רעננה בע"מ', region: 'מרכז', vat: '011', pricing: {} },
  'תל אביב האוס': { name: 'האוס אג\'נט בע"מ', region: 'מרכז', vat: '012', pricing: {} },
  'תל אביב': { name: 'חשמל ישיר תל אביב', region: 'מרכז', vat: '516001799', pricing: {} },

  // משולש
  'כפר קאסם': { name: 'חשמל אלנור', region: 'משולש', vat: '013', pricing: {} },
  'קלנסווה': { name: 'היתן עבודות ואספקת חשמל', region: 'משולש', vat: '014', pricing: {} },
  'טייבה כלבו': { name: 'כלבו חשמל ליין טייבה', region: 'משולש', vat: '015', pricing: {} },
  'טייבה קליק': { name: 'קליק שירותי חשמל', region: 'משולש', vat: '016', pricing: {} },
  'טירה חשמל': { name: 'חשמל העיר מוחמד', region: 'משולש', vat: '017', pricing: {} },
  'טירה ד.ס': { name: 'ד.ס. אלעאמר גרופ', region: 'משולש', vat: '018', pricing: {} },

  // צפון
  'אכסאל': { name: 'חשמל הצפון', region: 'צפון', vat: '019', pricing: {} },
  'אעבלין': { name: 'סקיי לייטינג - חטיב סלימאן', region: 'צפון', vat: '020', pricing: {} },
  'גדידה מכר': { name: 'חשמל אדאם אנד מ לייט בע"מ', region: 'צפון', vat: '021', pricing: {} },
  'דאליית אלכרמל': { name: 'רם אספקה בע"מ', region: 'צפון', vat: '022', pricing: {} },
  'דבוריה': { name: 'יוסף דיב הובלות ומכירת מוצרי', region: 'צפון', vat: '023', pricing: {} },
  'דיר אלאסד': { name: 'טאהן חשמל ותאורה בע"מ', region: 'צפון', vat: '024', pricing: {} },
  'זרזיר': { name: 'מרואן נעראני', region: 'צפון', vat: '025', pricing: {} },
  'חיפה סל': { name: 'סל חשמל בע"מ', region: 'צפון', vat: '026', pricing: {} },
  'חיפה': { name: 'חשמל ישיר', region: 'צפון', vat: '027', pricing: {} },
  'טמרה בית': { name: 'בית החשמל', region: 'צפון', vat: '028', pricing: {} },
  'טמרה 2020': { name: 'חשמל 2020 בע"מ', region: 'צפון', vat: '029', pricing: {} },
  'ירכא': { name: 'א.ס. רמאל אביזרי חשמל ותאורה', region: 'צפון', vat: '030', pricing: {} },
  'כאבול': { name: 'חשמל כאבול', region: 'צפון', vat: '031', pricing: {} },
  'כפר גוליס': { name: 'קשת הום אלקטריק בע"מ', region: 'צפון', vat: '032', pricing: {} },
  'כפר מנדא': { name: 'חשמל ואינסטלציה מנדא', region: 'צפון', vat: '033', pricing: {} },
  'כרמיאל א': { name: 'א. חשמל כרמיאל בע"מ', region: 'צפון', vat: '034', pricing: {} },
  'כרמיאל חוליו': { name: 'חשמל חוליו', region: 'צפון', vat: '035', pricing: {} },
  'מגאר אלמיראג': { name: 'אלמיראג תאורה בע"מ', region: 'צפון', vat: '036', pricing: {} },
  'מגאר עאדל': { name: 'עאדל סרחאן בע"מ', region: 'צפון', vat: '037', pricing: {} },
  'מגד אלכרום': { name: 'סרחאן חומרי חשמל ותאורה בע"מ', region: 'צפון', vat: '038', pricing: {} },
  'משהד': { name: 'ל.ל. חסן יבוא ומסחר עמאר', region: 'צפון', vat: '039', pricing: {} },
  'נצרת אמגד': { name: 'א.מ.גד חשמל ותקשורת בע"מ אמגד', region: 'צפון', vat: '040', pricing: {} },
  'נצרת כיפאח': { name: 'גרין לייט כיפאח בע"מ כיפאח', region: 'צפון', vat: '041', pricing: {} },
  'נצרת ווואן': { name: 'ווואן לייט חשמל ותאורה אחמד מחאמיד', region: 'צפון', vat: '042', pricing: {} },
  'נצרת חטיב': { name: 'ח\'טיב כאזם אחמד', region: 'צפון', vat: '043', pricing: {} },
  'נצרת זעאתרה': { name: 'חשמל זעאתרה', region: 'צפון', vat: '044', pricing: {} },
  'נצרת סלטי': { name: 'סלטי אחזקות בע"מ', region: 'צפון', vat: '045', pricing: {} },
  'נצרת סן': { name: 'סן לייט לחשמל בע"מ', region: 'צפון', vat: '046', pricing: {} },
  'סחנין': { name: 'תמנע מוליכים בע"מ חסן', region: 'צפון', vat: '047', pricing: {} },
  'עייאבון': { name: 'חאיק נסים', region: 'צפון', vat: '048', pricing: {} },
  'עילוט המרכז': { name: 'חשמל המרכז אליאס', region: 'צפון', vat: '049', pricing: {} },
  'עילוט ווארדי': { name: 'חשמל ווארדי הגליל חכם', region: 'צפון', vat: '050', pricing: {} },
  'עכו': { name: 'חביב יוסף בע"מ', region: 'צפון', vat: '051', pricing: {} },
  'עפולה': { name: 'חשמל ישיר', region: 'צפון', vat: '052', pricing: {} },
  'פוריידיס תאורה': { name: 'מראענה תאורה וחשמל', region: 'צפון', vat: '053', pricing: {} },
  'פוריידיס מסחר': { name: 'מראענה מסחר ושיווק בע"מ', region: 'צפון', vat: '054', pricing: {} },
  'קיסריה': { name: 'חשמל ישיר', region: 'צפון', vat: '055', pricing: {} },
  'ריינה זידאן': { name: 'א.ח. זידאן פרימיום', region: 'צפון', vat: '056', pricing: {} },
  'ריינה מור': { name: 'מור לייט', region: 'צפון', vat: '057', pricing: {} },
  'שפרעם ענק': { name: 'א. ענק החשמל איאד', region: 'צפון', vat: '058', pricing: {} },
  'שפרעם דאמוני': { name: 'דאמוני תאורה ומסחר בע"מ', region: 'צפון', vat: '059', pricing: {} },
  'עיספיה': { name: 'א.ם.ל הנדסת חשמל בע"מ', region: 'צפון', vat: '060', pricing: {} },
  'סנדלה': { name: 'חשמל סעיד', region: 'צפון', vat: '061', pricing: {} }
};

// Complete Product Database
const INITIAL_PRODUCTS_DB = {
  // שחור
  '5002116': { name: 'צינור שחור 16', type: 'שחור', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 62 },
  '5002120': { name: 'צינור שחור 20', type: 'שחור', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 62 },
  '5002125': { name: 'צינור שחור 25', type: 'שחור', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 62 },
  '5002132': { name: 'צינור שחור 32', type: 'שחור', width: 32, rollLength: 50, soldBy: 'rolls', basePrice: 105 },
  '5002140': { name: 'צינור שחור 40', type: 'שחור', width: 40, rollLength: 50, soldBy: 'rolls', basePrice: 170 },
  '5002150': { name: 'צינור שחור תקשורת 50', type: 'שחור', width: 50, rollLength: 50, soldBy: 'rolls', basePrice: 175 },
  '5002250': { name: 'צינור שחור תקשורת וחסין 50', type: 'שחור', width: 50, rollLength: 50, soldBy: 'rolls', basePrice: 175 },
  
  // ירוק
  '5003116': { name: 'צינור ירוק 16', type: 'ירוק', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5004120': { name: 'צינור ירוק 20', type: 'ירוק', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005125': { name: 'צינור ירוק 25', type: 'ירוק', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  '5006132': { name: 'צינור ירוק 32', type: 'ירוק', width: 32, rollLength: 50, soldBy: 'rolls', basePrice: 160 },
  '5007140': { name: 'צינור ירוק 40', type: 'ירוק', width: 40, rollLength: 50, soldBy: 'rolls', basePrice: 260 },
  
  // אדום
  '5003216': { name: 'צינור אדום 16', type: 'אדום', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5004220': { name: 'צינור אדום 20', type: 'אדום', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005225': { name: 'צינור אדום 25', type: 'אדום', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  
  // צבוע
  '5003316': { name: 'צינור צבוע 16', type: 'צבוע', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5004320': { name: 'צינור צבוע 20', type: 'צבוע', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005325': { name: 'צינור צבוע 25', type: 'צבוע', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  
  // כחול
  '5003516': { name: 'צינור כחול 16', type: 'כחול', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5004520': { name: 'צינור כחול 20', type: 'כחול', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005525': { name: 'צינור כחול 25', type: 'כחול', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  '5006532': { name: 'צינור כחול 32', type: 'כחול', width: 32, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  
  // לבן
  '5004420': { name: 'צינור לבן 20', type: 'לבן', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005425': { name: 'צינור לבן 25', type: 'לבן', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  
  // חום
  '5004620': { name: 'צינור חום 20', type: 'חום', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 82 },
  '5005625': { name: 'צינור חום 25', type: 'חום', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 82 },
  '5006632': { name: 'צינור חום 32', type: 'חום', width: 32, rollLength: 50, soldBy: 'rolls', basePrice: 160 },
  
  // קוברה
  '6006140': { name: 'צינור קוברה 40', type: 'קוברה', width: 40, rollLength: 50, soldBy: 'rolls', basePrice: 100 },
  '6006150': { name: 'צינור קוברה 50', type: 'קוברה', width: 50, rollLength: 50, soldBy: 'rolls', basePrice: 110 },
  '6006175': { name: 'צינור קוברה 75', type: 'קוברה', width: 75, rollLength: 50, soldBy: 'rolls', basePrice: 160 },
  '6006110': { name: 'צינור קוברה 110 (n25)', type: 'קוברה', width: 110, rollLength: 25, soldBy: 'rolls', basePrice: 170 },
  '6006160': { name: 'צינור קוברה 160 (n25)', type: 'קוברה', width: 160, rollLength: 25, soldBy: 'meters', basePrice: 28 },
  
  // יקע
  '606850': { name: 'צינור 50 עם 50 (n100)', type: 'יקע', width: 50, rollLength: 100, soldBy: 'meters', basePrice: 5.6 },
  '606863': { name: 'צינור 63 עם (n100)', type: 'יקע', width: 63, rollLength: 100, soldBy: 'meters', basePrice: 8.2 },
  '606675': { name: 'צינור 75 עם (n100)', type: 'יקע', width: 75, rollLength: 100, soldBy: 'meters', basePrice: 12.5 },
  
  // שרשורי
  '500916': { name: 'צינור שרשורי 16', type: 'שרשורי', width: 16, rollLength: 100, soldBy: 'rolls', basePrice: 52 },
  '500920': { name: 'צינור שרשורי 20', type: 'שרשורי', width: 20, rollLength: 100, soldBy: 'rolls', basePrice: 62 },
  '500925': { name: 'צינור שרשורי 25', type: 'שרשורי', width: 25, rollLength: 50, soldBy: 'rolls', basePrice: 130 },
  '500932': { name: 'צינור שרשורי 32', type: 'שרשורי', width: 32, rollLength: 50, soldBy: 'rolls', basePrice: 180 },
  
  // קופסא
  'OM6001': { name: 'ABS IP65 200X300X130', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 60 },
  'OM6002': { name: 'ABS IP65 250X350X150', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 90 },
  'OM6004': { name: 'ABS IP65 300X400X220', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 105 },
  'OM6005': { name: 'ABS IP65 350X500X190', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 120 },
  'OM6007': { name: 'ABS IP65 400X500X240', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 130 },
  'OM6008': { name: 'ABS IP65 400X600X200', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 140 },
  'OM6009': { name: 'ABS IP65 500X600X220', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 210 },
  'OM6010': { name: 'ABS IP65 500X700X250', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 240 },
  'OM6011': { name: 'ABS IP65 600X800X260', type: 'קופסא', width: null, rollLength: 1, soldBy: 'units', basePrice: 320 }
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

export default function App() {
  const [view, setView] = useState('dashboard');
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [clientsDB, setClientsDB] = useState(INITIAL_CLIENTS_DB);
  const [productsDB, setProductsDB] = useState(INITIAL_PRODUCTS_DB);
  const [clientPrices, setClientPrices] = useState({});
  const [clientNotes, setClientNotes] = useState({});
  const [clientTags, setClientTags] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = () => {
      try {
        const saved = localStorage.getItem('nakasem_crm_data');
        if (saved) {
          const data = JSON.parse(saved);
          setDeliveryNotes(data.deliveryNotes || []);
          setClientsDB(data.clientsDB || INITIAL_CLIENTS_DB);
          setProductsDB(data.productsDB || INITIAL_PRODUCTS_DB);
          setClientPrices(data.clientPrices || {});
          setClientNotes(data.clientNotes || {});
          setClientTags(data.clientTags || {});
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem('nakasem_crm_data', JSON.stringify({
          deliveryNotes,
          clientsDB,
          productsDB,
          clientPrices,
          clientNotes,
          clientTags,
          lastSaved: new Date().toISOString()
        }));
      } catch (error) {
        console.error('Error saving data:', error);
      }
    }
  }, [deliveryNotes, clientsDB, productsDB, clientPrices, clientNotes, clientTags, loading]);

  // TAURI: Export data using Tauri file system
  const exportData = async () => {
    try {
      const data = JSON.stringify({
        deliveryNotes,
        clientsDB,
        productsDB,
        clientPrices,
        exportDate: new Date().toISOString(),
        version: '2.0.0'
      }, null, 2);

      const filePath = await save({
        defaultPath: `nakasem-crm-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (filePath) {
        await writeTextFile(filePath, data);
        alert('✅ הנתונים יוצאו בהצלחה!');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ שגיאה ביייצוא הנתונים');
    }
  };

  // TAURI: Import data using Tauri file system
  const importData = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      const filePath = Array.isArray(selected) ? selected[0] : selected;

      if (filePath) {
        const content = await readTextFile(filePath);
        const data = JSON.parse(content);
        
        if (data.deliveryNotes) setDeliveryNotes(data.deliveryNotes);
        if (data.clientsDB) setClientsDB(data.clientsDB);
        if (data.productsDB) setProductsDB(data.productsDB);
        if (data.clientPrices) setClientPrices(data.clientPrices);
        if (data.clientNotes) setClientNotes(data.clientNotes);
        if (data.clientTags) setClientTags(data.clientTags);
        alert('✅ הנתונים יובאו בהצלחה!');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('❌ שגיאה ביייבוא הנתונים');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold">טוען NA KASEM CRM...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col" dir="rtl">
      <nav className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🚀</div>
              <h1 className="text-2xl font-bold text-white">NA KASEM CRM</h1>
              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                🔒 Tauri Desktop
              </span>
            </div>
            
            <div className="flex gap-2">
              {[
                { key: 'dashboard', label: '📊 לוח בקרה' },
                { key: 'sales', label: '💰 מכירות והכנסות' },
                { key: 'clients', label: '👥 לקוחות' },
                { key: 'products', label: '📦 מוצרים ומלאי' },
                { key: 'pricelist', label: '📄 מחירון / הצעת מחיר' },
                { key: 'ai', label: '🤖 תובנות AI' },
                { key: 'ocr', label: '📸 סורק OCR' },
                { key: 'reports', label: '📈 דוחות' }
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    view === v.key ? 'bg-white text-blue-600 shadow-lg' : 'bg-blue-500 text-white hover:bg-blue-400'
                  }`}
                >
                  {v.label}
                </button>
              ))}
              
              <div className="border-r border-blue-400 mx-2"></div>
              
              <button onClick={exportData} className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg" title="יייצוא">💾</button>
              <button onClick={importData} className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg" title="יייבוא">📥</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 min-h-0 overflow-y-auto" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="max-w-7xl mx-auto p-6 space-y-8">
          {view === 'dashboard' && (
            <DashboardView
              notes={deliveryNotes}
              clientsDB={clientsDB}
              productsDB={productsDB}
              onNavigate={setView}
              onDeleteNote={(id) => setDeliveryNotes(deliveryNotes.filter(n => n.id !== id))}
            />
          )}
          {view === 'sales' && (
            <SalesRevenueView
              notes={deliveryNotes}
              clientsDB={clientsDB}
              productsDB={productsDB}
            />
          )}
          {view === 'clients' && (
            <ClientsView
              clientsDB={clientsDB}
              setClientsDB={setClientsDB}
              clientPrices={clientPrices}
              setClientPrices={setClientPrices}
              productsDB={productsDB}
              deliveryNotes={deliveryNotes}
              clientNotes={clientNotes}
              setClientNotes={setClientNotes}
              clientTags={clientTags}
              setClientTags={setClientTags}
            />
          )}
          {view === 'products' && (
            <ProductsView
              productsDB={productsDB}
              setProductsDB={setProductsDB}
              deliveryNotes={deliveryNotes}
            />
          )}
          {view === 'ai' && (
            <AIInsightsView
              notes={deliveryNotes}
              clientsDB={clientsDB}
              productsDB={productsDB}
            />
          )}
          {view === 'ocr' && (
            <OCRView
              onSave={(note) => setDeliveryNotes([...deliveryNotes, { ...note, id: generateId() }])}
              clientsDB={clientsDB}
              productsDB={productsDB}
              clientPrices={clientPrices}
            />
          )}
                    {view === 'pricelist' && (
            <PriceListView
              clientsDB={clientsDB}
              productsDB={productsDB}
            />
          )}
          {view === 'reports' && (
            <ReportsView
              notes={deliveryNotes}
              clientsDB={clientsDB}
              productsDB={productsDB}
            />
          )}
        </div>
      </main>
    </div>
  );
}


function PriceListView({ clientsDB, productsDB }) {
  const [mode, setMode] = useState('pricelist'); // 'quote' or 'pricelist'
  const [companyName, setCompanyName] = useState('נ.מ קאסם פלסט בע״מ');
  const [companyAddress, setCompanyAddress] = useState('באקא אלגרביה, רח׳ אלסראט 30100');
  const [companyPhone, setCompanyPhone] = useState('050-5342966');
  const [companyEmail, setCompanyEmail] = useState('naplast10@gmail.com');
  const [companyId, setCompanyId] = useState('515396513');

  const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [docDate, setDocDate] = useState(todayStr());
  const [validDays, setValidDays] = useState(30);
  const [priceListExpiry, setPriceListExpiry] = useState('');
  const [docNumber, setDocNumber] = useState('');

  // visibility toggles
  const [showTitle, setShowTitle] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showCompanyDetails, setShowCompanyDetails] = useState(true);
  const [showExpiry, setShowExpiry] = useState(true);

  // client search
  const [clientQuery, setClientQuery] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientActiveIndex, setClientActiveIndex] = useState(0);
  const [selectedClientKey, setSelectedClientKey] = useState(null);

  // items
  const [items, setItems] = useState([]);

  // product search
  const [productSearch, setProductSearch] = useState('');

  // load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nakasem_pricelist_settings');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.mode) setMode(s.mode);
        if (s.companyName) setCompanyName(s.companyName);
        if (s.companyAddress) setCompanyAddress(s.companyAddress);
        if (s.companyPhone) setCompanyPhone(s.companyPhone);
        if (s.companyEmail) setCompanyEmail(s.companyEmail);
        if (s.companyId) setCompanyId(s.companyId);
        if (s.docDate) setDocDate(s.docDate);
        if (typeof s.validDays === 'number') setValidDays(s.validDays);
        if (s.priceListExpiry) setPriceListExpiry(s.priceListExpiry);
        if (s.docNumber) setDocNumber(s.docNumber);
        if (typeof s.showTitle === 'boolean') setShowTitle(s.showTitle);
        if (typeof s.showSubtitle === 'boolean') setShowSubtitle(s.showSubtitle);
        if (typeof s.showCompanyDetails === 'boolean') setShowCompanyDetails(s.showCompanyDetails);
        if (typeof s.showExpiry === 'boolean') setShowExpiry(s.showExpiry);
      }
    } catch (e) {
      console.error('Failed to load pricelist settings', e);
    }
  }, []);

  // persist settings
  useEffect(() => {
    try {
      const data = {
        mode,
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        companyId,
        docDate,
        validDays,
        priceListExpiry,
        docNumber,
        showTitle,
        showSubtitle,
        showCompanyDetails,
        showExpiry
      };
      localStorage.setItem('nakasem_pricelist_settings', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save pricelist settings', e);
    }
  }, [mode, companyName, companyAddress, companyPhone, companyEmail, companyId, docDate, validDays, priceListExpiry, docNumber, showTitle, showSubtitle, showCompanyDetails, showExpiry]);

  const allClients = useMemo(
    () => Object.entries(clientsDB || {}).map(([key, client]) => ({ key, ...client })),
    [clientsDB]
  );

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim().toLowerCase();
    if (!term) return allClients.slice(0, 20);
    return allClients
      .filter(c => {
        const name = (c.name || '').toLowerCase();
        const key = (c.key || '').toLowerCase();
        const vat = (c.vat || '').toLowerCase();
        const region = (c.region || '').toLowerCase();
        return (
          name.includes(term) ||
          key.includes(term) ||
          vat.includes(term) ||
          region.includes(term)
        );
      })
      .slice(0, 20);
  }, [allClients, clientQuery]);

  const handleClientKeyDown = (e) => {
    if (!clientDropdownOpen && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
      setClientDropdownOpen(true);
      return;
    }
    if (!filteredClients.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setClientActiveIndex((prev) => (prev + 1) % filteredClients.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setClientActiveIndex((prev) => (prev - 1 + filteredClients.length) % filteredClients.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = filteredClients[clientActiveIndex] || filteredClients[0];
      if (chosen) {
        selectClient(chosen);
      }
    } else if (e.key === 'Escape') {
      setClientDropdownOpen(false);
    }
  };

  const selectClient = (client) => {
    setSelectedClientKey(client.key);
    setClientQuery(client.name || client.key);
    setClientDropdownOpen(false);
  };

  const productList = useMemo(
    () => Object.entries(productsDB || {}).map(([sku, product]) => ({ sku, ...product })),
    [productsDB]
  );

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return productList.slice(0, 50);
    return productList
      .filter(p => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const type = (p.type || '').toLowerCase();
        return (
          name.includes(term) ||
          sku.includes(term) ||
          type.includes(term)
        );
      })
      .slice(0, 50);
  }, [productList, productSearch]);

  const addProductToItems = (p) => {
    if (!p) return;
    setItems(prev => [
      ...prev,
      {
        sku: p.sku,
        name: p.name,
        unitPrice: Number(p.basePrice || 0),
        quantity: 1
      }
    ]);
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === 'quantity' || field === 'unitPrice') {
        const num = Number(value) || 0;
        return { ...item, [field]: num };
      }
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const clearItems = () => setItems([]);

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const formatDateDisplay = (val) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleDateString('he-IL');
  };

  const computedExpiryDate = useMemo(() => {
    if (mode === 'pricelist') {
      return priceListExpiry;
    }
    if (!docDate || !validDays) return '';
    const d = new Date(docDate);
    if (isNaN(d)) return '';
    d.setDate(d.getDate() + Number(validDays || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [mode, docDate, validDays, priceListExpiry]);

  const handleDownloadPDF = async () => {
    const el = document.getElementById('pricelist-preview');
    if (!el) return;
    const html2canvas = window.html2canvas;
    const jspdfLib = window.jspdf;
    if (!html2canvas || !jspdfLib) {
      alert('ספריות PDF (html2canvas/jsPDF) אינן טעונות. ודא שהסקריפטים נטענו ב-index.html.');
      return;
    }
    const { jsPDF } = jspdfLib;
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      const clientName = selectedClientKey && clientsDB[selectedClientKey] ? (clientsDB[selectedClientKey].name || selectedClientKey) : 'ללא-לקוח';
      const fileName = mode === 'pricelist'
        ? `מחירון-${clientName}.pdf`
        : `הצעת-מחיר-${docNumber || clientName}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF generation failed', err);
      alert('אירעה שגיאה ביצירת ה-PDF');
    }
  };

  const selectedClient = selectedClientKey ? clientsDB[selectedClientKey] : null;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📄 מחולל הצעת מחיר / מחירון</h1>
          <p className="text-sm text-gray-500 mt-1">
            יצירת מחירון או הצעת מחיר לפי לקוח, כולל שמירת הגדרות וייצוא ל-PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'quote' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`}
            onClick={() => setMode('quote')}
          >
            הצעת מחיר
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'pricelist' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`}
            onClick={() => setMode('pricelist')}
          >
            מחירון ללקוח
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left side - controls */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">פרטי חברה</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">שם החברה</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">ח.פ / ע.מ</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">כתובת</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={companyAddress}
                  onChange={e => setCompanyAddress(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">טלפון</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={companyPhone}
                  onChange={e => setCompanyPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">אימייל</label>
                <input
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={companyEmail}
                  onChange={e => setCompanyEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">בחירת לקוח</h2>
            <div className="relative">
              <label className="text-xs text-gray-600">חיפוש לקוח (שם / אזור / ח.פ)</label>
              <input
                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                placeholder="התחל להקליד – למשל 'נתניה' או 'חשמל ישיר'..."
                value={clientQuery}
                onChange={e => {
                  setClientQuery(e.target.value);
                  setClientDropdownOpen(true);
                  setClientActiveIndex(0);
                }}
                onFocus={() => setClientDropdownOpen(true)}
                onKeyDown={handleClientKeyDown}
              />
              {clientDropdownOpen && filteredClients.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto text-sm">
                  {filteredClients.map((c, idx) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`w-full text-right px-3 py-1.5 flex flex-col items-start hover:bg-blue-50 ${
                        idx === clientActiveIndex ? 'bg-blue-100' : ''
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectClient(c);
                      }}
                    >
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-xs text-gray-500">
                        {c.region ? `אזור: ${c.region}` : ''} {c.vat ? ` · ח.פ: ${c.vat}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs text-gray-600">תאריך מסמך</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={docDate}
                  onChange={e => setDocDate(e.target.value)}
                />
              </div>
              {mode === 'quote' && (
                <div>
                  <label className="text-xs text-gray-600">תוקף (ימים)</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={validDays}
                    onChange={e => setValidDays(Number(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>

            {mode === 'quote' && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs text-gray-600">מספר הצעה</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                    value={docNumber}
                    onChange={e => setDocNumber(e.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === 'pricelist' && (
              <div className="mt-2">
                <label className="text-xs text-gray-600">תאריך תוקף מחירון</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={priceListExpiry}
                  onChange={e => setPriceListExpiry(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">קטלוג מוצרים</h2>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                placeholder="חפש לפי תיאור, סוג או מק״ט..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => setProductSearch('')}
              >
                נקה
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg max-h-60 overflow-auto mt-1 divide-y text-sm">
              {filteredProducts.map(p => (
                <div key={p.sku} className="flex items-center justify-between px-3 py-1.5">
                  <div>
                    <div className="font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      מק״ט: {p.sku} {p.type ? ` · סוג: ${p.type}` : ''}{' '}
                      {typeof p.basePrice === 'number' ? ` · מחיר בסיס: ${p.basePrice}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => addProductToItems(p)}
                  >
                    הוסף
                  </button>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">לא נמצאו מוצרים תואמים.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">התאמה אישית של התצוגה</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showTitle}
                  onChange={e => setShowTitle(e.target.checked)}
                />
                <span>כותרת מסמך</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showSubtitle}
                  onChange={e => setShowSubtitle(e.target.checked)}
                />
                <span>שורת משנה</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showCompanyDetails}
                  onChange={e => setShowCompanyDetails(e.target.checked)}
                />
                <span>פרטי חברה</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showExpiry}
                  onChange={e => setShowExpiry(e.target.checked)}
                />
                <span>תאריך תוקף</span>
              </label>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              className="text-xs text-red-500 underline"
              onClick={clearItems}
            >
              נקה את כל שורות המוצר
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow hover:bg-blue-700"
              onClick={handleDownloadPDF}
            >
              הורדת PDF
            </button>
          </div>
        </div>

        {/* Right side - preview */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 overflow-auto max-h-[calc(100vh-180px)]">
          <div id="pricelist-preview" className="max-w-3xl mx-auto text-right space-y-4">
            <div className="flex justify-between items-start border-b border-gray-200 pb-3">
              <div>
                {showCompanyDetails && (
                  <>
                    <div className="text-xl font-bold text-gray-900">{companyName}</div>
                    <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                      {companyAddress && <div>{companyAddress}</div>}
                      {companyPhone && <div>טל: {companyPhone}</div>}
                      {companyEmail && <div>{companyEmail}</div>}
                      {companyId && <div>ח.פ / ע.מ: {companyId}</div>}
                    </div>
                  </>
                )}
              </div>
              <div className="text-left">
                {showTitle && (
                  <div className="text-3xl font-extrabold text-blue-600 leading-tight">
                    {mode === 'pricelist' ? 'מחירון' : 'הצעת מחיר'}
                  </div>
                )}
                {showSubtitle && (
                  <div className="mt-1 text-sm text-gray-600">
                    {mode === 'pricelist'
                      ? selectedClient
                        ? `ללקוח: ${selectedClient.name}`
                        : 'ללקוח: ______'
                      : docNumber
                        ? `מס׳ ${docNumber}`
                        : ''}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="border border-gray-200 rounded-lg p-3 space-y-1">
                <div className="font-semibold text-blue-700 mb-1">
                  {mode === 'pricelist' ? 'פרטי מחירון' : 'פרטי הצעה'}
                </div>
                <div>
                  <span className="font-semibold">תאריך מסמך: </span>
                  <span>{formatDateDisplay(docDate) || '—'}</span>
                </div>
                {showExpiry && computedExpiryDate && (
                  <div>
                    <span className="font-semibold">
                      {mode === 'pricelist' ? 'תוקף מחירון: ' : 'תוקף הצעה: '}
                    </span>
                    <span>{formatDateDisplay(computedExpiryDate)}</span>
                  </div>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg p-3 space-y-1">
                <div className="font-semibold text-blue-700 mb-1">פרטי לקוח</div>
                {selectedClient ? (
                  <>
                    <div className="font-semibold text-gray-900">{selectedClient.name}</div>
                    {selectedClient.region && (
                      <div className="text-gray-700">אזור: {selectedClient.region}</div>
                    )}
                    {selectedClient.vat && (
                      <div className="text-gray-700">ח.פ / ע.מ: {selectedClient.vat}</div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-400">לא נבחר לקוח.</div>
                )}
              </div>
            </div>

            <div className="mt-2">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    <th className="py-1.5 px-2 text-right">#</th>
                    <th className="py-1.5 px-2 text-right">תיאור מוצר</th>
                    <th className="py-1.5 px-2 text-right">מק״ט</th>
                    <th className="py-1.5 px-2 text-right">כמות</th>
                    <th className="py-1.5 px-2 text-right">מחיר יחידה</th>
                    <th className="py-1.5 px-2 text-right">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center text-gray-400">
                        לא נוספו מוצרים למסמך.
                      </td>
                    </tr>
                  )}
                  {items.map((item, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-1.5 px-2 align-top">{index + 1}</td>
                      <td className="py-1.5 px-2 align-top">
                        <input
                          className="w-full border rounded px-1 py-0.5 text-xs"
                          value={item.name || ''}
                          onChange={e => updateItem(index, 'name', e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <input
                          className="w-full border rounded px-1 py-0.5 text-xs ltr"
                          value={item.sku || ''}
                          onChange={e => updateItem(index, 'sku', e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <input
                          type="number"
                          className="w-20 border rounded px-1 py-0.5 text-xs text-center"
                          value={item.quantity}
                          min={0}
                          onChange={e => updateItem(index, 'quantity', e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        <input
                          type="number"
                          className="w-24 border rounded px-1 py-0.5 text-xs text-center"
                          value={item.unitPrice}
                          onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2 align-top">
                        {(item.unitPrice * item.quantity).toFixed(2)}
                        <button
                          type="button"
                          className="ml-2 text-xs text-red-500"
                          onClick={() => removeItem(index)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={5} className="py-1.5 px-2 text-left">
                        סה״כ לפני מע״מ
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {subtotal.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="mt-4 text-xs text-gray-500 border-t border-gray-200 pt-2 text-center">
              מסמך זה נוצר באופן אוטומטי במערכת NA KASEM CRM ואינו דורש חתימה ידנית.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ notes, clientsDB, productsDB, onNavigate, onDeleteNote }) {
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

function ClientsView({ clientsDB, setClientsDB, clientPrices, setClientPrices, productsDB, deliveryNotes, clientNotes, setClientNotes, clientTags, setClientTags }) {
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientKey, setSelectedClientKey] = useState(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const regions = useMemo(
    () => ['all', ...new Set(Object.values(clientsDB).map(client => client.region))],
    [clientsDB]
  );

  const clientsList = useMemo(
    () => Object.entries(clientsDB).map(([key, client]) => ({ key, ...client })),
    [clientsDB]
  );

  const regionCounts = useMemo(() => {
    const counts = { all: clientsList.length };
    clientsList.forEach(client => {
      counts[client.region] = (counts[client.region] || 0) + 1;
    });
    return counts;
  }, [clientsList]);

  const visibleClients = useMemo(() => {
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
    () => Object.fromEntries(Object.entries(clientsDB).map(([key, client]) => [client.name, key])),
    [clientsDB]
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
                selectedRegion === region ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleClients.map(client => {
          const isActive = selectedClientKey === client.key;
          const customCount = clientPrices[client.key] ? Object.keys(clientPrices[client.key]).length : 0;

          return (
            <div
              key={client.key}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedClientKey(client.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedClientKey(client.key);
                }
              }}
              className={`cursor-pointer rounded-xl border transition-all duration-200 p-4 bg-white text-right shadow-sm hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                isActive ? 'border-blue-400 ring-2 ring-blue-300 shadow-lg' : 'border-transparent'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-lg font-semibold text-gray-900 leading-snug line-clamp-2">
                  {client.name}
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                  {client.region}
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-500">ח.פ: {client.vat || '—'}</div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span className="truncate">מזהה: {client.key}</span>
                {customCount > 0 ? (
                  <span className="flex items-center gap-1 text-green-600 font-semibold">
                    💰 {customCount}
                  </span>
                ) : (
                  <span className="text-gray-400">תעריף בסיס</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-xl p-6">
        {selectedClient ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedClient.name}</h3>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
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
              <div className="rounded-lg bg-blue-50 p-4 text-blue-700">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">שווי חיים</div>
                <div className="mt-2 text-xl font-bold">{formatCurrency(lifetimeValue)}</div>
                <div className="text-xs text-blue-600/70">סה"כ הכנסות מהלקוח</div>
              </div>
              <div className="rounded-lg bg-purple-50 p-4 text-purple-700">
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
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
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
        )}
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
            <button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg">✅ עדכן</button>
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
                className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition ${selectedType === type ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
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
                          <button onClick={() => startEdit(code)} className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg">✏️</button>
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
            <button onClick={onClose} className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-2 rounded-lg">סגור</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductsView({ productsDB, setProductsDB }) {
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
                  selectedCategory === category ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                    selectedType === type ? 'bg-purple-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                    <tr key={product.code} className="hover:bg-blue-50/40 transition">
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
            <button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg">✅ עדכן</button>
            <button type="button" onClick={onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-2 rounded-lg">❌ ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OCRView({ onSave, clientsDB, productsDB, clientPrices }) {
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

        // Split this page into potential delivery note blocks
        const blocks = splitIntoNoteBlocks(lines);

        for (const blockLines of blocks) {
          const noteFromBlock = extractDeliveryNote(blockLines, pageIndex + 1);
          if (noteFromBlock && noteFromBlock.items && noteFromBlock.items.length > 0) {
            allResults.push(noteFromBlock);
          }
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
  

// Helper: split page OCR lines into separate delivery note blocks.
// Each block is an array of lines that should represent a single delivery note.
// We use a regex that matches the typical document number pattern, e.g. 12/123456.
// Adjust the regex if your real document numbers use a different format.
const splitIntoNoteBlocks = (lines) => {
  const blocks = [];
  let current = [];

  // Example pattern: two digits, slash, six digits. Change if needed.
  const docRegex = /\b\d{2}\/\d{6}\b/;

  for (const line of lines) {
    const isDocHeader = docRegex.test(line);

    // When we detect what looks like a new document header and we already
    // have collected lines, we close the previous block and start a new one.
    if (isDocHeader && current.length > 0) {
      blocks.push(current);
      current = [];
    }

    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
};

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
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
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
                  <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full font-bold self-start">
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

function SalesRevenueView({ notes, clientsDB, productsDB }) {
  const [rangeKey, setRangeKey] = useState('month');

  const rangeOptions = {
    week: {
      label: 'השבוע',
      getStart: (today) => startOfWeek(today)
    },
    month: {
      label: 'החודש',
      getStart: (today) => startOfMonth(today)
    },
    quarter: {
      label: '3 חודשים אחרונים',
      getStart: (today) => addDays(today, -89)
    },
    year: {
      label: '12 חודשים אחרונים',
      getStart: (today) => addDays(today, -364)
    }
  };

  const today = startOfDay(new Date());
  const selectedRange = rangeOptions[rangeKey] || rangeOptions.month;
  const rangeStart = selectedRange.getStart(today);
  const rangeEnd = today;

  const notesWithDate = useMemo(
    () => notes.map(note => ({ ...note, parsedDate: parseDocDate(note.docDate) })).filter(note => note.parsedDate),
    [notes]
  );

  const rangeLengthInDays = Math.max(1, Math.round((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1);

  const filteredNotes = notesWithDate.filter(note => note.parsedDate >= rangeStart && note.parsedDate <= rangeEnd);

  const previousRangeEnd = addDays(rangeStart, -1);
  const previousRangeStart = addDays(rangeStart, -rangeLengthInDays);
  const previousNotes = notesWithDate.filter(note => note.parsedDate >= previousRangeStart && note.parsedDate <= previousRangeEnd);

  const sumRevenue = (list) => list.reduce((sum, note) => sum + note.totalRevenue, 0);
  const totalRevenue = sumRevenue(filteredNotes);
  const previousRevenue = sumRevenue(previousNotes);

  const orderCount = filteredNotes.length;
  const avgOrderValue = orderCount ? totalRevenue / orderCount : 0;

  const revenueByRegion = filteredNotes.reduce((acc, note) => {
    const region = note.region || clientsDB[note.clientKey || '']?.region || 'אחר';
    acc[region] = (acc[region] || 0) + note.totalRevenue;
    return acc;
  }, {});

  const productPerformance = filteredNotes.reduce((acc, note) => {
    note.items?.forEach(item => {
      const entry = acc[item.code] || {
        code: item.code,
        name: item.name,
        type: productsDB[item.code]?.type || 'לא ידוע',
        revenue: 0,
        quantity: 0
      };
      entry.revenue += item.revenue || 0;
      entry.quantity += item.pieces || item.amount || 0;
      acc[item.code] = entry;
    });
    return acc;
  }, {});

  const bestProducts = Object.values(productPerformance)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const worstProducts = Object.values(productPerformance)
    .filter(product => product.revenue > 0)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5);

  const clientPerformance = filteredNotes.reduce((acc, note) => {
    const key = note.clientKey || note.clientName;
    if (!acc[key]) {
      const displayName = clientsDB[key]?.name || note.clientName || key;
      acc[key] = {
        name: displayName,
        revenue: 0,
        orders: 0
      };
    }
    acc[key].revenue += note.totalRevenue;
    acc[key].orders += 1;
    return acc;
  }, {});

  const topClients = Object.values(clientPerformance)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const determineGranularity = () => {
    if (rangeLengthInDays <= 31) return 'day';
    if (rangeLengthInDays <= 120) return 'week';
    return 'month';
  };

  const granularity = determineGranularity();

  const trendBuckets = filteredNotes.reduce((acc, note) => {
    let bucketKey;
    let label;
    if (granularity === 'day') {
      bucketKey = getDateKey(note.parsedDate);
      label = note.parsedDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    } else if (granularity === 'week') {
      const weekStart = startOfWeek(note.parsedDate);
      bucketKey = `W-${getDateKey(weekStart)}`;
      label = `${weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`;
    } else {
      const monthStart = startOfMonth(note.parsedDate);
      bucketKey = `M-${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`;
      label = monthStart.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
    }

    if (!acc[bucketKey]) {
      acc[bucketKey] = { label, revenue: 0, orders: 0 };
    }
    acc[bucketKey].revenue += note.totalRevenue;
    acc[bucketKey].orders += 1;
    return acc;
  }, {});

  const trendData = Object.values(trendBuckets).sort((a, b) => a.label.localeCompare(b.label));
  const maxTrendRevenue = Math.max(...trendData.map(d => d.revenue), 1);

  const regionEntries = Object.entries(revenueByRegion).sort((a, b) => b[1] - a[1]);
  const totalRegionRevenue = regionEntries.reduce((sum, [, revenue]) => sum + revenue, 0);

  const growthPercent = formatPercentChange(totalRevenue, previousRevenue);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">💰 ניתוח מכירות והכנסות</h2>
          <p className="text-sm text-gray-500">עמוד ניתוח מכירות מפורט עם פילוחים אזוריים, לפי מוצר ולפי לקוח.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">טווח זמן:</label>
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            className="input-field w-48"
          >
            {Object.entries(rangeOptions).map(([key, option]) => (
              <option key={key} value={key}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-semibold">הכנסות בטווח הנבחר</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(totalRevenue)}</div>
          <div className="mt-1 text-xs text-gray-500">{growthPercent} לעומת התקופה הקודמת</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-emerald-100">
          <div className="text-sm text-emerald-600 font-semibold">ערך הזמנה ממוצע</div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(avgOrderValue)}</div>
          <div className="mt-1 text-xs text-gray-500">{orderCount} הזמנות</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-purple-100">
          <div className="text-sm text-purple-600 font-semibold">מספר לקוחות פעילים</div>
          <div className="mt-2 text-3xl font-bold">{Object.keys(clientPerformance).length}</div>
          <div className="mt-1 text-xs text-gray-500">לקוחות שביצעו לפחות הזמנה אחת בטווח</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-orange-100">
          <div className="text-sm text-orange-600 font-semibold">מרווח רווח משוער</div>
          <div className="mt-2 text-3xl font-bold text-gray-400">N/A</div>
          <div className="mt-1 text-xs text-gray-500">הוסף עלויות מוצרים כדי לחשב רווח אמיתי</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">📈 מגמת הכנסות ({rangeOptions[rangeKey].label})</h3>
          <span className="text-xs text-gray-500">הכנסה ומספר הזמנות ביחידת זמן</span>
        </div>
        <div className="h-48 flex items-end gap-2">
          {trendData.length ? (
            trendData.map((entry, idx) => (
              <div key={`${entry.label}-${idx}`} className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t-full bg-gradient-to-t from-indigo-200 to-indigo-600" style={{ height: `${Math.max(4, (entry.revenue / maxTrendRevenue) * 100)}%` }} />
                <span className="mt-2 text-[10px] text-gray-400">{entry.label}</span>
                <span className="text-[10px] text-gray-300">{entry.orders} הזמנות</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">אין נתונים להצגה בטווח זה.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">📍 פילוח לפי אזורים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {regionEntries.length ? (
              regionEntries.map(([region, revenue]) => (
                <div key={region} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{region}</div>
                    <div className="text-xs text-gray-500">{((revenue / totalRegionRevenue) * 100).toFixed(1)}% מההכנסות</div>
                  </div>
                  <div className="font-bold text-blue-600">{formatCurrency(revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין נתוני מכירות לפי אזור.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">🏆 לקוחות מובילים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {topClients.length ? (
              topClients.map((client, idx) => (
                <div key={client.name} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">#{idx + 1} {client.name}</div>
                    <div className="text-xs text-gray-500">{client.orders} הזמנות</div>
                  </div>
                  <div className="font-bold text-green-600">{formatCurrency(client.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין לקוחות מובילים בטווח זה.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">🔥 מוצרים מובילים</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {bestProducts.length ? (
              bestProducts.map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.type} • {product.quantity} יחידות</div>
                  </div>
                  <div className="font-bold text-purple-600">{formatCurrency(product.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין עדיין נתונים למוצרים בטווח זה.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">📉 מוצרים דורשים תשומת לב</h3>
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            {worstProducts.length ? (
              worstProducts.map(product => (
                <div key={product.code} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="font-semibold text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.type} • {product.quantity} יחידות</div>
                  </div>
                  <div className="font-bold text-red-600">{formatCurrency(product.revenue)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">אין מספיק נתונים לזיהוי מוצרים חלשים.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AIInsightsView({ notes, clientsDB, productsDB }) {
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

function ReportsView({ notes, clientsDB, productsDB }) {
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