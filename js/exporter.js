/**
 * 高清 2x PNG 截图导出器（零外部依赖，直接基于 Canvas 2D 还原画布、墙边门口、屏风隔断、尺寸标注与标红预警）
 */
(function (global) {
  'use strict';

  const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  function formatMeters(cm) {
    return (cm / 100).toFixed(2).replace(/\.00$/, '.0');
  }

  function drawDimensionLineCanvas(ctx, x1, y1, x2, y2, label, isNarrow) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.hypot(dx, dy) < 2) return;

    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const color = isNarrow ? '#dc2626' : '#059669';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isNarrow ? 2.2 : 1.6;
    if (isNarrow) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.setLineDash([]);
    const tick = 6;
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(x1, y1 - tick);
      ctx.lineTo(x1, y1 + tick);
      ctx.moveTo(x2, y2 - tick);
      ctx.lineTo(x2, y2 + tick);
    } else {
      ctx.moveTo(x1 - tick, y1);
      ctx.lineTo(x1 + tick, y1);
      ctx.moveTo(x2 - tick, y2);
      ctx.lineTo(x2 + tick, y2);
    }
    ctx.stroke();

    ctx.font = `600 13px ${FONT_FAMILY}`;
    const textW = ctx.measureText(label).width;
    const pillW = Math.max(46, textW + 16);
    const pillH = 22;

    ctx.beginPath();
    ctx.roundRect(mx - pillW / 2, my - pillH / 2, pillW, pillH, 11);
    ctx.fillStyle = isNarrow ? '#dc2626' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = isNarrow ? '#ffffff' : '#047857';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my + 0.5);
    ctx.restore();
  }

  function drawOpeningsCanvas(ctx, openings, room, originX, originY, scale, analysis) {
    const { Geometry, Renderer } = global.RoomLayout;
    const list = Array.isArray(openings) ? openings : [];
    for (let i = 0; i < list.length; i++) {
      const op = list[i];
      const geom = Geometry.getOpeningGeometry(op, room);
      const v = Renderer.getOpeningVectors(geom, originX, originY, scale);
      const isBlocked = analysis.openingIssues && analysis.openingIssues.has(op.id);
      const stroke = isBlocked ? '#dc2626' : '#0284c7';

      ctx.save();
      // 白底切断墙线
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(v.px1, v.py1);
      ctx.lineTo(v.px2, v.py2);
      ctx.stroke();

      if (geom.type === 'window') {
        const thick = 7;
        ctx.fillStyle = '#e0f2fe';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.4;
        if (geom.wall === 'top' || geom.wall === 'bottom') {
          ctx.fillRect(v.px1, v.py1 - thick / 2, Math.max(2, v.px2 - v.px1), thick);
          ctx.strokeRect(v.px1, v.py1 - thick / 2, Math.max(2, v.px2 - v.px1), thick);
        } else {
          ctx.fillRect(v.px1 - thick / 2, v.py1, thick, Math.max(2, v.py2 - v.py1));
          ctx.strokeRect(v.px1 - thick / 2, v.py1, thick, Math.max(2, v.py2 - v.py1));
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(v.px1, v.py1);
        ctx.lineTo(v.px2, v.py2);
        ctx.stroke();
      } else if (geom.swing !== 'none') {
        const a1 = Math.atan2(v.jy - v.hy, v.jx - v.hx);
        const a2 = Math.atan2(v.ty - v.hy, v.tx - v.hx);
        const anticlockwise = v.cross < 0;

        ctx.fillStyle = isBlocked ? 'rgba(239, 68, 68, 0.14)' : 'rgba(2, 132, 199, 0.08)';
        ctx.beginPath();
        ctx.moveTo(v.hx, v.hy);
        ctx.lineTo(v.jx, v.jy);
        ctx.arc(v.hx, v.hy, v.r, a1, a2, anticlockwise);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(v.hx, v.hy, v.r, a1, a2, anticlockwise);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(v.hx, v.hy);
        ctx.lineTo(v.tx, v.ty);
        ctx.stroke();
      } else {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(v.px1, v.py1);
        ctx.lineTo(v.px2, v.py2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 门垛/窗垛端线
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (geom.wall === 'top' || geom.wall === 'bottom') {
        ctx.moveTo(v.px1, v.py1 - 5);
        ctx.lineTo(v.px1, v.py1 + 5);
        ctx.moveTo(v.px2, v.py2 - 5);
        ctx.lineTo(v.px2, v.py2 + 5);
      } else {
        ctx.moveTo(v.px1 - 5, v.py1);
        ctx.lineTo(v.px1 + 5, v.py1);
        ctx.moveTo(v.px2 - 5, v.py2);
        ctx.lineTo(v.px2 + 5, v.py2);
      }
      ctx.stroke();

      // 门口/窗户标签
      const defaultLabel = geom.type === 'window' ? '窗户' : '门口';
      const labelText = `${op.name || defaultLabel} ${geom.width}cm`;
      ctx.font = `600 11px ${FONT_FAMILY}`;
      const pillW = Math.max(58, ctx.measureText(labelText).width + 14);
      const pillH = 20;
      const midX = (v.px1 + v.px2) / 2;
      const midY = (v.py1 + v.py2) / 2;
      let labelX = midX;
      let labelY = midY;
      if (geom.wall === 'top') labelY = midY + 15;
      else if (geom.wall === 'bottom') labelY = midY - 15;
      else if (geom.wall === 'left') labelX = midX + pillW / 2 + 7;
      else labelX = midX - pillW / 2 - 7;

      ctx.beginPath();
      ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, 10);
      ctx.fillStyle = isBlocked ? '#dc2626' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.fillStyle = isBlocked ? '#ffffff' : '#0369a1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX, labelY + 0.5);
      ctx.restore();
    }
  }

  function drawNotesCanvas(ctx, notes, originX, originY, scale) {
    const list = Array.isArray(notes) ? notes : [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const text = (n.text || '').trim();
      if (!text) continue;
      const px = originX + n.x * scale;
      const py = originY + n.y * scale;
      ctx.save();
      ctx.font = `600 12px ${FONT_FAMILY}`;
      const bw = Math.max(52, ctx.measureText(text).width + 28);
      const bh = 26;
      ctx.beginPath();
      ctx.roundRect(px - bw / 2, py - bh / 2, bw, bh, 13);
      ctx.fillStyle = '#fffbeb';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(px - bw / 2 + 11, py, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, px + 5, py + 0.5);
      ctx.restore();
    }
  }

  function exportToPng(room, items, openings, notes, analysis, layoutName) {
    const { Geometry, Catalog } = global.RoomLayout;
    const openingList = Array.isArray(openings) ? openings : [];

    const logicalW = 1100;
    const headerH = 92;
    const footerH = 66;
    const padX = 110;
    const padTop = 64;
    const padBottom = 46;

    const availW = logicalW - padX * 2;
    const maxCanvasRoomH = 640;
    const scale = Math.min(availW / room.w, maxCanvasRoomH / room.d);
    const roomPxW = room.w * scale;
    const roomPxD = room.d * scale;

    const logicalH = Math.max(540, Math.ceil(headerH + padTop + roomPxD + padBottom + footerH));
    const dpr = 2;

    const canvas = document.createElement('canvas');
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 背景
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, logicalW, logicalH);

    // 2. 页眉
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalW, headerH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(logicalW, headerH);
    ctx.stroke();

    const cleanTitle = layoutName && String(layoutName).trim()
      ? `简排 · ${String(layoutName).trim()}布局方案`
      : '简排 · 家装空间布局方案';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanTitle, 36, 34);

    const areaM2 = ((room.w * room.d) / 10000).toFixed(2);
    const occPct = Math.round(analysis.coverageRatio * 100);
    const doorSuffix = openingList.length > 0 ? ` · ${openingList.length}处门口` : '';
    ctx.fillStyle = '#475569';
    ctx.font = `500 13.5px ${FONT_FAMILY}`;
    ctx.fillText(
      `房间规格：长 ${formatMeters(room.w)}m × 宽 ${formatMeters(room.d)}m × 层高 ${formatMeters(room.h)}m   |   面积 ${areaM2}㎡   |   家具占地 ${occPct}% (${items.length}件${doorSuffix})`,
      36,
      64
    );

    // 右侧状态徽章
    const warnCount = analysis.warnings.length;
    const badgeText = warnCount === 0 ? '布局可行 · 无间距或空间异常' : `发现 ${warnCount} 项空间/间距预警`;
    ctx.font = `600 13px ${FONT_FAMILY}`;
    const bw = ctx.measureText(badgeText).width + 28;
    const bx = logicalW - 36 - bw;
    ctx.beginPath();
    ctx.roundRect(bx, 30, bw, 32, 16);
    ctx.fillStyle = warnCount === 0 ? '#ecfdf5' : '#fef2f2';
    ctx.fill();
    ctx.strokeStyle = warnCount === 0 ? '#6ee7b7' : '#fca5a5';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = warnCount === 0 ? '#047857' : '#b91c1c';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, bx + bw / 2, 46);

    // 3. 房间画布
    const originX = (logicalW - roomPxW) / 2;
    const originY = headerH + padTop;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(originX, originY, roomPxW, roomPxD);

    ctx.save();
    ctx.beginPath();
    ctx.rect(originX, originY, roomPxW, roomPxD);
    ctx.clip();
    for (let x = 50; x < room.w; x += 50) {
      const px = originX + x * scale;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, originY);
      ctx.lineTo(px, originY + roomPxD);
      ctx.stroke();
    }
    for (let y = 50; y < room.d; y += 50) {
      const py = originY + y * scale;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, py);
      ctx.lineTo(originX + roomPxW, py);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(originX, originY, roomPxW, roomPxD);

    // 外尺寸标注
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    const topY = originY - 24;
    ctx.beginPath();
    ctx.moveTo(originX, originY - 6);
    ctx.lineTo(originX, topY - 6);
    ctx.moveTo(originX + roomPxW, originY - 6);
    ctx.lineTo(originX + roomPxW, topY - 6);
    ctx.moveTo(originX, topY);
    ctx.lineTo(originX + roomPxW, topY);
    ctx.stroke();

    const topLabel = `${formatMeters(room.w)}m (${room.w}cm)`;
    ctx.font = `600 13px ${FONT_FAMILY}`;
    const tlW = ctx.measureText(topLabel).width + 16;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(originX + roomPxW / 2 - tlW / 2, topY - 11, tlW, 22);
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topLabel, originX + roomPxW / 2, topY);

    const leftX = originX - 28;
    ctx.beginPath();
    ctx.moveTo(originX - 6, originY);
    ctx.lineTo(leftX - 6, originY);
    ctx.moveTo(originX - 6, originY + roomPxD);
    ctx.lineTo(leftX - 6, originY + roomPxD);
    ctx.moveTo(leftX, originY);
    ctx.lineTo(leftX, originY + roomPxD);
    ctx.stroke();

    const leftLabel = `${formatMeters(room.d)}m (${room.d}cm)`;
    const llW = ctx.measureText(leftLabel).width + 16;
    ctx.save();
    ctx.translate(leftX, originY + roomPxD / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-llW / 2, -11, llW, 22);
    ctx.fillStyle = '#1e293b';
    ctx.fillText(leftLabel, 0, 0);
    ctx.restore();
    ctx.restore();

    // 墙边门口
    drawOpeningsCanvas(ctx, openingList, room, originX, originY, scale, analysis);

    // 4. 家具绘制
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
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

      const fill = cat ? cat.fill : '#f1f5f9';
      const stroke = hasSevere ? '#dc2626' : hasNarrowOnly ? '#ea580c' : cat ? cat.stroke : '#475569';

      ctx.save();
      ctx.translate(pxX + pxW / 2, pxY + pxD / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-rawPxW / 2, -rawPxD / 2);
      if (cat && cat.drawCanvas) {
        cat.drawCanvas(ctx, rawPxW, rawPxD, fill, stroke);
      } else {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.fillRect(0.75, 0.75, Math.max(1, rawPxW - 1.5), Math.max(1, rawPxD - 1.5));
        ctx.strokeRect(0.75, 0.75, Math.max(1, rawPxW - 1.5), Math.max(1, rawPxD - 1.5));
      }
      ctx.restore();

      if (hasSevere) {
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.2;
        ctx.fillRect(pxX, pxY, pxW, pxD);
        ctx.strokeRect(pxX, pxY, pxW, pxD);

        const badgeTexts = [];
        if (issues.has('out_of_bounds')) badgeTexts.push('超界');
        if (issues.has('overlap')) badgeTexts.push('重叠');
        if (issues.has('height_exceeded')) badgeTexts.push('超高');
        const bt = badgeTexts.join('·');
        ctx.font = `700 10.5px ${FONT_FAMILY}`;
        const btw = Math.max(32, ctx.measureText(bt).width + 12);
        const btx = Math.max(pxX + 2, pxX + pxW - btw - 4);
        ctx.beginPath();
        ctx.roundRect(btx, pxY + 4, btw, 18, 9);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bt, btx + btw / 2, pxY + 13);
        ctx.restore();
      } else if (hasNarrowOnly) {
        ctx.save();
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(pxX - 1, pxY - 1, pxW + 2, pxD + 2);
        ctx.restore();
      }

      // 水平居中标签
      const minDim = Math.min(pxW, pxD);
      const maxDim = Math.max(pxW, pxD);
      if (pxW >= 26 && pxD >= 20) {
        ctx.save();
        const nameSize = minDim < 44 ? 10 : minDim < 68 ? 12 : 13.5;
        const sizeSize = minDim < 44 ? 9 : 11;
        const dimStr = `${item.w}×${item.d}cm`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (pxD >= 36 && pxW >= 44) {
          ctx.font = `600 ${nameSize}px ${FONT_FAMILY}`;
          const nw = ctx.measureText(item.name).width;
          ctx.font = `500 ${sizeSize}px ${FONT_FAMILY}`;
          const dw = ctx.measureText(dimStr).width;
          const bgW = Math.min(pxW - 6, Math.max(nw, dw) + 12);
          const bgH = nameSize + sizeSize + 12;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
          ctx.beginPath();
          ctx.roundRect(pxX + pxW / 2 - bgW / 2, pxY + pxD / 2 - bgH / 2, bgW, bgH, 4);
          ctx.fill();

          ctx.fillStyle = hasSevere ? '#991b1b' : '#1e293b';
          ctx.font = `600 ${nameSize}px ${FONT_FAMILY}`;
          ctx.fillText(item.name, pxX + pxW / 2, pxY + pxD / 2 - sizeSize * 0.58);

          ctx.fillStyle = hasSevere ? '#b91c1c' : '#475569';
          ctx.font = `500 ${sizeSize}px ${FONT_FAMILY}`;
          ctx.fillText(dimStr, pxX + pxW / 2, pxY + pxD / 2 + nameSize * 0.58);
        } else {
          ctx.fillStyle = hasSevere ? '#991b1b' : '#1e293b';
          ctx.font = `600 ${nameSize}px ${FONT_FAMILY}`;
          ctx.fillText(item.name, pxX + pxW / 2, pxY + pxD / 2);
        }
        ctx.restore();
      } else if (maxDim >= 26) {
        ctx.save();
        const compactStr = `${item.name} ${item.w}×${item.d}cm`;
        ctx.font = `600 10.5px ${FONT_FAMILY}`;
        const pw = Math.max(62, ctx.measureText(compactStr).width + 14);
        ctx.beginPath();
        ctx.roundRect(pxX + pxW / 2 - pw / 2, pxY + pxD / 2 - 9.5, pw, 19, 9.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = hasSevere ? '#991b1b' : '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(compactStr, pxX + pxW / 2, pxY + pxD / 2 + 0.5);
        ctx.restore();
      }

      const itemNote = typeof item.note === 'string' ? item.note.trim() : '';
      if (itemNote) {
        ctx.save();
        ctx.font = `600 11px ${FONT_FAMILY}`;
        const nw = Math.max(48, ctx.measureText(itemNote).width + 16);
        const ny = pxY + pxD + 8;
        ctx.beginPath();
        ctx.roundRect(pxX + pxW / 2 - nw / 2, ny, nw, 20, 10);
        ctx.fillStyle = '#fffbeb';
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = '#92400e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(itemNote, pxX + pxW / 2, ny + 10.5);
        ctx.restore();
      }
    }

    // 5. 间距标注 & 自由文字备注
    for (let i = 0; i < analysis.narrowLines.length; i++) {
      const c = analysis.narrowLines[i];
      drawDimensionLineCanvas(
        ctx,
        originX + c.x1 * scale,
        originY + c.y1 * scale,
        originX + c.x2 * scale,
        originY + c.y2 * scale,
        `${Math.round(c.gap)}cm`,
        true
      );
    }

    drawNotesCanvas(ctx, notes, originX, originY, scale);

    // 6. 页脚图例
    const footerY = logicalH - footerH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, footerY, logicalW, footerH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(logicalW, footerY);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = `500 12.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      '图例说明：绿线 ≥60cm 通行舒适  ·  红线 <60cm 过道过窄  ·  红框斜纹 = 超界 / 重叠 / 超高  ·  贴墙 ≤2cm 正常不报警',
      36,
      footerY + footerH / 2
    );

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`生成时间：${stamp}`, logicalW - 36, footerY + footerH / 2);

    const safeName = layoutName && String(layoutName).trim()
      ? `_${String(layoutName).trim().replace(/[\\/:*?"<>|]/g, '')}`
      : '';
    const filename = `家装布局${safeName}_${formatMeters(room.w)}x${formatMeters(room.d)}m.png`;
    return new Promise((resolve) => {
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            triggerDownload(url, filename, () => URL.revokeObjectURL(url));
          } else {
            triggerDownload(canvas.toDataURL('image/png'), filename);
          }
          resolve(filename);
        }, 'image/png');
      } else {
        triggerDownload(canvas.toDataURL('image/png'), filename);
        resolve(filename);
      }
    });
  }

  function triggerDownload(url, filename, cleanup) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (cleanup) {
      setTimeout(cleanup, 1500);
    }
  }

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Exporter = {
    exportToPng
  };
})(typeof window !== 'undefined' ? window : globalThis);
