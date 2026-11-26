/**
 * 等比例 SVG 平面画布渲染器
 * 分层渲染：网格层 -> 墙体与房间外尺寸标注 -> 墙边门口标记层 -> 家具建筑俯视层 -> 实时间距标尺与标红预警层
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMeters(cm) {
    return (cm / 100).toFixed(2).replace(/\.00$/, '.0');
  }

  /**
   * 根据容器宽高与房间实际尺寸计算 1:1 等比例缩放参数
   */
  function computeMetrics(room, containerWidth, containerHeight) {
    const padLeft = 72;
    const padRight = 52;
    const padTop = 58;
    const padBottom = 46;

    const safeW = Math.max(240, containerWidth);
    const safeH = Math.max(220, containerHeight);
    const availW = Math.max(100, safeW - padLeft - padRight);
    const availH = Math.max(100, safeH - padTop - padBottom);

    const scale = Math.min(availW / room.w, availH / room.d);
    const roomPxW = room.w * scale;
    const roomPxD = room.d * scale;

    const originX = padLeft + (availW - roomPxW) / 2;
    const originY = padTop + (availH - roomPxD) / 2;

    return {
      svgWidth: safeW,
      svgHeight: safeH,
      originX,
      originY,
      scale,
      roomPxW,
      roomPxD
    };
  }

  function renderDimensionLine(x1, y1, x2, y2, label, variant) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return '';

    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    let color = '#059669';
    let pillFill = '#ffffff';
    let pillStroke = '#059669';
    let textColor = '#047857';
    let dash = 'none';

    if (variant === 'narrow') {
      color = '#dc2626';
      pillFill = '#dc2626';
      pillStroke = '#dc2626';
      textColor = '#ffffff';
      dash = '4 3';
    } else if (variant === 'flush') {
      color = '#94a3b8';
      pillFill = '#f8fafc';
      pillStroke = '#cbd5e1';
      textColor = '#64748b';
    }

    const tick = 5;
    const tickSvg = isHorizontal
      ? `<line x1="${x1}" y1="${y1 - tick}" x2="${x1}" y2="${y1 + tick}" stroke="${color}" stroke-width="1.4"/>` +
        `<line x1="${x2}" y1="${y2 - tick}" x2="${x2}" y2="${y2 + tick}" stroke="${color}" stroke-width="1.4"/>`
      : `<line x1="${x1 - tick}" y1="${y1}" x2="${x1 + tick}" y2="${y1}" stroke="${color}" stroke-width="1.4"/>` +
        `<line x1="${x2 - tick}" y1="${y2}" x2="${x2 + tick}" y2="${y2}" stroke="${color}" stroke-width="1.4"/>`;

    const pillW = Math.max(38, label.length * 7.4 + 12);
    const pillH = 18;

    return [
      `<g class="dim-line dim-${variant}" pointer-events="none">`,
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${variant === 'narrow' ? 1.8 : 1.4}" ${dash !== 'none' ? `stroke-dasharray="${dash}"` : ''}/>`,
      tickSvg,
      `<rect x="${mx - pillW / 2}" y="${my - pillH / 2}" width="${pillW}" height="${pillH}" rx="9" fill="${pillFill}" stroke="${pillStroke}" stroke-width="1.1"/>`,
      `<text x="${mx}" y="${my + 3.8}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${textColor}">${escapeHtml(label)}</text>`,
      `</g>`
    ].join('');
  }

  function renderFlushBadge(c, originX, originY, scale) {
    const mx = originX + ((c.x1 + c.x2) / 2) * scale;
    const my = originY + ((c.y1 + c.y2) / 2) * scale;
    const w = 30;
    const h = 15;
    return [
      `<g pointer-events="none">`,
      `<rect x="${mx - w / 2}" y="${my - h / 2}" width="${w}" height="${h}" rx="7.5" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>`,
      `<text x="${mx}" y="${my + 3.2}" text-anchor="middle" font-size="9" font-weight="500" fill="#64748b">贴合</text>`,
      `</g>`
    ].join('');
  }

  function renderGrid(room, metrics) {
    const { originX, originY, scale, roomPxW, roomPxD } = metrics;
    const lines = [];
    const minorStep = 10;
    const majorStep = 50;

    if (scale >= 0.8) {
      for (let x = minorStep; x < room.w; x += minorStep) {
        if (x % majorStep === 0) continue;
        const px = originX + x * scale;
        lines.push(`<line x1="${px}" y1="${originY}" x2="${px}" y2="${originY + roomPxD}" stroke="#f1f5f9" stroke-width="1"/>`);
      }
      for (let y = minorStep; y < room.d; y += minorStep) {
        if (y % majorStep === 0) continue;
        const py = originY + y * scale;
        lines.push(`<line x1="${originX}" y1="${py}" x2="${originX + roomPxW}" y2="${py}" stroke="#f1f5f9" stroke-width="1"/>`);
      }
    }

    for (let x = majorStep; x < room.w; x += majorStep) {
      const px = originX + x * scale;
      lines.push(`<line x1="${px}" y1="${originY}" x2="${px}" y2="${originY + roomPxD}" stroke="#e2e8f0" stroke-width="1"/>`);
    }
    for (let y = majorStep; y < room.d; y += majorStep) {
      const py = originY + y * scale;
      lines.push(`<line x1="${originX}" y1="${py}" x2="${originX + roomPxW}" y2="${py}" stroke="#e2e8f0" stroke-width="1"/>`);
    }

    return lines.join('');
  }

  function renderRoomShell(room, metrics) {
    const { originX, originY, roomPxW, roomPxD } = metrics;
    const topDimY = originY - 22;
    const topLabel = `${formatMeters(room.w)}m (${room.w}cm)`;
    const topLabelW = Math.max(84, topLabel.length * 7 + 16);
    const leftDimX = originX - 24;
    const leftLabel = `${formatMeters(room.d)}m (${room.d}cm)`;

    return [
      `<rect x="${originX}" y="${originY}" width="${roomPxW}" height="${roomPxD}" fill="#ffffff"/>`,
      renderGrid(room, metrics),
      `<rect x="${originX}" y="${originY}" width="${roomPxW}" height="${roomPxD}" fill="none" stroke="#1e293b" stroke-width="4" stroke-linejoin="miter"/>`,
      // 四面墙可双击标门口的透明命中带
      `<line class="wall-hit-edge" data-wall="top" x1="${originX}" y1="${originY}" x2="${originX + roomPxW}" y2="${originY}" stroke="transparent" stroke-width="16"><title>双击墙边可标记门口位置</title></line>`,
      `<line class="wall-hit-edge" data-wall="bottom" x1="${originX}" y1="${originY + roomPxD}" x2="${originX + roomPxW}" y2="${originY + roomPxD}" stroke="transparent" stroke-width="16"><title>双击墙边可标记门口位置</title></line>`,
      `<line class="wall-hit-edge" data-wall="left" x1="${originX}" y1="${originY}" x2="${originX}" y2="${originY + roomPxD}" stroke="transparent" stroke-width="16"><title>双击墙边可标记门口位置</title></line>`,
      `<line class="wall-hit-edge" data-wall="right" x1="${originX + roomPxW}" y1="${originY}" x2="${originX + roomPxW}" y2="${originY + roomPxD}" stroke="transparent" stroke-width="16"><title>双击墙边可标记门口位置</title></line>`,
      // 顶部长度标尺
      `<g class="room-dim" pointer-events="none">`,
      `<line x1="${originX}" y1="${originY - 6}" x2="${originX}" y2="${topDimY - 5}" stroke="#94a3b8" stroke-width="1"/>`,
      `<line x1="${originX + roomPxW}" y1="${originY - 6}" x2="${originX + roomPxW}" y2="${topDimY - 5}" stroke="#94a3b8" stroke-width="1"/>`,
      `<line x1="${originX}" y1="${topDimY}" x2="${originX + roomPxW}" y2="${topDimY}" stroke="#475569" stroke-width="1.2"/>`,
      `<rect x="${originX + roomPxW / 2 - topLabelW / 2}" y="${topDimY - 10}" width="${topLabelW}" height="20" rx="4" fill="#f8fafc"/>`,
      `<text x="${originX + roomPxW / 2}" y="${topDimY + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1e293b">${escapeHtml(topLabel)}</text>`,
      `</g>`,
      // 左侧宽度标尺
      `<g class="room-dim" pointer-events="none">`,
      `<line x1="${originX - 6}" y1="${originY}" x2="${leftDimX - 5}" y2="${originY}" stroke="#94a3b8" stroke-width="1"/>`,
      `<line x1="${originX - 6}" y1="${originY + roomPxD}" x2="${leftDimX - 5}" y2="${originY + roomPxD}" stroke="#94a3b8" stroke-width="1"/>`,
      `<line x1="${leftDimX}" y1="${originY}" x2="${leftDimX}" y2="${originY + roomPxD}" stroke="#475569" stroke-width="1.2"/>`,
      `<g transform="translate(${leftDimX}, ${originY + roomPxD / 2}) rotate(-90)">`,
      `<rect x="${-topLabelW / 2}" y="-10" width="${topLabelW}" height="20" rx="4" fill="#f8fafc"/>`,
      `<text x="0" y="4" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1e293b">${escapeHtml(leftLabel)}</text>`,
      `</g>`,
      `</g>`,
      `<text x="${originX + roomPxW}" y="${originY + roomPxD + 18}" text-anchor="end" font-size="10.5" font-weight="500" fill="#64748b" pointer-events="none">层高 ${formatMeters(room.h)}m (${room.h}cm)</text>`
    ].join('');
  }

  /**
   * 渲染墙边门口/洞口标记（带白底断墙、门扇弧线及尺寸徽章）
   */
  function getOpeningVectors(geom, originX, originY, scale) {
    const px1 = originX + geom.x1 * scale;
    const py1 = originY + geom.y1 * scale;
    const px2 = originX + geom.x2 * scale;
    const py2 = originY + geom.y2 * scale;
    const r = geom.width * scale;
    const hx = originX + geom.hingeX * scale;
    const hy = originY + geom.hingeY * scale;
    const jx = geom.hinge === 'start' ? px2 : px1;
    const jy = geom.hinge === 'start' ? py2 : py1;

    // 指向室内/室外的法线单位向量
    let nx = 0;
    let ny = 0;
    if (geom.wall === 'top') ny = geom.swing === 'out' ? -1 : 1;
    else if (geom.wall === 'bottom') ny = geom.swing === 'out' ? 1 : -1;
    else if (geom.wall === 'left') nx = geom.swing === 'out' ? -1 : 1;
    else nx = geom.swing === 'out' ? 1 : -1;

    const tx = hx + nx * r;
    const ty = hy + ny * r;
    const cross = (jx - hx) * (ty - hy) - (jy - hy) * (tx - hx);
    const sweepFlag = cross > 0 ? 1 : 0;

    return { px1, py1, px2, py2, r, hx, hy, jx, jy, tx, ty, nx, ny, sweepFlag, cross };
  }

  function renderOpeningItem(op, room, metrics, state, analysis) {
    const { Geometry } = global.RoomLayout;
    const { originX, originY, scale } = metrics;
    const geom = Geometry.getOpeningGeometry(op, room);
    const v = getOpeningVectors(geom, originX, originY, scale);

    const isBlocked = analysis.openingIssues && analysis.openingIssues.has(op.id);
    const isSelected = state.selectedOpeningId === op.id;
    const isFlashing = state.flashId === op.id;
    const stroke = isBlocked ? '#dc2626' : isSelected ? '#0f766e' : '#0284c7';
    const fill = isBlocked ? '#ef4444' : '#0284c7';

    // 墙体开口白底（切开墙线）+ 两侧门垛短线
    const isHoriz = geom.wall === 'top' || geom.wall === 'bottom';
    const jambSvg = isHoriz
      ? `<line x1="${v.px1}" y1="${v.py1 - 5}" x2="${v.px1}" y2="${v.py1 + 5}" stroke="#1e293b" stroke-width="2.2"/>` +
        `<line x1="${v.px2}" y1="${v.py2 - 5}" x2="${v.px2}" y2="${v.py2 + 5}" stroke="#1e293b" stroke-width="2.2"/>`
      : `<line x1="${v.px1 - 5}" y1="${v.py1}" x2="${v.px1 + 5}" y2="${v.py1}" stroke="#1e293b" stroke-width="2.2"/>` +
        `<line x1="${v.px2 - 5}" y1="${v.py2}" x2="${v.px2 + 5}" y2="${v.py2}" stroke="#1e293b" stroke-width="2.2"/>`;

    let swingSvg = '';
    if (geom.swing !== 'none') {
      const sectorPath = `M ${v.hx} ${v.hy} L ${v.jx} ${v.jy} A ${v.r} ${v.r} 0 0 ${v.sweepFlag} ${v.tx} ${v.ty} Z`;
      const arcPath = `M ${v.jx} ${v.jy} A ${v.r} ${v.r} 0 0 ${v.sweepFlag} ${v.tx} ${v.ty}`;
      swingSvg =
        `<path d="${sectorPath}" fill="${fill}" fill-opacity="${isBlocked ? 0.14 : 0.08}" pointer-events="none"/>` +
        `<path d="${arcPath}" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-dasharray="4 3" pointer-events="none"/>` +
        `<line x1="${v.hx}" y1="${v.hy}" x2="${v.tx}" y2="${v.ty}" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round"/>`;
    } else {
      // 推拉门 / 门洞示意双虚线
      swingSvg = `<line x1="${v.px1}" y1="${v.py1}" x2="${v.px2}" y2="${v.py2}" stroke="${stroke}" stroke-width="2" stroke-dasharray="5 3"/>`;
    }

    // 门口尺寸胶囊标签
    const labelText = `${op.name || '门口'} ${geom.width}cm`;
    const pillW = Math.max(54, labelText.length * 7.2 + 12);
    const pillH = 18;
    const midX = (v.px1 + v.px2) / 2;
    const midY = (v.py1 + v.py2) / 2;
    let labelX = midX;
    let labelY = midY;
    if (geom.wall === 'top') labelY = midY + 13;
    else if (geom.wall === 'bottom') labelY = midY - 13;
    else if (geom.wall === 'left') labelX = midX + pillW / 2 + 6;
    else labelX = midX - pillW / 2 - 6;

    // 热区矩形方便拖拽或点击选中门口
    const hitStroke = `<line x1="${v.px1}" y1="${v.py1}" x2="${v.px2}" y2="${v.py2}" stroke="transparent" stroke-width="18"/>`;

    const flashSvg = isFlashing
      ? `<circle cx="${midX}" cy="${midY}" r="${Math.max(18, v.r * 0.45)}" fill="none" stroke="#dc2626" stroke-width="2.4" class="flash-ring" pointer-events="none"/>`
      : '';

    return [
      `<g class="opening-node${isSelected ? ' is-selected' : ''}" data-opening-id="${escapeHtml(op.id)}">`,
      `<line x1="${v.px1}" y1="${v.py1}" x2="${v.px2}" y2="${v.py2}" stroke="#ffffff" stroke-width="6.5"/>`,
      swingSvg,
      jambSvg,
      hitStroke,
      `<g pointer-events="none">`,
      `<rect x="${labelX - pillW / 2}" y="${labelY - pillH / 2}" width="${pillW}" height="${pillH}" rx="9" fill="${isBlocked ? '#dc2626' : isSelected ? '#0f766e' : '#ffffff'}" stroke="${stroke}" stroke-width="1.2"/>`,
      `<text x="${labelX}" y="${labelY + 3.6}" text-anchor="middle" font-size="10" font-weight="600" fill="${isBlocked || isSelected ? '#ffffff' : '#0369a1'}">${escapeHtml(labelText)}</text>`,
      `</g>`,
      flashSvg,
      `</g>`
    ].join('');
  }

  function renderFurnitureItem(item, metrics, state, analysis) {
    const { Geometry, Catalog } = global.RoomLayout;
    const { originX, originY, scale } = metrics;
    const fp = Geometry.getFootprint(item);
    const cat = Catalog.getById(item.catalogId);

    const pxX = originX + fp.x * scale;
    const pxY = originY + fp.y * scale;
    const pxW = fp.w * scale;
    const pxD = fp.d * scale;

    const rawPxW = item.w * scale;
    const rawPxD = item.d * scale;
    const rot = (((item.rotation || 0) % 360) + 360) % 360;

    const issues = analysis.itemIssues.get(item.id);
    const hasSevere =
      issues && (issues.has('out_of_bounds') || issues.has('overlap') || issues.has('height_exceeded'));
    const hasNarrowOnly = !hasSevere && issues && (issues.has('narrow_gap') || issues.has('door_blocked'));
    const isSelected = state.selectedId === item.id;
    const isFlashing = state.flashId === item.id;

    const fill = cat ? cat.fill : '#f1f5f9';
    const stroke = hasSevere ? '#dc2626' : hasNarrowOnly ? '#ea580c' : cat ? cat.stroke : '#475569';

    const shapeSvg = cat
      ? cat.drawSvg(rawPxW, rawPxD, fill, stroke)
      : `<rect x="0.75" y="0.75" width="${Math.max(1, rawPxW - 1.5)}" height="${Math.max(1, rawPxD - 1.5)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;

    let dangerOverlay = '';
    if (hasSevere) {
      const badgeTexts = [];
      if (issues.has('out_of_bounds')) badgeTexts.push('超界');
      if (issues.has('overlap')) badgeTexts.push('重叠');
      if (issues.has('height_exceeded')) badgeTexts.push('超高');
      const badgeText = badgeTexts.join('·');
      const bw = Math.max(30, badgeText.length * 10 + 10);

      dangerOverlay =
        `<rect x="0" y="0" width="${pxW}" height="${pxD}" rx="3" fill="url(#hatch-danger)" stroke="#dc2626" stroke-width="2" pointer-events="none"/>` +
        `<g pointer-events="none">` +
        `<rect x="${Math.max(2, pxW - bw - 3)}" y="3" width="${bw}" height="16" rx="8" fill="#dc2626"/>` +
        `<text x="${Math.max(2, pxW - bw - 3) + bw / 2}" y="14" text-anchor="middle" font-size="9.5" font-weight="700" fill="#ffffff">${escapeHtml(badgeText)}</text>` +
        `</g>`;
    } else if (hasNarrowOnly) {
      dangerOverlay = `<rect x="-1" y="-1" width="${pxW + 2}" height="${pxD + 2}" rx="3" fill="none" stroke="#ea580c" stroke-width="1.6" stroke-dasharray="4 2" pointer-events="none"/>`;
    }

    const selectOutline = isSelected
      ? `<rect x="-3" y="-3" width="${pxW + 6}" height="${pxD + 6}" rx="4" fill="none" stroke="#0f766e" stroke-width="2" pointer-events="none"/>` +
        `<circle cx="-3" cy="-3" r="3.2" fill="#ffffff" stroke="#0f766e" stroke-width="1.6" pointer-events="none"/>` +
        `<circle cx="${pxW + 3}" cy="-3" r="3.2" fill="#ffffff" stroke="#0f766e" stroke-width="1.6" pointer-events="none"/>` +
        `<circle cx="-3" cy="${pxD + 3}" r="3.2" fill="#ffffff" stroke="#0f766e" stroke-width="1.6" pointer-events="none"/>` +
        `<circle cx="${pxW + 3}" cy="${pxD + 3}" r="3.2" fill="#ffffff" stroke="#0f766e" stroke-width="1.6" pointer-events="none"/>`
      : '';

    const flashRing = isFlashing
      ? `<rect x="-6" y="-6" width="${pxW + 12}" height="${pxD + 12}" rx="6" fill="none" stroke="#dc2626" stroke-width="2.5" opacity="0.85" class="flash-ring" pointer-events="none"/>`
      : '';

    const minDim = Math.min(pxW, pxD);
    const maxDim = Math.max(pxW, pxD);
    const nameFont = minDim < 42 ? 9 : minDim < 64 ? 10.5 : 12;
    const sizeFont = minDim < 42 ? 8 : 9.5;
    const dimLabel = `${item.w}×${item.d}cm`;
    const showTwoLines = pxD >= 34 && pxW >= 40;
    const labelColor = hasSevere ? '#991b1b' : '#1e293b';
    const subColor = hasSevere ? '#b91c1c' : '#475569';

    let labelSvg = '';
    if (pxW >= 26 && pxD >= 20) {
      if (showTwoLines) {
        const bgW = Math.min(pxW - 6, Math.max(item.name.length * nameFont + 10, dimLabel.length * 5.8 + 8));
        const bgH = nameFont + sizeFont + 10;
        labelSvg =
          `<g pointer-events="none">` +
          `<rect x="${pxW / 2 - bgW / 2}" y="${pxD / 2 - bgH / 2}" width="${bgW}" height="${bgH}" rx="4" fill="#ffffff" fill-opacity="0.78"/>` +
          `<text x="${pxW / 2}" y="${pxD / 2 - 2}" text-anchor="middle" font-size="${nameFont}" font-weight="600" fill="${labelColor}">${escapeHtml(item.name)}</text>` +
          `<text x="${pxW / 2}" y="${pxD / 2 + sizeFont + 1}" text-anchor="middle" font-size="${sizeFont}" font-weight="500" fill="${subColor}">${escapeHtml(dimLabel)}</text>` +
          `</g>`;
      } else {
        labelSvg = `<text x="${pxW / 2}" y="${pxD / 2 + 3.5}" text-anchor="middle" font-size="${nameFont}" font-weight="600" fill="${labelColor}" pointer-events="none">${escapeHtml(item.name)}</text>`;
      }
    } else if (maxDim >= 26) {
      // 窄长组件（如屏风隔断）居中贴片标注，确保名称与尺寸依然清晰可读
      const compactLabel = `${item.name} ${dimLabel}`;
      const pillW = Math.max(58, compactLabel.length * 6.5 + 12);
      labelSvg =
        `<g pointer-events="none">` +
        `<rect x="${pxW / 2 - pillW / 2}" y="${pxD / 2 - 8.5}" width="${pillW}" height="17" rx="8.5" fill="#ffffff" fill-opacity="0.92" stroke="${stroke}" stroke-width="1"/>` +
        `<text x="${pxW / 2}" y="${pxD / 2 + 3.4}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${labelColor}">${escapeHtml(compactLabel)}</text>` +
        `</g>`;
    }

    // 窄长部件增加透明点击热区，便于鼠标点选拖拽
    const hitPad = minDim < 18 ? `<rect x="-5" y="-5" width="${pxW + 10}" height="${pxD + 10}" fill="transparent"/>` : '';

    return [
      `<g class="furniture-node${isSelected ? ' is-selected' : ''}" data-id="${escapeHtml(item.id)}" transform="translate(${pxX}, ${pxY})">`,
      hitPad,
      `<g transform="translate(${pxW / 2}, ${pxD / 2}) rotate(${rot}) translate(${-rawPxW / 2}, ${-rawPxD / 2})">`,
      shapeSvg,
      `</g>`,
      dangerOverlay,
      labelSvg,
      selectOutline,
      flashRing,
      `</g>`
    ].join('');
  }

  function renderClearancesLayer(room, items, metrics, state, analysis) {
    const { Geometry } = global.RoomLayout;
    const { originX, originY, scale } = metrics;
    const parts = [];
    const renderedNarrowKeys = new Set();

    for (let i = 0; i < analysis.narrowLines.length; i++) {
      const c = analysis.narrowLines[i];
      const key = `${Math.round(c.x1)},${Math.round(c.y1)}-${Math.round(c.x2)},${Math.round(c.y2)}`;
      renderedNarrowKeys.add(key);
      parts.push(
        renderDimensionLine(
          originX + c.x1 * scale,
          originY + c.y1 * scale,
          originX + c.x2 * scale,
          originY + c.y2 * scale,
          `${Math.round(c.gap)}cm`,
          'narrow'
        )
      );
    }

    const activeId = state.draggingId || state.selectedId;
    if (activeId) {
      const activeItem = items.find((it) => it.id === activeId);
      if (activeItem) {
        const clearances = Geometry.measureClearances(activeItem, room, items);
        for (let i = 0; i < clearances.length; i++) {
          const c = clearances[i];
          if (c.status === 'flush') {
            parts.push(renderFlushBadge(c, originX, originY, scale));
            continue;
          }
          const key1 = `${Math.round(c.x1)},${Math.round(c.y1)}-${Math.round(c.x2)},${Math.round(c.y2)}`;
          const key2 = `${Math.round(c.x2)},${Math.round(c.y2)}-${Math.round(c.x1)},${Math.round(c.y1)}`;
          if (c.status === 'narrow' && (renderedNarrowKeys.has(key1) || renderedNarrowKeys.has(key2))) {
            continue;
          }
          parts.push(
            renderDimensionLine(
              originX + c.x1 * scale,
              originY + c.y1 * scale,
              originX + c.x2 * scale,
              originY + c.y2 * scale,
              `${Math.round(c.gap)}cm`,
              c.status
            )
          );
        }
      }
    }

    return parts.join('');
  }

  /**
   * 渲染主入口，返回最新的 metrics
   */
  function render(svgEl, room, items, openings, state, analysis) {
    const rect = svgEl.getBoundingClientRect();
    const width = Math.max(260, rect.width || svgEl.clientWidth || 720);
    const height = Math.max(240, rect.height || svgEl.clientHeight || 520);

    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const metrics = computeMetrics(room, width, height);

    const defs =
      `<defs>` +
      `<pattern id="hatch-danger" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">` +
      `<rect width="8" height="8" fill="#ef4444" fill-opacity="0.10"/>` +
      `<line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" stroke-width="2" stroke-opacity="0.34"/>` +
      `</pattern>` +
      `</defs>`;

    const openingList = Array.isArray(openings) ? openings : [];
    const shellSvg = renderRoomShell(room, metrics);
    const openingsSvg = openingList
      .map((op) => renderOpeningItem(op, room, metrics, state, analysis))
      .join('');
    const furnitureSvg = items
      .map((item) => renderFurnitureItem(item, metrics, state, analysis))
      .join('');
    const clearancesSvg = renderClearancesLayer(room, items, metrics, state, analysis);

    let emptyHint = '';
    if (items.length === 0 && openingList.length === 0) {
      const cx = metrics.originX + metrics.roomPxW / 2;
      const cy = metrics.originY + metrics.roomPxD / 2;
      emptyHint =
        `<g pointer-events="none" opacity="0.72">` +
        `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="14" font-weight="600" fill="#64748b">从左侧拖入或点击家具开始试排</text>` +
        `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11.5" fill="#94a3b8">放置时自动测距 · 双击墙边可标门口 · 过窄或超占自动标红</text>` +
        `</g>`;
    }

    svgEl.innerHTML = [
      defs,
      `<g class="layer-room">${shellSvg}</g>`,
      emptyHint,
      `<g class="layer-openings">${openingsSvg}</g>`,
      `<g class="layer-furniture">${furnitureSvg}</g>`,
      `<g class="layer-clearances">${clearancesSvg}</g>`
    ].join('');

    return metrics;
  }

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Renderer = {
    computeMetrics,
    getOpeningVectors,
    render
  };
})(typeof window !== 'undefined' ? window : globalThis);
