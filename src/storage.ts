import { EMPTY_STATE, type AppState, validateImport } from './model';

const DATABASE = 'neurospeed-lab';
const VERSION = 1;
const STORE = 'local';
const ROOT_KEY = 'state';

export class SavedDataError extends Error {
  constructor() {
    super('NeuroSpeed Lab found saved data it could not safely read. The original database has been left untouched.');
    this.name = 'SavedDataError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable in this browser. Use a recent browser with site storage enabled.'));
      return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local training database.'));
    request.onblocked = () => reject(new Error('Close other NeuroSpeed Lab tabs to finish opening the local database.'));
  });
}

export async function loadState(): Promise<AppState> {
  const db = await openDatabase();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(ROOT_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (raw === undefined) return structuredClone(EMPTY_STATE);
    const safe = validateImport(raw);
    if (!safe) throw new SavedDataError();
    return safe;
  } finally {
    db.close();
  }
}

export async function saveState(state: AppState): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(state, ROOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this training update.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('The local database cancelled this save.'));
    });
  } finally {
    db.close();
  }
}

export function downloadJson(filename: string, value: unknown): void {
  download(filename, 'application/json', JSON.stringify(value, null, 2));
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null>>): void {
  if (!rows.length) return download(filename, 'text/csv;charset=utf-8', '');
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.map(cell).join(','), ...rows.map((row) => headers.map((header) => cell(row[header])).join(','))].join('\r\n');
  download(filename, 'text/csv;charset=utf-8', `\uFEFF${csv}`);
}

function download(filename: string, type: string, content: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
