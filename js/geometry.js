/**
 * 纯几何计算与空间可行性预警引擎
 * 统一使用厘米 (cm) 坐标系：左上角 (0, 0) 到 (room.w, room.d)
 */
(function (global) {
  'use strict';

  const MIN_PASSAGE_CM = 60;      // 通行过道/间距过窄阈值 (<60cm 标红)
  const FLUSH_TOLERANCE_CM = 2;   // 贴墙/紧靠相邻家具容差 (<=2cm 视为贴合，不误报过窄)
  const OVERLAP_EPS_CM = 0.5;     // 接触容差 (<=0.5cm 视为刚好贴齐而非重叠)
  const SNAP_THRESHOLD_CM = 8;    // 拖拽磁吸阈值

  /**
   * 获取家具旋转后的外接矩形（cm）
   */
  function getFootprint(item) {
    const rot = (((item.rotation || 0) % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    const w = swapped ? item.d : item.w;
    const d = swapped ? item.w : item.d;
    return {
      x: item.x,
      y: item.y,
      w: w,
      d: d,
      right: item.x + w,
      bottom: item.y + d,
      cx: item.x + w / 2,
      cy: item.y + d / 2
    };
  }

  /**
   * 拖拽磁吸计算：优先吸附房间四墙与相邻家具的四边对齐/贴合
   */
  function snapPosition(movingItem, targetX, targetY, room, others, disableSnap) {
    if (disableSnap) {
      return { x: Math.round(targetX), y: Math.round(targetY) };
    }

    const fp = getFootprint({ ...movingItem, x: targetX, y: targetY });
    const w = fp.w;
    const d = fp.d;

    const candidatesX = [0, room.w - w];
    const candidatesY = [0, room.d - d];

    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o.id === movingItem.id) continue;
      const ofp = getFootprint(o);
      candidatesX.push(ofp.right, ofp.x - w, ofp.x, ofp.right - w);
      candidatesY.push(ofp.bottom, ofp.y - d, ofp.y, ofp.bottom - d);
    }

    let bestX = targetX;
    let bestDistX = SNAP_THRESHOLD_CM + 0.001;
    for (let i = 0; i < candidatesX.length; i++) {
      const dist = Math.abs(targetX - candidatesX[i]);
      if (dist < bestDistX) {
        bestDistX = dist;
        bestX = candidatesX[i];
      }
    }

    let bestY = targetY;
    let bestDistY = SNAP_THRESHOLD_CM + 0.001;
    for (let i = 0; i < candidatesY.length; i++) {
      const dist = Math.abs(targetY - candidatesY[i]);
      if (dist < bestDistY) {
        bestDistY = dist;
        bestY = candidatesY[i];
      }
    }

    return {
      x: Math.round(bestX),
      y: Math.round(bestY)
    };
  }

  function classifyGap(gap) {
    if (gap <= FLUSH_TOLERANCE_CM) return 'flush';
    if (gap < MIN_PASSAGE_CM) return 'narrow';
    return 'ok';
  }

  /**
   * 计算单个家具上、下、左、右四个方向的净距（到墙体或直接相邻家具）
   * 若在该方向已越界或与障碍物发生面积重叠，则返回 null（交由越界/重叠预警处理）
   */
  function measureClearances(item, room, others) {
    const fp = getFootprint(item);
    const results = [];

    // 1. LEFT: 向左测距
    if (fp.x >= -OVERLAP_EPS_CM) {
      let blockedByOverlap = false;
      let bestX = 0;
      let targetType = 'wall';
      let targetId = 'wall-left';
      let targetName = '左墙';
      let segStart = Math.max(0, fp.y);
      let segEnd = Math.min(room.d, fp.bottom);

      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.id === item.id) continue;
        const ofp = getFootprint(o);
        const yOverlap = Math.min(fp.bottom, ofp.bottom) - Math.max(fp.y, ofp.y);
        if (yOverlap <= OVERLAP_EPS_CM) continue;

        if (ofp.x < fp.x + OVERLAP_EPS_CM && ofp.right > fp.x + OVERLAP_EPS_CM) {
          blockedByOverlap = true;
          break;
        }
        if (ofp.right <= fp.x + OVERLAP_EPS_CM && ofp.right > bestX) {
          bestX = ofp.right;
          targetType = 'item';
          targetId = o.id;
          targetName = o.name;
          segStart = Math.max(fp.y, ofp.y);
          segEnd = Math.min(fp.bottom, ofp.bottom);
        }
      }

      if (!blockedByOverlap && fp.x <= room.w + OVERLAP_EPS_CM) {
        const gap = Math.max(0, Math.round((fp.x - bestX) * 10) / 10);
        const midY = segEnd > segStart ? (segStart + segEnd) / 2 : fp.cy;
        results.push({
          dir: 'left',
          gap: gap,
          x1: bestX,
          y1: midY,
          x2: fp.x,
          y2: midY,
          targetType: targetType,
          targetId: targetId,
          targetName: targetName,
          status: classifyGap(gap)
        });
      }
    }

    // 2. RIGHT: 向右测距
    if (fp.right <= room.w + OVERLAP_EPS_CM) {
      let blockedByOverlap = false;
      let bestX = room.w;
      let targetType = 'wall';
      let targetId = 'wall-right';
      let targetName = '右墙';
      let segStart = Math.max(0, fp.y);
      let segEnd = Math.min(room.d, fp.bottom);

      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.id === item.id) continue;
        const ofp = getFootprint(o);
        const yOverlap = Math.min(fp.bottom, ofp.bottom) - Math.max(fp.y, ofp.y);
        if (yOverlap <= OVERLAP_EPS_CM) continue;

        if (ofp.x < fp.right - OVERLAP_EPS_CM && ofp.right > fp.right - OVERLAP_EPS_CM) {
          blockedByOverlap = true;
          break;
        }
        if (ofp.x >= fp.right - OVERLAP_EPS_CM && ofp.x < bestX) {
          bestX = ofp.x;
          targetType = 'item';
          targetId = o.id;
          targetName = o.name;
          segStart = Math.max(fp.y, ofp.y);
          segEnd = Math.min(fp.bottom, ofp.bottom);
        }
      }

      if (!blockedByOverlap && fp.right >= -OVERLAP_EPS_CM) {
        const gap = Math.max(0, Math.round((bestX - fp.right) * 10) / 10);
        const midY = segEnd > segStart ? (segStart + segEnd) / 2 : fp.cy;
        results.push({
          dir: 'right',
          gap: gap,
          x1: fp.right,
          y1: midY,
          x2: bestX,
          y2: midY,
          targetType: targetType,
          targetId: targetId,
          targetName: targetName,
          status: classifyGap(gap)
        });
      }
    }

    // 3. TOP: 向上测距
    if (fp.y >= -OVERLAP_EPS_CM) {
      let blockedByOverlap = false;
      let bestY = 0;
      let targetType = 'wall';
      let targetId = 'wall-top';
      let targetName = '上墙';
      let segStart = Math.max(0, fp.x);
      let segEnd = Math.min(room.w, fp.right);

      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.id === item.id) continue;
        const ofp = getFootprint(o);
        const xOverlap = Math.min(fp.right, ofp.right) - Math.max(fp.x, ofp.x);
        if (xOverlap <= OVERLAP_EPS_CM) continue;

        if (ofp.y < fp.y + OVERLAP_EPS_CM && ofp.bottom > fp.y + OVERLAP_EPS_CM) {
          blockedByOverlap = true;
          break;
        }
        if (ofp.bottom <= fp.y + OVERLAP_EPS_CM && ofp.bottom > bestY) {
          bestY = ofp.bottom;
          targetType = 'item';
          targetId = o.id;
          targetName = o.name;
          segStart = Math.max(fp.x, ofp.x);
          segEnd = Math.min(fp.right, ofp.right);
        }
      }

      if (!blockedByOverlap && fp.y <= room.d + OVERLAP_EPS_CM) {
        const gap = Math.max(0, Math.round((fp.y - bestY) * 10) / 10);
        const midX = segEnd > segStart ? (segStart + segEnd) / 2 : fp.cx;
        results.push({
          dir: 'top',
          gap: gap,
          x1: midX,
          y1: bestY,
          x2: midX,
          y2: fp.y,
          targetType: targetType,
          targetId: targetId,
          targetName: targetName,
          status: classifyGap(gap)
        });
      }
    }

    // 4. BOTTOM: 向下测距
    if (fp.bottom <= room.d + OVERLAP_EPS_CM) {
      let blockedByOverlap = false;
      let bestY = room.d;
      let targetType = 'wall';
      let targetId = 'wall-bottom';
      let targetName = '下墙';
      let segStart = Math.max(0, fp.x);
      let segEnd = Math.min(room.w, fp.right);

      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.id === item.id) continue;
        const ofp = getFootprint(o);
        const xOverlap = Math.min(fp.right, ofp.right) - Math.max(fp.x, ofp.x);
        if (xOverlap <= OVERLAP_EPS_CM) continue;

        if (ofp.y < fp.bottom - OVERLAP_EPS_CM && ofp.bottom > fp.bottom - OVERLAP_EPS_CM) {
          blockedByOverlap = true;
          break;
        }
        if (ofp.y >= fp.bottom - OVERLAP_EPS_CM && ofp.y < bestY) {
          bestY = ofp.y;
          targetType = 'item';
          targetId = o.id;
          targetName = o.name;
          segStart = Math.max(fp.x, ofp.x);
          segEnd = Math.min(fp.right, ofp.right);
        }
      }

      if (!blockedByOverlap && fp.bottom >= -OVERLAP_EPS_CM) {
        const gap = Math.max(0, Math.round((bestY - fp.bottom) * 10) / 10);
        const midX = segEnd > segStart ? (segStart + segEnd) / 2 : fp.cx;
        results.push({
          dir: 'bottom',
          gap: gap,
          x1: midX,
          y1: fp.bottom,
          x2: midX,
          y2: bestY,
          targetType: targetType,
          targetId: targetId,
          targetName: targetName,
          status: classifyGap(gap)
        });
      }
    }

    return results;
  }

  /**
   * 墙边门口/洞口几何计算：返回在房间边缘的起止坐标及内开扫掠区矩形
   */
  function getOpeningGeometry(opening, room) {
    const wallLen = opening.wall === 'top' || opening.wall === 'bottom' ? room.w : room.d;
    const width = Math.max(30, Math.min(opening.width || 80, wallLen));
    const offset = Math.max(0, Math.min(opening.offset || 0, wallLen - width));
    const swing = opening.swing === 'out' || opening.swing === 'none' ? opening.swing : 'in';
    const hinge = opening.hinge === 'end' ? 'end' : 'start';

    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    let hingeX = 0;
    let hingeY = 0;
    let swingBox = null;

    if (opening.wall === 'top') {
      x1 = offset;
      y1 = 0;
      x2 = offset + width;
      y2 = 0;
      hingeX = hinge === 'start' ? x1 : x2;
      hingeY = 0;
      if (swing === 'in') {
        swingBox = { x: x1, y: 0, w: width, d: width, right: x2, bottom: width };
      }
    } else if (opening.wall === 'bottom') {
      x1 = offset;
      y1 = room.d;
      x2 = offset + width;
      y2 = room.d;
      hingeX = hinge === 'start' ? x1 : x2;
      hingeY = room.d;
      if (swing === 'in') {
        swingBox = { x: x1, y: room.d - width, w: width, d: width, right: x2, bottom: room.d };
      }
    } else if (opening.wall === 'left') {
      x1 = 0;
      y1 = offset;
      x2 = 0;
      y2 = offset + width;
      hingeX = 0;
      hingeY = hinge === 'start' ? y1 : y2;
      if (swing === 'in') {
        swingBox = { x: 0, y: y1, w: width, d: width, right: width, bottom: y2 };
      }
    } else {
      x1 = room.w;
      y1 = offset;
      x2 = room.w;
      y2 = offset + width;
      hingeX = room.w;
      hingeY = hinge === 'start' ? y1 : y2;
      if (swing === 'in') {
        swingBox = { x: room.w - width, y: y1, w: width, d: width, right: room.w, bottom: y2 };
      }
    }

    return {
      wall: opening.wall,
      offset,
      width,
      swing,
      hinge,
      x1,
      y1,
      x2,
      y2,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      hingeX,
      hingeY,
      swingBox
    };
  }

  /**
   * 拖拽或放置墙边门口时，自动吸附到距离指针最近的房间墙面并沿墙体对齐
   */
  function snapOpeningToWall(cmX, cmY, width, room, disableSnap) {
    const dists = [
      { wall: 'top', dist: Math.abs(cmY) },
      { wall: 'bottom', dist: Math.abs(room.d - cmY) },
      { wall: 'left', dist: Math.abs(cmX) },
      { wall: 'right', dist: Math.abs(room.w - cmX) }
    ];
    dists.sort((a, b) => a.dist - b.dist);
    const wall = dists[0].wall;
    const wallLen = wall === 'top' || wall === 'bottom' ? room.w : room.d;
    const clampedW = Math.min(width, wallLen);
    const rawCenter = wall === 'top' || wall === 'bottom' ? cmX : cmY;
    let offset = rawCenter - clampedW / 2;

    if (!disableSnap) {
      if (Math.abs(offset) <= SNAP_THRESHOLD_CM) offset = 0;
      else if (Math.abs(wallLen - clampedW - offset) <= SNAP_THRESHOLD_CM) offset = wallLen - clampedW;
      else offset = Math.round(offset / 5) * 5;
    } else {
      offset = Math.round(offset);
    }

    offset = Math.max(0, Math.min(Math.round(wallLen - clampedW), Math.round(offset)));
    return { wall, offset };
  }

  /**
   * 检查内开门口扇区是否与家具发生实质干涉
   */
  function doesOpeningSwingHitItem(openingGeom, itemFp) {
    if (!openingGeom.swingBox) return false;
    const box = openingGeom.swingBox;
    const ix1 = Math.max(itemFp.x, box.x);
    const iy1 = Math.max(itemFp.y, box.y);
    const ix2 = Math.min(itemFp.right, box.right);
    const iy2 = Math.min(itemFp.bottom, box.bottom);
    if (ix2 - ix1 <= OVERLAP_EPS_CM || iy2 - iy1 <= OVERLAP_EPS_CM) return false;

    const closestX = Math.max(ix1, Math.min(openingGeom.hingeX, ix2));
    const closestY = Math.max(iy1, Math.min(openingGeom.hingeY, iy2));
    const dist = Math.hypot(closestX - openingGeom.hingeX, closestY - openingGeom.hingeY);
    return dist < openingGeom.width - OVERLAP_EPS_CM;
  }

  /**
   * 为新添加的门口标记寻找合适墙边位置（优先下墙居中，尽量避开已有门口）
   */
  function findSmartOpeningPosition(width, room, existingOpenings) {
    const candidates = [
      { wall: 'bottom', len: room.w },
      { wall: 'left', len: room.d },
      { wall: 'right', len: room.d },
      { wall: 'top', len: room.w }
    ];
    const list = existingOpenings || [];

    for (let wi = 0; wi < candidates.length; wi++) {
      const c = candidates[wi];
      const w = Math.min(width, c.len);
      const maxOff = Math.max(0, Math.floor(c.len - w));
      const tryOffsets = [Math.round(maxOff / 2)];
      for (let off = 10; off <= maxOff; off += 20) tryOffsets.push(off);
      tryOffsets.push(0, maxOff);

      for (let oi = 0; oi < tryOffsets.length; oi++) {
        const off = Math.max(0, Math.min(maxOff, tryOffsets[oi]));
        const overlapsExisting = list.some(
          (op) =>
            op.wall === c.wall &&
            Math.min(off + w, op.offset + op.width) - Math.max(off, op.offset) > OVERLAP_EPS_CM
        );
        if (!overlapsExisting) {
          return { wall: c.wall, offset: off };
        }
      }
    }

    return {
      wall: 'bottom',
      offset: Math.max(0, Math.round((room.w - Math.min(width, room.w)) / 2))
    };
  }

  /**
   * 全局布局合规分析：超界、超高、重叠、过窄间距、内开门扇碰撞、占地比例
   */
  function analyzeLayout(room, items, openings) {
    const warnings = [];
    const itemIssues = new Map();
    const openingIssues = new Map();
    const narrowLines = [];
    const seenPairs = new Set();
    const seenNarrowKeys = new Set();
    const openingList = Array.isArray(openings) ? openings : [];

    function addIssue(itemId, issueType) {
      if (!itemIssues.has(itemId)) {
        itemIssues.set(itemId, new Set());
      }
      itemIssues.get(itemId).add(issueType);
    }

    let totalFootprintArea = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const fp = getFootprint(item);
      totalFootprintArea += fp.w * fp.d;

      // 1. 越界 / 超大尺寸检测
      if (
        fp.x < -OVERLAP_EPS_CM ||
        fp.y < -OVERLAP_EPS_CM ||
        fp.right > room.w + OVERLAP_EPS_CM ||
        fp.bottom > room.d + OVERLAP_EPS_CM
      ) {
        addIssue(item.id, 'out_of_bounds');
        warnings.push({
          type: 'out_of_bounds',
          itemIds: [item.id],
          message: `${item.name} 超出房间墙体范围`
        });
      }

      // 2. 层高不足检测
      if (item.h > room.h) {
        addIssue(item.id, 'height_exceeded');
        warnings.push({
          type: 'height_exceeded',
          itemIds: [item.id],
          message: `${item.name} 高 ${item.h}cm 超过层高 ${room.h}cm`
        });
      }
    }

    // 3. 家具间面积重叠检测
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const fpA = getFootprint(a);
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const fpB = getFootprint(b);
        const overlapX = Math.min(fpA.right, fpB.right) - Math.max(fpA.x, fpB.x);
        const overlapY = Math.min(fpA.bottom, fpB.bottom) - Math.max(fpA.y, fpB.y);
        if (overlapX > OVERLAP_EPS_CM && overlapY > OVERLAP_EPS_CM) {
          const pairKey = [a.id, b.id].sort().join('|');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            addIssue(a.id, 'overlap');
            addIssue(b.id, 'overlap');
            warnings.push({
              type: 'overlap',
              itemIds: [a.id, b.id],
              message: `${a.name} 与 ${b.name} 空间重叠`
            });
          }
        }
      }
    }

    // 4. 间距过窄检测 (2 < gap < 60cm)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const clearances = measureClearances(item, room, items);
      for (let cIdx = 0; cIdx < clearances.length; cIdx++) {
        const c = clearances[cIdx];
        if (c.status !== 'narrow') continue;

        let dedupKey;
        if (c.targetType === 'wall') {
          dedupKey = `wall:${item.id}:${c.dir}`;
        } else {
          const axis = c.dir === 'left' || c.dir === 'right' ? 'h' : 'v';
          dedupKey = `item:${[item.id, c.targetId].sort().join('|')}:${axis}`;
        }

        if (seenNarrowKeys.has(dedupKey)) continue;
        seenNarrowKeys.add(dedupKey);

        addIssue(item.id, 'narrow_gap');
        if (c.targetType === 'item') {
          addIssue(c.targetId, 'narrow_gap');
        }

        const gapRounded = Math.round(c.gap);
        narrowLines.push({
          ...c,
          sourceId: item.id
        });
        warnings.push({
          type: 'narrow_gap',
          itemIds: c.targetType === 'item' ? [item.id, c.targetId] : [item.id],
          gap: gapRounded,
          message:
            c.targetType === 'wall'
              ? `${item.name} 距${c.targetName}仅 ${gapRounded}cm（建议 ≥${MIN_PASSAGE_CM}cm）`
              : `${item.name} 与 ${c.targetName} 间距仅 ${gapRounded}cm（建议 ≥${MIN_PASSAGE_CM}cm）`
        });
      }
    }

    // 5. 墙边内开门口开启扇区碰撞检测
    for (let i = 0; i < openingList.length; i++) {
      const op = openingList[i];
      const geom = getOpeningGeometry(op, room);
      if (geom.swing !== 'in') continue;
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const fp = getFootprint(it);
        if (doesOpeningSwingHitItem(geom, fp)) {
          if (!openingIssues.has(op.id)) openingIssues.set(op.id, new Set());
          openingIssues.get(op.id).add('door_blocked');
          addIssue(it.id, 'door_blocked');
          warnings.push({
            type: 'door_blocked',
            itemIds: [it.id],
            openingIds: [op.id],
            message: `${op.name || '门口'} 开启扇区被 ${it.name} 遮挡`
          });
        }
      }
    }

    const roomArea = Math.max(1, room.w * room.d);
    const coverageRatio = totalFootprintArea / roomArea;

    return {
      warnings,
      itemIssues,
      openingIssues,
      narrowLines,
      coverageRatio
    };
  }

  /**
   * 点击家具图标一键添加时，自动寻找房间内不重叠的空位；若空间已满则居中放置以便触发空间预警
   */
  function findSmartPlacePosition(w, d, room, others) {
    const maxX = Math.floor(room.w - w);
    const maxY = Math.floor(room.d - d);

    if (maxX >= 0 && maxY >= 0) {
      const step = 15;
      // 优先尝试四周墙角与靠墙位置，再扫描网格
      const yCandidates = [];
      for (let y = 0; y <= maxY; y += step) yCandidates.push(y);
      if (yCandidates[yCandidates.length - 1] !== maxY) yCandidates.push(maxY);

      const xCandidates = [];
      for (let x = 0; x <= maxX; x += step) xCandidates.push(x);
      if (xCandidates[xCandidates.length - 1] !== maxX) xCandidates.push(maxX);

      for (let yi = 0; yi < yCandidates.length; yi++) {
        for (let xi = 0; xi < xCandidates.length; xi++) {
          const cx = xCandidates[xi];
          const cy = yCandidates[yi];
          let collides = false;
          for (let i = 0; i < others.length; i++) {
            const ofp = getFootprint(others[i]);
            const ox = Math.min(cx + w, ofp.right) - Math.max(cx, ofp.x);
            const oy = Math.min(cy + d, ofp.bottom) - Math.max(cy, ofp.y);
            if (ox > OVERLAP_EPS_CM && oy > OVERLAP_EPS_CM) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            return { x: cx, y: cy };
          }
        }
      }
    }

    return {
      x: Math.round((room.w - w) / 2),
      y: Math.round((room.d - d) / 2)
    };
  }

  const Geometry = {
    MIN_PASSAGE_CM,
    FLUSH_TOLERANCE_CM,
    OVERLAP_EPS_CM,
    SNAP_THRESHOLD_CM,
    getFootprint,
    snapPosition,
    measureClearances,
    getOpeningGeometry,
    snapOpeningToWall,
    doesOpeningSwingHitItem,
    findSmartOpeningPosition,
    analyzeLayout,
    findSmartPlacePosition
  };

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Geometry = Geometry;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Geometry;
  }
})(typeof window !== 'undefined' ? window : globalThis);
