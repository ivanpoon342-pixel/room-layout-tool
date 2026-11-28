/**
 * 多布局保存、新增、切换与旧版数据迁移管理模块
 * 全部持久化至 localStorage，支持无注册本地保存并继续编辑（含家具、门口、自由文字备注）
 */
(function (global) {
  'use strict';

  const STORAGE_KEY_V2 = 'room_layout_tool_v2';
  const STORAGE_KEY_V1 = 'room_layout_tool_v1';
  const DEFAULT_ROOM = { w: 400, d: 340, h: 280 };

  function cloneRoom(room) {
    const src = room || DEFAULT_ROOM;
    const w = Number(src.w);
    const d = Number(src.d);
    const h = Number(src.h);
    return {
      w: Number.isFinite(w) && w >= 100 && w <= 2000 ? Math.round(w) : DEFAULT_ROOM.w,
      d: Number.isFinite(d) && d >= 100 && d <= 2000 ? Math.round(d) : DEFAULT_ROOM.d,
      h: Number.isFinite(h) && h >= 180 && h <= 600 ? Math.round(h) : DEFAULT_ROOM.h
    };
  }

  function cloneItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (it) =>
          it &&
          typeof it.id === 'string' &&
          typeof it.catalogId === 'string' &&
          Number.isFinite(it.x) &&
          Number.isFinite(it.y) &&
          Number.isFinite(it.w) &&
          Number.isFinite(it.d)
      )
      .map((it) => ({
        ...it,
        note: typeof it.note === 'string' ? it.note : ''
      }));
  }

  function cloneOpenings(openings) {
    if (!Array.isArray(openings)) return [];
    const validWalls = { top: true, bottom: true, left: true, right: true, free: true };
    return openings
      .filter(
        (op) =>
          op &&
          typeof op.id === 'string' &&
          validWalls[op.wall] &&
          Number.isFinite(op.width) &&
          (op.wall === 'free'
            ? Number.isFinite(op.x) && Number.isFinite(op.y)
            : Number.isFinite(op.offset))
      )
      .map((op) => {
        const type = op.type === 'window' ? 'window' : 'door';
        const defaultName = type === 'window' ? '窗户' : '门口';
        const sillDefault = type === 'window' ? 90 : 0;
        const openHDefault = type === 'window' ? 140 : 210;
        const sillH = Number.isFinite(Number(op.sillH))
          ? Math.max(0, Math.min(400, Math.round(Number(op.sillH))))
          : sillDefault;
        const openH = Number.isFinite(Number(op.openH))
          ? Math.max(30, Math.min(400, Math.round(Number(op.openH))))
          : openHDefault;
        const base = {
          id: op.id,
          type,
          name: typeof op.name === 'string' && op.name.trim() ? op.name.trim() : defaultName,
          wall: op.wall,
          offset: op.wall === 'free' ? 0 : Math.round(op.offset),
          width: Math.max(30, Math.min(400, Math.round(op.width))),
          swing: type === 'window' ? 'none' : op.swing === 'out' || op.swing === 'none' ? op.swing : 'in',
          hinge: op.hinge === 'end' ? 'end' : 'start',
          sillH,
          openH
        };
        if (op.wall === 'free') {
          base.x = Math.round(op.x);
          base.y = Math.round(op.y);
          base.orientation = op.orientation === 'v' ? 'v' : 'h';
        }
        return base;
      });
  }

  function cloneNotes(notes) {
    if (!Array.isArray(notes)) return [];
    return notes
      .filter(
        (n) =>
          n &&
          typeof n.id === 'string' &&
          typeof n.text === 'string' &&
          n.text.trim() &&
          Number.isFinite(n.x) &&
          Number.isFinite(n.y)
      )
      .map((n) => ({
        id: n.id,
        x: Math.round(n.x),
        y: Math.round(n.y),
        text: n.text.trim()
      }));
  }

  function createEmptyStore() {
    return {
      layouts: [],
      activeLayoutId: null,
      draft: {
        room: cloneRoom(DEFAULT_ROOM),
        items: [],
        openings: [],
        notes: []
      }
    };
  }

  function migrateFromLegacy(v1Data) {
    const store = createEmptyStore();
    if (!v1Data || typeof v1Data !== 'object') return store;
    store.draft = {
      room: cloneRoom(v1Data.room),
      items: cloneItems(v1Data.items),
      openings: cloneOpenings(v1Data.openings),
      notes: cloneNotes(v1Data.notes)
    };
    return store;
  }

  function normalizeStore(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyStore();
    const layouts = Array.isArray(raw.layouts)
      ? raw.layouts
          .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
          .map((l) => ({
            id: l.id,
            name: l.name.trim() || '未命名布局',
            room: cloneRoom(l.room),
            items: cloneItems(l.items),
            openings: cloneOpenings(l.openings),
            notes: cloneNotes(l.notes),
            updatedAt: Number(l.updatedAt) || Date.now()
          }))
      : [];

    const activeValid =
      typeof raw.activeLayoutId === 'string' && layouts.some((l) => l.id === raw.activeLayoutId);
    const draft = raw.draft
      ? {
          room: cloneRoom(raw.draft.room),
          items: cloneItems(raw.draft.items),
          openings: cloneOpenings(raw.draft.openings),
          notes: cloneNotes(raw.draft.notes)
        }
      : {
          room: cloneRoom(DEFAULT_ROOM),
          items: [],
          openings: [],
          notes: []
        };

    return {
      layouts,
      activeLayoutId: activeValid ? raw.activeLayoutId : null,
      draft
    };
  }

  function generateLayoutId() {
    return `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function getNextDefaultName(layouts) {
    const used = new Set((layouts || []).map((l) => l.name));
    let n = 1;
    while (used.has(`方案 ${n}`)) {
      n += 1;
    }
    return `方案 ${n}`;
  }

  function findLayout(store, id) {
    if (!store || !id) return null;
    return store.layouts.find((l) => l.id === id) || null;
  }

  function saveCurrentLayout(store, payload) {
    const room = cloneRoom(payload.room);
    const items = cloneItems(payload.items);
    const openings = cloneOpenings(payload.openings);
    const notes = cloneNotes(payload.notes);
    const cleanName = typeof payload.name === 'string' ? payload.name.trim() : '';

    const existing = findLayout(store, store.activeLayoutId);
    if (existing) {
      if (cleanName) existing.name = cleanName;
      existing.room = room;
      existing.items = items;
      existing.openings = openings;
      existing.notes = notes;
      existing.updatedAt = Date.now();
      store.draft = {
        room: cloneRoom(room),
        items: cloneItems(items),
        openings: cloneOpenings(openings),
        notes: cloneNotes(notes)
      };
      return { layout: existing, created: false };
    }

    const name = cleanName || getNextDefaultName(store.layouts);
    const created = {
      id: generateLayoutId(),
      name,
      room,
      items,
      openings,
      notes,
      updatedAt: Date.now()
    };
    store.layouts.push(created);
    store.activeLayoutId = created.id;
    store.draft = {
      room: cloneRoom(room),
      items: cloneItems(items),
      openings: cloneOpenings(openings),
      notes: cloneNotes(notes)
    };
    return { layout: created, created: true };
  }

  function preserveCurrentIfNeeded(store, currentRoom, currentItems, currentOpenings, isDirty, currentNotes) {
    const existing = findLayout(store, store.activeLayoutId);
    if (existing) {
      if (isDirty) {
        existing.room = cloneRoom(currentRoom);
        existing.items = cloneItems(currentItems);
        existing.openings = cloneOpenings(currentOpenings);
        existing.notes = cloneNotes(currentNotes);
        existing.updatedAt = Date.now();
      }
      return null;
    }

    const hasContent =
      (Array.isArray(currentItems) && currentItems.length > 0) ||
      (Array.isArray(currentOpenings) && currentOpenings.length > 0) ||
      (Array.isArray(currentNotes) && currentNotes.length > 0);
    if (hasContent) {
      const autoName = getNextDefaultName(store.layouts);
      saveCurrentLayout(store, {
        name: autoName,
        room: currentRoom,
        items: currentItems,
        openings: currentOpenings,
        notes: currentNotes
      });
      return autoName;
    }
    return null;
  }

  function createNewLayout(store, currentRoom, currentItems, currentOpenings, isDirty, currentNotes) {
    const autoSavedName = preserveCurrentIfNeeded(
      store,
      currentRoom,
      currentItems,
      currentOpenings,
      isDirty,
      currentNotes
    );
    store.activeLayoutId = null;
    const room = cloneRoom(DEFAULT_ROOM);
    store.draft = { room: cloneRoom(room), items: [], openings: [], notes: [] };
    return { room, items: [], openings: [], notes: [], autoSavedName };
  }

  function switchLayout(store, targetId, currentRoom, currentItems, currentOpenings, isDirty, currentNotes) {
    const target = findLayout(store, targetId);
    if (!target) return null;

    let autoSavedName = null;
    if (store.activeLayoutId !== targetId) {
      autoSavedName = preserveCurrentIfNeeded(
        store,
        currentRoom,
        currentItems,
        currentOpenings,
        isDirty,
        currentNotes
      );
    }

    store.activeLayoutId = target.id;
    const room = cloneRoom(target.room);
    const items = cloneItems(target.items);
    const openings = cloneOpenings(target.openings);
    const notes = cloneNotes(target.notes);
    store.draft = {
      room: cloneRoom(room),
      items: cloneItems(items),
      openings: cloneOpenings(openings),
      notes: cloneNotes(notes)
    };

    return { layout: target, room, items, openings, notes, autoSavedName };
  }

  function renameLayout(store, layoutId, newName) {
    const target = findLayout(store, layoutId);
    const clean = typeof newName === 'string' ? newName.trim() : '';
    if (!target || !clean) return false;
    target.name = clean;
    target.updatedAt = Date.now();
    return true;
  }

  function deleteLayout(store, layoutId) {
    const idx = store.layouts.findIndex((l) => l.id === layoutId);
    if (idx === -1) return null;
    const [removed] = store.layouts.splice(idx, 1);

    if (store.activeLayoutId === layoutId) {
      const fallback = store.layouts[idx] || store.layouts[idx - 1] || null;
      if (fallback) {
        store.activeLayoutId = fallback.id;
        const room = cloneRoom(fallback.room);
        const items = cloneItems(fallback.items);
        const openings = cloneOpenings(fallback.openings);
        const notes = cloneNotes(fallback.notes);
        store.draft = {
          room: cloneRoom(room),
          items: cloneItems(items),
          openings: cloneOpenings(openings),
          notes: cloneNotes(notes)
        };
        return { removed, switchedTo: fallback, room, items, openings, notes };
      }
      store.activeLayoutId = null;
      const room = cloneRoom(DEFAULT_ROOM);
      store.draft = { room: cloneRoom(room), items: [], openings: [], notes: [] };
      return { removed, switchedTo: null, room, items: [], openings: [], notes: [] };
    }

    return {
      removed,
      switchedTo: findLayout(store, store.activeLayoutId),
      room: null,
      items: null,
      openings: null,
      notes: null
    };
  }

  function loadStore(storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return createEmptyStore();
    try {
      const rawV2 = ls.getItem(STORAGE_KEY_V2);
      if (rawV2) {
        return normalizeStore(JSON.parse(rawV2));
      }
      const rawV1 = ls.getItem(STORAGE_KEY_V1);
      if (rawV1) {
        return migrateFromLegacy(JSON.parse(rawV1));
      }
    } catch (e) {
      // 忽略损坏数据
    }
    return createEmptyStore();
  }

  function persistStore(store, storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return;
    try {
      ls.setItem(STORAGE_KEY_V2, JSON.stringify(store));
    } catch (e) {
      // 忽略异常
    }
  }

  const Layouts = {
    STORAGE_KEY_V2,
    STORAGE_KEY_V1,
    DEFAULT_ROOM,
    cloneRoom,
    cloneItems,
    cloneOpenings,
    cloneNotes,
    createEmptyStore,
    migrateFromLegacy,
    getNextDefaultName,
    findLayout,
    saveCurrentLayout,
    createNewLayout,
    switchLayout,
    renameLayout,
    deleteLayout,
    loadStore,
    persistStore
  };

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Layouts = Layouts;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Layouts;
  }
})(typeof window !== 'undefined' ? window : globalThis);
