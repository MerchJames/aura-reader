import { Story, StoryMeta } from '../types';

const DB_NAME = 'aura-reader';
const DB_VERSION = 1;
const STORE = 'stories';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};

const tx = async (mode: IDBTransactionMode) => {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
};

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const putStory = async (story: Story): Promise<void> => {
  await request((await tx('readwrite')).put(story));
};

export const getStory = async (id: string): Promise<Story | undefined> => {
  return request((await tx('readonly')).get(id));
};

export const deleteStory = async (id: string): Promise<void> => {
  await request((await tx('readwrite')).delete(id));
};

export const getAllStoryMetas = async (): Promise<StoryMeta[]> => {
  const stories: Story[] = await request((await tx('readonly')).getAll());
  return stories
    .map(({ messages: _m, highlights: _h, stars: _s, ...meta }) => meta)
    .sort((a, b) => b.importedAt - a.importedAt);
};
