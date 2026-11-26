/**
 * 应用主控逻辑：多布局保存/新增/切换、墙边门口标记与屏风定制、拖拽测距与 LocalStorage 持久化
 */
(function (global) {
  'use strict';

  const state = {
    store: null,
    room: { w: 400, d: 340, h: 280 }, // cm
    items: [],
    openings: [],
    isDirty: false,
    selectedId: null,
    selectedOpeningId: null,
    draggingId: null,
    draggingOpeningId: null,
    flashId: null,
    activeCategory: 'all',
    editingId: null,
    editingOpeningId: null,
    layoutModalMode: null // 'save' | 'rename'
  };

  let latestMetrics = null;
  let latestAnalysis = null;
  let idCounter = 1;
  let flashTimer = null;
  let toastTimer = null;
  let dom = {};

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix || 'item'}_${Date.now().toString(36)}_${idCounter}`;
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function formatMetersShort(cm) {
    return (cm / 100).toFixed(1);
  }

  function syncDraftAndPersist(markDirty) {
    const { Layouts } = global.RoomLayout;
    if (markDirty) state.isDirty = true;
    state.store.draft = {
      room: Layouts.cloneRoom(state.room),
      items: Layouts.cloneItems(state.items),
      openings: Layouts.cloneOpenings(state.openings)
    };
    Layouts.persistStore(state.store);
    renderLayoutBar();
  }

  function loadInitialState() {
    const { Layouts } = global.RoomLayout;
    const store = Layouts.loadStore();
    state.store = store;

    const active = Layouts.findLayout(store, store.activeLayoutId);
    if (active) {
      state.room = Layouts.cloneRoom(active.room);
      state.items = Layouts.cloneItems(active.items);
      state.openings = Layouts.cloneOpenings(active.openings);
      state.isDirty = false;
    } else {
      state.room = Layouts.cloneRoom(store.draft.room);
      state.items = Layouts.cloneItems(store.draft.items);
      state.openings = Layouts.cloneOpenings(store.draft.openings);
      state.isDirty = state.items.length > 0 || state.openings.length > 0;
    }
  }

  function showToast(msg) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, 2400);
  }

  function syncRoomInputs() {
    dom.roomW.value = (state.room.w / 100).toFixed(1);
    dom.roomD.value = (state.room.d / 100).toFixed(1);
    dom.roomH.value = (state.room.h / 100).toFixed(1);
    updateAreaBadge();
  }

  function updateAreaBadge() {
    const area = ((state.room.w * state.room.d) / 10000).toFixed(1);
    dom.roomArea.textContent = `${area} ㎡`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderLayoutBar() {
    if (!dom.layoutTabs || !state.store) return;
    const { Layouts } = global.RoomLayout;
    const activeId = state.store.activeLayoutId;
    const tabsHtml = state.store.layouts
      .map((l) => {
        const isActive = l.id === activeId;
        const sizeLabel = `${formatMetersShort(l.room.w)}×${formatMetersShort(l.room.d)}m`;
        return [
          `<div class="layout-pill${isActive ? ' is-active' : ''}" data-layout-id="${escapeHtml(l.id)}" role="button" tabindex="0">`,
          `<span class="layout-pill-name">${escapeHtml(l.name)}</span>`,
          `<span class="layout-pill-size">${sizeLabel}</span>`,
          `<button type="button" class="layout-pill-op" data-op="rename" data-layout-id="${escapeHtml(l.id)}" title="重命名" aria-label="重命名">✎</button>`,
          `<button type="button" class="layout-pill-op" data-op="delete" data-layout-id="${escapeHtml(l.id)}" title="删除方案" aria-label="删除方案">&times;</button>`,
          `</div>`
        ].join('');
      })
      .join('');

    const draftPill = !activeId
      ? `<span class="layout-pill is-draft">未保存新布局</span>`
      : '';

    dom.layoutTabs.innerHTML = tabsHtml + draftPill;

    const activeLayout = Layouts.findLayout(state.store, activeId);
    dom.saveLayoutBtn.textContent = activeLayout ? `保存「${activeLayout.name}」` : '保存布局';
    dom.saveLayoutBtn.classList.toggle('is-dirty', Boolean(state.isDirty));
  }

  function renderPalette() {
    const { Catalog } = global.RoomLayout;

    dom.categoryTabs.innerHTML = Catalog.CATEGORIES.map((cat) => {
      const active = cat.id === state.activeCategory ? ' is-active' : '';
      return `<button type="button" class="cat-pill${active}" data-cat="${cat.id}">${cat.label}</button>`;
    }).join('');

    const list =
      state.activeCategory === 'all'
        ? Catalog.FURNITURE_CATALOG
        : Catalog.FURNITURE_CATALOG.filter((item) =>
            Array.isArray(item.categories)
              ? item.categories.includes(state.activeCategory)
              : item.category === state.activeCategory
          );

    dom.furnitureGrid.innerHTML = list
      .map((item) => {
        const iconScale = Math.min(44 / item.w, 34 / item.d);
        const iw = Math.max(8, item.w * iconScale);
        const ih = Math.max(6, item.d * iconScale);
        const ix = (52 - iw) / 2;
        const iy = (40 - ih) / 2;
        const sizeText = item.kind === 'opening' ? `${item.w}cm 门洞` : `${item.w}×${item.d}cm`;
        return [
          `<button type="button" class="furniture-card" data-catalog-id="${item.id}" title="拖拽或点击放入「${item.name}」">`,
          `<div class="card-icon">`,
          `<svg width="52" height="40" viewBox="0 0 52 40" aria-hidden="true">`,
          `<g transform="translate(${ix}, ${iy})">${item.drawSvg(iw, ih, item.fill, item.stroke)}</g>`,
          `</svg>`,
          `</div>`,
          `<div class="card-name">${item.name}</div>`,
          `<div class="card-size">${sizeText}</div>`,
          `</button>`
        ].join('');
      })
      .join('');
  }

  function renderStatusBanner(analysis) {
    const warnings = analysis.warnings;
    const occPct = Math.round(analysis.coverageRatio * 100);

    if (warnings.length === 0) {
      dom.statusBar.className = 'status-bar is-ok';
      const extra = analysis.coverageRatio > 0.65 ? ' · 空间占用偏高' : ' · 层高与间距正常';
      const emptyNote =
        state.items.length === 0 && state.openings.length === 0
          ? '待摆放家具 · 请从左侧拖入或点击家具（双击墙边可标门口）'
          : `布局可行 · 家具占地 ${occPct}%${extra}`;
      dom.statusBar.innerHTML = `<span class="status-dot"></span><span class="status-summary">${emptyNote}</span>`;
      return;
    }

    dom.statusBar.className = 'status-bar is-warn';
    const chips = warnings
      .slice(0, 4)
      .map((w) => {
        const targetId = (w.openingIds && w.openingIds[0]) || (w.itemIds && w.itemIds[0]) || '';
        return `<button type="button" class="warn-chip" data-target-id="${escapeHtml(targetId)}">${escapeHtml(w.message)}</button>`;
      })
      .join('');
    const more = warnings.length > 4 ? `<span class="warn-more">等 ${warnings.length} 项</span>` : '';
    dom.statusBar.innerHTML =
      `<span class="status-dot"></span>` +
      `<span class="status-summary">发现 ${warnings.length} 项预警：</span>` +
      `<div class="warn-chips">${chips}${more}</div>`;
  }

  function updateFloatingBars() {
    const { Geometry } = global.RoomLayout;
    const bar = dom.floatingBar;
    const openBar = dom.floatingOpeningBar;

    // 1. 家具浮动操作条
    if (!state.selectedId || state.draggingId || !latestMetrics) {
      bar.hidden = true;
    } else {
      const item = state.items.find((it) => it.id === state.selectedId);
      if (!item) {
        bar.hidden = true;
      } else {
        const fp = Geometry.getFootprint(item);
        const { originX, originY, scale, svgWidth, svgHeight } = latestMetrics;
        const itemTop = originY + fp.y * scale;
        const itemBottom = originY + fp.bottom * scale;
        const itemCenterX = originX + fp.cx * scale;

        bar.hidden = false;
        const barW = bar.offsetWidth || 248;
        const barH = bar.offsetHeight || 38;
        const left = clamp(itemCenterX - barW / 2, 10, Math.max(10, svgWidth - barW - 10));
        let top = itemTop - barH - 10;
        if (top < 8) {
          top = Math.min(svgHeight - barH - 8, itemBottom + 10);
        }
        bar.style.left = `${Math.round(left)}px`;
        bar.style.top = `${Math.round(top)}px`;
      }
    }

    // 2. 墙边门口浮动操作条
    if (!state.selectedOpeningId || state.draggingOpeningId || !latestMetrics) {
      openBar.hidden = true;
    } else {
      const op = state.openings.find((o) => o.id === state.selectedOpeningId);
      if (!op) {
        openBar.hidden = true;
      } else {
        const geom = Geometry.getOpeningGeometry(op, state.room);
        const { originX, originY, scale, svgWidth, svgHeight } = latestMetrics;
        const cx = originX + geom.cx * scale;
        const cy = originY + geom.cy * scale;

        openBar.hidden = false;
        const bw = openBar.offsetWidth || 210;
        const bh = openBar.offsetHeight || 36;
        const left = clamp(cx - bw / 2, 10, Math.max(10, svgWidth - bw - 10));
        let top = cy - bh - 16;
        if (top < 8) {
          top = Math.min(svgHeight - bh - 8, cy + 16);
        }
        openBar.style.left = `${Math.round(left)}px`;
        openBar.style.top = `${Math.round(top)}px`;
      }
    }
  }

  function refreshCanvas() {
    const { Geometry, Renderer } = global.RoomLayout;
    latestAnalysis = Geometry.analyzeLayout(state.room, state.items, state.openings);
    latestMetrics = Renderer.render(dom.svg, state.room, state.items, state.openings, state, latestAnalysis);
    renderStatusBanner(latestAnalysis);
    updateFloatingBars();
  }

  function addFurniture(catalogId, pos) {
    const { Catalog, Geometry } = global.RoomLayout;
    const cat = Catalog.getById(catalogId);
    if (!cat) return null;

    if (cat.kind === 'opening') {
      return addOpening(pos || Geometry.findSmartOpeningPosition(cat.w, state.room, state.openings), cat.w);
    }

    const place = pos || Geometry.findSmartPlacePosition(cat.w, cat.d, state.room, state.items);
    const newItem = {
      id: nextId('item'),
      catalogId: cat.id,
      name: cat.name,
      w: cat.w,
      d: cat.d,
      h: cat.h,
      x: Math.round(place.x),
      y: Math.round(place.y),
      rotation: 0
    };

    state.items.push(newItem);
    state.selectedId = newItem.id;
    state.selectedOpeningId = null;
    syncDraftAndPersist(true);
    refreshCanvas();
    return newItem;
  }

  function addOpening(pos, widthCm) {
    const { Geometry } = global.RoomLayout;
    const width = widthCm || 80;
    const target = pos || Geometry.findSmartOpeningPosition(width, state.room, state.openings);
    const opening = {
      id: nextId('open'),
      name: '门口',
      wall: target.wall,
      offset: Math.round(target.offset),
      width: Math.round(width),
      swing: 'in',
      hinge: 'start'
    };
    state.openings.push(opening);
    state.selectedId = null;
    state.selectedOpeningId = opening.id;
    syncDraftAndPersist(true);
    refreshCanvas();
    return opening;
  }

  function rotateSelected() {
    if (!state.selectedId) return;
    const item = state.items.find((it) => it.id === state.selectedId);
    if (!item) return;

    const { Geometry } = global.RoomLayout;
    const oldFp = Geometry.getFootprint(item);
    item.rotation = ((item.rotation || 0) + 90) % 360;
    const newFp = Geometry.getFootprint(item);

    item.x = Math.round(oldFp.cx - newFp.w / 2);
    item.y = Math.round(oldFp.cy - newFp.d / 2);

    syncDraftAndPersist(true);
    refreshCanvas();
  }

  function duplicateSelected() {
    if (!state.selectedId) return;
    const src = state.items.find((it) => it.id === state.selectedId);
    if (!src) return;

    const { Geometry } = global.RoomLayout;
    const fp = Geometry.getFootprint(src);
    const pos = Geometry.findSmartPlacePosition(fp.w, fp.d, state.room, state.items);
    const copy = {
      ...src,
      id: nextId('item'),
      x: pos.x,
      y: pos.y
    };
    state.items.push(copy);
    state.selectedId = copy.id;
    state.selectedOpeningId = null;
    syncDraftAndPersist(true);
    refreshCanvas();
  }

  function deleteSelected() {
    if (state.selectedOpeningId) {
      state.openings = state.openings.filter((o) => o.id !== state.selectedOpeningId);
      if (state.editingOpeningId === state.selectedOpeningId) closeOpeningModal();
      state.selectedOpeningId = null;
      syncDraftAndPersist(true);
      refreshCanvas();
      return;
    }
    if (!state.selectedId) return;
    state.items = state.items.filter((it) => it.id !== state.selectedId);
    if (state.editingId === state.selectedId) closeResizeModal();
    state.selectedId = null;
    syncDraftAndPersist(true);
    refreshCanvas();
  }

  function flipSelectedOpening() {
    if (!state.selectedOpeningId) return;
    const op = state.openings.find((o) => o.id === state.selectedOpeningId);
    if (!op) return;
    if (op.swing === 'in') {
      op.swing = 'out';
    } else if (op.swing === 'out') {
      op.swing = 'none';
    } else {
      op.swing = 'in';
      op.hinge = op.hinge === 'start' ? 'end' : 'start';
    }
    syncDraftAndPersist(true);
    refreshCanvas();
  }

  // 一键自定义家具尺寸弹窗
  function openResizeModal(itemId) {
    const item = state.items.find((it) => it.id === itemId);
    if (!item) return;
    const { Catalog } = global.RoomLayout;
    const cat = Catalog.getById(item.catalogId);

    state.editingId = item.id;
    dom.resizeTitle.textContent = `自定义尺寸 · ${cat ? cat.name : item.name}`;
    dom.editName.value = item.name;
    dom.editW.value = item.w;
    dom.editD.value = item.d;
    dom.editH.value = item.h;

    if (cat && Array.isArray(cat.presets) && cat.presets.length > 0) {
      dom.presetChips.innerHTML = cat.presets
        .map((p, idx) => `<button type="button" class="preset-chip" data-idx="${idx}">${p.label}</button>`)
        .join('');
      dom.presetRow.hidden = false;
    } else {
      dom.presetChips.innerHTML = '';
      dom.presetRow.hidden = true;
    }

    dom.resizeModal.hidden = false;
    dom.editW.focus();
    dom.editW.select();
  }

  function closeResizeModal() {
    dom.resizeModal.hidden = true;
    state.editingId = null;
  }

  function applyResizeInputs(shouldClamp) {
    if (!state.editingId) return;
    const item = state.items.find((it) => it.id === state.editingId);
    if (!item) return;

    const nameVal = dom.editName.value.trim();
    if (nameVal) item.name = nameVal;

    const wRaw = Number(dom.editW.value);
    const dRaw = Number(dom.editD.value);
    const hRaw = Number(dom.editH.value);

    if (Number.isFinite(wRaw) && wRaw >= 3) {
      item.w = shouldClamp ? clamp(Math.round(wRaw), 3, 600) : Math.round(wRaw);
    }
    if (Number.isFinite(dRaw) && dRaw >= 3) {
      item.d = shouldClamp ? clamp(Math.round(dRaw), 3, 600) : Math.round(dRaw);
    }
    if (Number.isFinite(hRaw) && hRaw >= 10) {
      item.h = shouldClamp ? clamp(Math.round(hRaw), 10, 500) : Math.round(hRaw);
    }

    if (shouldClamp) {
      dom.editW.value = item.w;
      dom.editD.value = item.d;
      dom.editH.value = item.h;
    }

    syncDraftAndPersist(true);
    refreshCanvas();
  }

  // 墙边门口定制弹窗
  function openOpeningModal(openingId) {
    const op = state.openings.find((o) => o.id === openingId);
    if (!op) return;
    state.editingOpeningId = op.id;
    dom.openEditName.value = op.name || '门口';
    dom.openEditWidth.value = op.width;
    dom.openEditWall.value = op.wall;
    dom.openEditSwing.value = op.swing;
    dom.openEditHinge.value = op.hinge;
    dom.openingModal.hidden = false;
    dom.openEditWidth.focus();
    dom.openEditWidth.select();
  }

  function closeOpeningModal() {
    dom.openingModal.hidden = true;
    state.editingOpeningId = null;
  }

  function applyOpeningInputs(shouldClamp) {
    if (!state.editingOpeningId) return;
    const op = state.openings.find((o) => o.id === state.editingOpeningId);
    if (!op) return;

    const cleanName = dom.openEditName.value.trim();
    if (cleanName) op.name = cleanName;

    const widthRaw = Number(dom.openEditWidth.value);
    if (Number.isFinite(widthRaw) && widthRaw >= 20) {
      op.width = shouldClamp ? clamp(Math.round(widthRaw), 30, 400) : Math.round(widthRaw);
    }

    op.wall = dom.openEditWall.value;
    op.swing = dom.openEditSwing.value;
    op.hinge = dom.openEditHinge.value;

    const wallLen = op.wall === 'top' || op.wall === 'bottom' ? state.room.w : state.room.d;
    op.offset = clamp(op.offset, 0, Math.max(0, wallLen - Math.min(op.width, wallLen)));

    if (shouldClamp) {
      dom.openEditWidth.value = op.width;
    }

    syncDraftAndPersist(true);
    refreshCanvas();
  }

  // 多布局保存/重命名弹窗
  function openLayoutModal(mode, targetLayoutId) {
    const { Layouts } = global.RoomLayout;
    state.layoutModalMode = mode;
    state.layoutModalTargetId = targetLayoutId || null;

    if (mode === 'rename') {
      const target = Layouts.findLayout(state.store, targetLayoutId);
      if (!target) return;
      dom.layoutModalTitle.textContent = '重命名布局';
      dom.layoutModalConfirm.textContent = '确定修改';
      dom.layoutNameInput.value = target.name;
    } else {
      dom.layoutModalTitle.textContent = '保存当前布局';
      dom.layoutModalConfirm.textContent = '保存方案';
      dom.layoutNameInput.value = Layouts.getNextDefaultName(state.store.layouts);
    }

    dom.layoutModal.hidden = false;
    dom.layoutNameInput.focus();
    dom.layoutNameInput.select();
  }

  function closeLayoutModal() {
    dom.layoutModal.hidden = true;
    state.layoutModalMode = null;
    state.layoutModalTargetId = null;
  }

  function confirmLayoutModal() {
    const { Layouts } = global.RoomLayout;
    const rawName = dom.layoutNameInput.value.trim();

    if (state.layoutModalMode === 'rename') {
      const name = rawName || '未命名布局';
      Layouts.renameLayout(state.store, state.layoutModalTargetId, name);
      Layouts.persistStore(state.store);
      renderLayoutBar();
      closeLayoutModal();
      showToast(`已重命名为「${name}」`);
      return;
    }

    const res = Layouts.saveCurrentLayout(state.store, {
      name: rawName,
      room: state.room,
      items: state.items,
      openings: state.openings
    });
    state.isDirty = false;
    Layouts.persistStore(state.store);
    renderLayoutBar();
    closeLayoutModal();
    showToast(`已保存布局「${res.layout.name}」，可随时切换继续编辑`);
  }

  function applyLoadedScene(scene) {
    state.room = scene.room;
    state.items = scene.items;
    state.openings = scene.openings;
    state.selectedId = null;
    state.selectedOpeningId = null;
    state.isDirty = false;
    closeResizeModal();
    closeOpeningModal();
    syncRoomInputs();
    renderLayoutBar();
    refreshCanvas();
  }

  function clientToRoomCm(clientX, clientY) {
    const svgRect = dom.svg.getBoundingClientRect();
    const { originX, originY, scale } = latestMetrics;
    return {
      x: (clientX - svgRect.left - originX) / scale,
      y: (clientY - svgRect.top - originY) / scale
    };
  }

  function bindPalettePointerEvents() {
    const { Catalog, Geometry } = global.RoomLayout;
    let dragSession = null;

    dom.furnitureGrid.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.furniture-card');
      if (!card || e.button !== 0) return;

      const catalogId = card.dataset.catalogId;
      const cat = Catalog.getById(catalogId);
      if (!cat) return;

      e.preventDefault();
      dragSession = {
        catalogId,
        cat,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        ghostEl: null
      };
    });

    global.addEventListener('pointermove', (e) => {
      if (!dragSession) return;
      const dist = Math.hypot(e.clientX - dragSession.startX, e.clientY - dragSession.startY);
      if (!dragSession.isDragging && dist >= 6) {
        dragSession.isDragging = true;
        const scale = latestMetrics ? latestMetrics.scale : 1.5;
        const gw = Math.max(28, dragSession.cat.w * scale);
        const gd = Math.max(18, dragSession.cat.d * scale);
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.style.width = `${gw}px`;
        ghost.style.height = `${gd}px`;
        const sizeLabel =
          dragSession.cat.kind === 'opening'
            ? `${dragSession.cat.w}cm 门洞`
            : `${dragSession.cat.w}×${dragSession.cat.d}cm`;
        ghost.innerHTML = `<span>${dragSession.cat.name}</span><small>${sizeLabel}</small>`;
        document.body.appendChild(ghost);
        dragSession.ghostEl = ghost;
      }

      if (dragSession.isDragging && dragSession.ghostEl) {
        const gw = dragSession.ghostEl.offsetWidth;
        const gd = dragSession.ghostEl.offsetHeight;
        dragSession.ghostEl.style.left = `${e.clientX - gw / 2}px`;
        dragSession.ghostEl.style.top = `${e.clientY - gd / 2}px`;
      }
    });

    global.addEventListener('pointerup', (e) => {
      if (!dragSession) return;
      const session = dragSession;
      dragSession = null;

      if (session.ghostEl) {
        session.ghostEl.remove();
      }

      if (!session.isDragging) {
        addFurniture(session.catalogId);
        return;
      }

      const stageRect = dom.stage.getBoundingClientRect();
      if (
        e.clientX >= stageRect.left &&
        e.clientX <= stageRect.right &&
        e.clientY >= stageRect.top &&
        e.clientY <= stageRect.bottom
      ) {
        const cmPos = clientToRoomCm(e.clientX, e.clientY);
        if (session.cat.kind === 'opening') {
          const snappedWall = Geometry.snapOpeningToWall(cmPos.x, cmPos.y, session.cat.w, state.room, e.shiftKey);
          addOpening(snappedWall, session.cat.w);
          return;
        }
        const rawX = cmPos.x - session.cat.w / 2;
        const rawY = cmPos.y - session.cat.d / 2;
        const tempItem = { id: '__new__', w: session.cat.w, d: session.cat.d, rotation: 0 };
        const snapped = Geometry.snapPosition(tempItem, rawX, rawY, state.room, state.items, e.shiftKey);
        addFurniture(session.catalogId, snapped);
      }
    });
  }

  function bindCanvasPointerEvents() {
    const { Geometry } = global.RoomLayout;
    let canvasDrag = null;
    let openingDrag = null;
    let rafPending = false;
    let lastMoveEvt = null;
    let lastTapKey = null;
    let lastTapTime = 0;

    dom.svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      // 1. 优先命中墙边门口
      const openingNode = e.target.closest('.opening-node');
      if (openingNode) {
        const opId = openingNode.dataset.openingId;
        const op = state.openings.find((o) => o.id === opId);
        if (!op) return;

        e.preventDefault();
        const now = Date.now();
        const tapKey = `open:${opId}`;
        if (lastTapKey === tapKey && now - lastTapTime < 350) {
          lastTapKey = null;
          state.selectedId = null;
          state.selectedOpeningId = opId;
          state.draggingOpeningId = null;
          openingDrag = null;
          refreshCanvas();
          openOpeningModal(opId);
          return;
        }
        lastTapKey = tapKey;
        lastTapTime = now;

        state.selectedId = null;
        state.selectedOpeningId = opId;
        state.draggingOpeningId = opId;
        openingDrag = {
          id: opId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          moved: false
        };
        refreshCanvas();
        return;
      }

      // 2. 命中家具或屏风
      const node = e.target.closest('.furniture-node');
      if (node) {
        const id = node.dataset.id;
        const item = state.items.find((it) => it.id === id);
        if (!item) return;

        e.preventDefault();
        const now = Date.now();
        const tapKey = `item:${id}`;
        if (lastTapKey === tapKey && now - lastTapTime < 350) {
          lastTapKey = null;
          state.selectedId = id;
          state.selectedOpeningId = null;
          state.draggingId = null;
          canvasDrag = null;
          refreshCanvas();
          openResizeModal(id);
          return;
        }
        lastTapKey = tapKey;
        lastTapTime = now;

        state.selectedId = id;
        state.selectedOpeningId = null;
        state.draggingId = id;
        const cmStart = clientToRoomCm(e.clientX, e.clientY);

        canvasDrag = {
          id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          offsetX: cmStart.x - item.x,
          offsetY: cmStart.y - item.y,
          moved: false
        };
        refreshCanvas();
        return;
      }

      // 3. 命中墙体边缘（双击可快速标记门口）
      const wallEdge = e.target.closest('.wall-hit-edge');
      if (wallEdge) {
        const wall = wallEdge.dataset.wall;
        const now = Date.now();
        const tapKey = `wall:${wall}`;
        if (lastTapKey === tapKey && now - lastTapTime < 380) {
          lastTapKey = null;
          const cmPos = clientToRoomCm(e.clientX, e.clientY);
          const snapped = Geometry.snapOpeningToWall(cmPos.x, cmPos.y, 80, state.room, false);
          addOpening({ wall, offset: snapped.offset }, 80);
          showToast('已标记门口，可拖动沿墙移动或双击改尺寸');
          return;
        }
        lastTapKey = tapKey;
        lastTapTime = now;
      } else {
        lastTapKey = null;
      }

      if (state.selectedId || state.selectedOpeningId) {
        state.selectedId = null;
        state.selectedOpeningId = null;
        refreshCanvas();
      }
    });

    global.addEventListener('pointermove', (e) => {
      if (!canvasDrag && !openingDrag) return;
      lastMoveEvt = e;
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        if (!lastMoveEvt) return;
        const evt = lastMoveEvt;

        if (openingDrag) {
          const op = state.openings.find((o) => o.id === openingDrag.id);
          if (!op) return;
          if (Math.hypot(evt.clientX - openingDrag.startClientX, evt.clientY - openingDrag.startClientY) >= 3) {
            openingDrag.moved = true;
          }
          const cmPos = clientToRoomCm(evt.clientX, evt.clientY);
          const next = Geometry.snapOpeningToWall(cmPos.x, cmPos.y, op.width, state.room, evt.shiftKey);
          if (op.wall !== next.wall || op.offset !== next.offset) {
            op.wall = next.wall;
            op.offset = next.offset;
            refreshCanvas();
          }
          return;
        }

        if (canvasDrag) {
          const item = state.items.find((it) => it.id === canvasDrag.id);
          if (!item) return;

          if (Math.hypot(evt.clientX - canvasDrag.startClientX, evt.clientY - canvasDrag.startClientY) >= 3) {
            canvasDrag.moved = true;
          }

          const cmPos = clientToRoomCm(evt.clientX, evt.clientY);
          const rawX = cmPos.x - canvasDrag.offsetX;
          const rawY = cmPos.y - canvasDrag.offsetY;
          const snapped = Geometry.snapPosition(item, rawX, rawY, state.room, state.items, evt.shiftKey);

          if (item.x !== snapped.x || item.y !== snapped.y) {
            item.x = snapped.x;
            item.y = snapped.y;
            refreshCanvas();
          }
        }
      });
    });

    global.addEventListener('pointerup', () => {
      if (openingDrag) {
        const wasMoved = openingDrag.moved;
        openingDrag = null;
        state.draggingOpeningId = null;
        if (wasMoved) syncDraftAndPersist(true);
        refreshCanvas();
      }
      if (canvasDrag) {
        const wasMoved = canvasDrag.moved;
        canvasDrag = null;
        state.draggingId = null;
        if (wasMoved) syncDraftAndPersist(true);
        refreshCanvas();
      }
    });
  }

  function bindHeaderAndActions() {
    const { Layouts, Exporter } = global.RoomLayout;

    // 房间长宽高输入
    function handleRoomInput(commit) {
      const wM = parseFloat(dom.roomW.value);
      const dM = parseFloat(dom.roomD.value);
      const hM = parseFloat(dom.roomH.value);

      if (Number.isFinite(wM) && wM >= 1 && wM <= 20) {
        state.room.w = Math.round(wM * 100);
      } else if (commit) {
        state.room.w = clamp(Math.round((Number.isFinite(wM) ? wM : 4) * 100), 100, 2000);
      }

      if (Number.isFinite(dM) && dM >= 1 && dM <= 20) {
        state.room.d = Math.round(dM * 100);
      } else if (commit) {
        state.room.d = clamp(Math.round((Number.isFinite(dM) ? dM : 3.4) * 100), 100, 2000);
      }

      if (Number.isFinite(hM) && hM >= 1.8 && hM <= 6) {
        state.room.h = Math.round(hM * 100);
      } else if (commit) {
        state.room.h = clamp(Math.round((Number.isFinite(hM) ? hM : 2.8) * 100), 180, 600);
      }

      if (commit) syncRoomInputs();
      updateAreaBadge();
      syncDraftAndPersist(true);
      refreshCanvas();
    }

    [dom.roomW, dom.roomD, dom.roomH].forEach((input) => {
      input.addEventListener('input', () => handleRoomInput(false));
      input.addEventListener('change', () => handleRoomInput(true));
    });

    // 多布局栏交互
    dom.saveLayoutBtn.addEventListener('click', () => {
      if (state.store.activeLayoutId) {
        const res = Layouts.saveCurrentLayout(state.store, {
          room: state.room,
          items: state.items,
          openings: state.openings
        });
        state.isDirty = false;
        Layouts.persistStore(state.store);
        renderLayoutBar();
        showToast(`已保存「${res.layout.name}」`);
      } else {
        openLayoutModal('save');
      }
    });

    dom.newLayoutBtn.addEventListener('click', () => {
      const res = Layouts.createNewLayout(
        state.store,
        state.room,
        state.items,
        state.openings,
        state.isDirty
      );
      Layouts.persistStore(state.store);
      applyLoadedScene(res);
      if (res.autoSavedName) {
        showToast(`已自动暂存「${res.autoSavedName}」，开启全新空白布局`);
      } else {
        showToast('已新建空白布局');
      }
    });

    dom.layoutTabs.addEventListener('click', (e) => {
      const opBtn = e.target.closest('.layout-pill-op');
      if (opBtn) {
        e.stopPropagation();
        const layoutId = opBtn.dataset.layoutId;
        if (opBtn.dataset.op === 'rename') {
          openLayoutModal('rename', layoutId);
        } else if (opBtn.dataset.op === 'delete') {
          const res = Layouts.deleteLayout(state.store, layoutId);
          Layouts.persistStore(state.store);
          if (res && res.room) {
            applyLoadedScene(res);
          } else {
            renderLayoutBar();
          }
          if (res && res.removed) {
            showToast(`已删除「${res.removed.name}」`);
          }
        }
        return;
      }

      const pill = e.target.closest('.layout-pill[data-layout-id]');
      if (!pill) return;
      const targetId = pill.dataset.layoutId;
      if (targetId === state.store.activeLayoutId) return;

      const switched = Layouts.switchLayout(
        state.store,
        targetId,
        state.room,
        state.items,
        state.openings,
        state.isDirty
      );
      if (!switched) return;
      Layouts.persistStore(state.store);
      applyLoadedScene(switched);
      showToast(`已切换到「${switched.layout.name}」，可继续编辑`);
    });

    // 保存/重命名弹窗
    dom.layoutModalClose.addEventListener('click', closeLayoutModal);
    dom.layoutModalCancel.addEventListener('click', closeLayoutModal);
    dom.layoutModalConfirm.addEventListener('click', confirmLayoutModal);
    dom.layoutModal.addEventListener('click', (e) => {
      if (e.target === dom.layoutModal) closeLayoutModal();
    });
    dom.layoutQuickChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-chip');
      if (!btn) return;
      dom.layoutNameInput.value = btn.dataset.name || '';
      dom.layoutNameInput.focus();
    });

    // 分类筛选
    dom.categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;
      state.activeCategory = btn.dataset.cat;
      renderPalette();
    });

    // 清空画布
    dom.clearBtn.addEventListener('click', () => {
      if (state.items.length === 0 && state.openings.length === 0) return;
      state.items = [];
      state.openings = [];
      state.selectedId = null;
      state.selectedOpeningId = null;
      closeResizeModal();
      closeOpeningModal();
      syncDraftAndPersist(true);
      refreshCanvas();
      showToast('已清空当前画布');
    });

    // 截图保存
    dom.exportBtn.addEventListener('click', async () => {
      const activeLayout = Layouts.findLayout(state.store, state.store.activeLayoutId);
      const layoutName = activeLayout ? activeLayout.name : '';
      dom.exportBtn.disabled = true;
      try {
        const filename = await Exporter.exportToPng(
          state.room,
          state.items,
          state.openings,
          latestAnalysis,
          layoutName
        );
        showToast(`已生成高清布局图：${filename}`);
      } finally {
        dom.exportBtn.disabled = false;
      }
    });

    // 家具浮动工具条
    dom.btnRotate.addEventListener('click', rotateSelected);
    dom.btnResize.addEventListener('click', () => {
      if (state.selectedId) openResizeModal(state.selectedId);
    });
    dom.btnDuplicate.addEventListener('click', duplicateSelected);
    dom.btnDelete.addEventListener('click', deleteSelected);

    // 门口浮动工具条
    dom.openActFlip.addEventListener('click', flipSelectedOpening);
    dom.openActEdit.addEventListener('click', () => {
      if (state.selectedOpeningId) openOpeningModal(state.selectedOpeningId);
    });
    dom.openActDelete.addEventListener('click', deleteSelected);

    // 预警条点击定位家具或门口
    dom.statusBar.addEventListener('click', (e) => {
      const chip = e.target.closest('.warn-chip');
      if (!chip || !chip.dataset.targetId) return;
      const targetId = chip.dataset.targetId;
      if (state.openings.some((o) => o.id === targetId)) {
        state.selectedOpeningId = targetId;
        state.selectedId = null;
      } else {
        state.selectedId = targetId;
        state.selectedOpeningId = null;
      }
      state.flashId = targetId;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        state.flashId = null;
        refreshCanvas();
      }, 1100);
      refreshCanvas();
    });

    // 家具尺寸弹窗事件
    dom.closeModalBtn.addEventListener('click', closeResizeModal);
    dom.doneModalBtn.addEventListener('click', () => {
      applyResizeInputs(true);
      closeResizeModal();
    });
    dom.resizeModal.addEventListener('click', (e) => {
      if (e.target === dom.resizeModal) closeResizeModal();
    });

    [dom.editName, dom.editW, dom.editD, dom.editH].forEach((input) => {
      input.addEventListener('input', () => applyResizeInputs(false));
      input.addEventListener('change', () => applyResizeInputs(true));
    });

    dom.presetChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-chip');
      if (!btn || !state.editingId) return;
      const item = state.items.find((it) => it.id === state.editingId);
      if (!item) return;
      const cat = global.RoomLayout.Catalog.getById(item.catalogId);
      const preset = cat && cat.presets && cat.presets[Number(btn.dataset.idx)];
      if (!preset) return;
      item.w = preset.w;
      item.d = preset.d;
      item.h = preset.h;
      dom.editW.value = item.w;
      dom.editD.value = item.d;
      dom.editH.value = item.h;
      syncDraftAndPersist(true);
      refreshCanvas();
    });

    dom.resetSizeBtn.addEventListener('click', () => {
      if (!state.editingId) return;
      const item = state.items.find((it) => it.id === state.editingId);
      if (!item) return;
      const cat = global.RoomLayout.Catalog.getById(item.catalogId);
      if (!cat) return;
      item.w = cat.w;
      item.d = cat.d;
      item.h = cat.h;
      item.name = cat.name;
      dom.editName.value = item.name;
      dom.editW.value = item.w;
      dom.editD.value = item.d;
      dom.editH.value = item.h;
      syncDraftAndPersist(true);
      refreshCanvas();
    });

    // 门口定制弹窗事件
    dom.openingModalClose.addEventListener('click', closeOpeningModal);
    dom.openingModalDone.addEventListener('click', () => {
      applyOpeningInputs(true);
      closeOpeningModal();
    });
    dom.openingModal.addEventListener('click', (e) => {
      if (e.target === dom.openingModal) closeOpeningModal();
    });
    dom.openingPresetChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-chip');
      if (!btn) return;
      dom.openEditWidth.value = btn.dataset.width || 80;
      applyOpeningInputs(true);
    });
    [dom.openEditName, dom.openEditWidth].forEach((input) => {
      input.addEventListener('input', () => applyOpeningInputs(false));
      input.addEventListener('change', () => applyOpeningInputs(true));
    });
    [dom.openEditWall, dom.openEditSwing, dom.openEditHinge].forEach((sel) => {
      sel.addEventListener('change', () => applyOpeningInputs(true));
    });

    // 键盘快捷键
    global.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        if (!dom.layoutModal.hidden) closeLayoutModal();
        else if (!dom.openingModal.hidden) closeOpeningModal();
        else if (!dom.resizeModal.hidden) closeResizeModal();
        else if (state.selectedId || state.selectedOpeningId) {
          state.selectedId = null;
          state.selectedOpeningId = null;
          refreshCanvas();
        }
        return;
      }

      if (isInput) {
        if (e.key === 'Enter') {
          if (!dom.layoutModal.hidden) confirmLayoutModal();
          else if (!dom.openingModal.hidden) {
            applyOpeningInputs(true);
            closeOpeningModal();
          } else if (!dom.resizeModal.hidden) {
            applyResizeInputs(true);
            closeResizeModal();
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedId || state.selectedOpeningId) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      if (!state.selectedId) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateSelected();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const item = state.items.find((it) => it.id === state.selectedId);
        if (!item) return;
        const step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowLeft') item.x -= step;
        if (e.key === 'ArrowRight') item.x += step;
        if (e.key === 'ArrowUp') item.y -= step;
        if (e.key === 'ArrowDown') item.y += step;
        syncDraftAndPersist(true);
        refreshCanvas();
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => refreshCanvas());
      ro.observe(dom.stage);
    } else {
      global.addEventListener('resize', refreshCanvas);
    }
  }

  function init() {
    dom = {
      roomW: document.getElementById('room-w'),
      roomD: document.getElementById('room-d'),
      roomH: document.getElementById('room-h'),
      roomArea: document.getElementById('room-area'),
      clearBtn: document.getElementById('btn-clear'),
      exportBtn: document.getElementById('btn-export'),
      layoutTabs: document.getElementById('layout-tabs'),
      saveLayoutBtn: document.getElementById('btn-save-layout'),
      newLayoutBtn: document.getElementById('btn-new-layout'),
      categoryTabs: document.getElementById('category-tabs'),
      furnitureGrid: document.getElementById('furniture-grid'),
      statusBar: document.getElementById('status-bar'),
      stage: document.getElementById('canvas-stage'),
      svg: document.getElementById('floorplan-svg'),
      floatingBar: document.getElementById('floating-bar'),
      btnRotate: document.getElementById('act-rotate'),
      btnResize: document.getElementById('act-resize'),
      btnDuplicate: document.getElementById('act-duplicate'),
      btnDelete: document.getElementById('act-delete'),
      floatingOpeningBar: document.getElementById('floating-opening-bar'),
      openActFlip: document.getElementById('open-act-flip'),
      openActEdit: document.getElementById('open-act-edit'),
      openActDelete: document.getElementById('open-act-delete'),
      resizeModal: document.getElementById('resize-modal'),
      resizeTitle: document.getElementById('resize-title'),
      closeModalBtn: document.getElementById('modal-close'),
      doneModalBtn: document.getElementById('modal-done'),
      resetSizeBtn: document.getElementById('modal-reset'),
      presetRow: document.getElementById('preset-row'),
      presetChips: document.getElementById('preset-chips'),
      editName: document.getElementById('edit-name'),
      editW: document.getElementById('edit-w'),
      editD: document.getElementById('edit-d'),
      editH: document.getElementById('edit-h'),
      openingModal: document.getElementById('opening-modal'),
      openingModalClose: document.getElementById('opening-modal-close'),
      openingModalDone: document.getElementById('opening-modal-done'),
      openingPresetChips: document.getElementById('opening-preset-chips'),
      openEditName: document.getElementById('open-edit-name'),
      openEditWidth: document.getElementById('open-edit-width'),
      openEditWall: document.getElementById('open-edit-wall'),
      openEditSwing: document.getElementById('open-edit-swing'),
      openEditHinge: document.getElementById('open-edit-hinge'),
      layoutModal: document.getElementById('layout-modal'),
      layoutModalTitle: document.getElementById('layout-modal-title'),
      layoutModalClose: document.getElementById('layout-modal-close'),
      layoutModalCancel: document.getElementById('layout-modal-cancel'),
      layoutModalConfirm: document.getElementById('layout-modal-confirm'),
      layoutQuickChips: document.getElementById('layout-quick-chips'),
      layoutNameInput: document.getElementById('layout-name-input'),
      toast: document.getElementById('toast')
    };

    loadInitialState();
    syncRoomInputs();
    renderLayoutBar();
    renderPalette();
    bindPalettePointerEvents();
    bindCanvasPointerEvents();
    bindHeaderAndActions();
    refreshCanvas();
  }

  document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
