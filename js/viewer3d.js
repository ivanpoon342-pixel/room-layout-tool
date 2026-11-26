/**
 * 零依赖纯前端 3D 立体建筑白模渲染器（Canvas 2D 透视投影 + 智能前墙避让 + 门洞/屏风/花洒立体建模）
 */
(function (global) {
  'use strict';

  const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function createCamera() {
    return {
      yaw: -0.68,
      pitch: 0.58,
      zoom: 1.0
    };
  }

  /**
   * 构建相机投影器：输入房间坐标 (x: 0..room.w, y: 0..room.d, z: 0..room.h)
   */
  function createProjector(room, camera, width, height) {
    const halfW = room.w / 2;
    const halfD = room.d / 2;
    const centerZ = room.h * 0.36;
    const maxSpan = Math.max(room.w, room.d, room.h, 240);
    const dist = maxSpan * 2.65;
    const focal = maxSpan * 2.4;

    const cosY = Math.cos(camera.yaw);
    const sinY = Math.sin(camera.yaw);
    const cosP = Math.cos(camera.pitch);
    const sinP = Math.sin(camera.pitch);

    const camWx = dist * cosP * sinY;
    const camWy = dist * cosP * cosY;
    const camWz = centerZ + dist * sinP;

    const baseScale = (Math.min(width, height) * 0.88) / maxSpan;
    const scale = baseScale * camera.zoom;
    const cx = width / 2;
    const cy = height * 0.54;

    function project(x, y, z) {
      const wx = x - halfW;
      const wy = y - halfD;
      const wz = z;

      const rx = wx * cosY - wy * sinY;
      const ry = wx * sinY + wy * cosY;
      const rz = wz - centerZ;

      const depth = dist - ry * cosP - rz * sinP;
      const persp = focal / Math.max(120, depth);
      const upProj = rz * cosP - ry * sinP;

      return {
        sx: cx + rx * persp * scale,
        sy: cy - upProj * persp * scale,
        depth
      };
    }

    function distToCam(x, y, z) {
      const wx = x - halfW;
      const wy = y - halfD;
      return Math.hypot(camWx - wx, camWy - wy, camWz - z);
    }

    return { project, distToCam, camWx, camWy, camWz, halfW, halfD };
  }

  function fillQuad(ctx, pts, fillStyle, strokeStyle, lineWidth, alpha) {
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 构造朝向旋转后的 3D 长方体（支持任意角度与局部子块定位）
   */
  function buildOrientedBoxFaces(itemCx, itemCy, itemRotRad, localCx, localCy, z0, bw, bd, bh, colors, alpha) {
    const cosR = Math.cos(itemRotRad);
    const sinR = Math.sin(itemRotRad);
    const hw = bw / 2;
    const hd = bd / 2;

    function toWorld(lx, ly, lz) {
      const gx = itemCx + (localCx + lx) * cosR - (localCy + ly) * sinR;
      const gy = itemCy + (localCx + lx) * sinR + (localCy + ly) * cosR;
      return [gx, gy, lz];
    }

    const z1 = z0 + bh;
    const p000 = toWorld(-hw, -hd, z0);
    const p100 = toWorld(hw, -hd, z0);
    const p110 = toWorld(hw, hd, z0);
    const p010 = toWorld(-hw, hd, z0);

    const p001 = toWorld(-hw, -hd, z1);
    const p101 = toWorld(hw, -hd, z1);
    const p111 = toWorld(hw, hd, z1);
    const p011 = toWorld(-hw, hd, z1);

    function rotNormal(nx, ny, nz) {
      return [nx * cosR - ny * sinR, nx * sinR + ny * cosR, nz];
    }

    return {
      centerWorld: toWorld(0, 0, (z0 + z1) / 2),
      alpha: alpha === undefined ? 1 : alpha,
      colors,
      faces: [
        { verts: [p001, p101, p111, p011], normal: [0, 0, 1], shade: 'top' },
        { verts: [p000, p100, p101, p001], normal: rotNormal(0, -1, 0), shade: 'sideA' },
        { verts: [p110, p010, p011, p111], normal: rotNormal(0, 1, 0), shade: 'sideA' },
        { verts: [p010, p000, p001, p011], normal: rotNormal(-1, 0, 0), shade: 'sideB' },
        { verts: [p100, p110, p111, p101], normal: rotNormal(1, 0, 0), shade: 'sideB' }
      ]
    };
  }

  function renderBoxPrimitive(ctx, box, proj) {
    const { halfW, halfD, camWx, camWy, camWz, project } = proj;
    const isTransparent = box.alpha < 0.99;

    for (let i = 0; i < box.faces.length; i++) {
      const f = box.faces[i];
      // 面中心世界坐标
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let k = 0; k < f.verts.length; k++) {
        fx += f.verts[k][0];
        fy += f.verts[k][1];
        fz += f.verts[k][2];
      }
      fx = fx / 4 - halfW;
      fy = fy / 4 - halfD;
      fz = fz / 4;

      const dot = (camWx - fx) * f.normal[0] + (camWy - fy) * f.normal[1] + (camWz - fz) * f.normal[2];
      if (!isTransparent && dot <= 0) continue;

      const pts = f.verts.map((v) => project(v[0], v[1], v[2]));
      const fillColor = box.colors[f.shade] || box.colors.top;
      fillQuad(ctx, pts, fillColor, box.colors.stroke, 1.05, box.alpha);
    }
  }

  function getPaletteColors(catalogId, hasSevere, hasNarrow) {
    if (hasSevere) {
      return { top: '#fecaca', sideA: '#fca5a5', sideB: '#f87171', stroke: '#dc2626' };
    }
    if (hasNarrow) {
      return { top: '#ffedd5', sideA: '#fed7aa', sideB: '#fdba74', stroke: '#ea580c' };
    }
    if (catalogId === 'partition-screen' || catalogId === 'shower') {
      return { top: '#cffafe', sideA: '#a5f3fc', sideB: '#67e8f9', stroke: '#0e7490' };
    }
    if (catalogId === 'showerhead' || catalogId === 'toilet' || catalogId === 'bathroom-vanity' || catalogId === 'bathtub') {
      return { top: '#f0f9ff', sideA: '#e0f2fe', sideB: '#bae6fd', stroke: '#0284c7' };
    }
    if (catalogId && catalogId.startsWith('bed')) {
      return { top: '#eef2ff', sideA: '#e0e7ff', sideB: '#c7d2fe', stroke: '#4338ca' };
    }
    if (catalogId === 'sofa') {
      return { top: '#ecfdf5', sideA: '#d1fae5', sideB: '#a7f3d0', stroke: '#047857' };
    }
    if (catalogId === 'wardrobe' || catalogId === 'bookcase') {
      return { top: '#f5f0e6', sideA: '#e7decb', sideB: '#d6c7aa', stroke: '#785a3a' };
    }
    return { top: '#ffffff', sideA: '#f1f5f9', sideB: '#e2e8f0', stroke: '#475569' };
  }

  /**
   * 为每件家具生成精细的 3D 白模子盒子集合
   */
  function buildItemPrimitives(item, analysis) {
    const { Geometry } = global.RoomLayout;
    const fp = Geometry.getFootprint(item);
    const rotRad = ((((item.rotation || 0) % 360) + 360) % 360) * (Math.PI / 180);
    const issues = analysis.itemIssues.get(item.id);
    const hasSevere =
      issues && (issues.has('out_of_bounds') || issues.has('overlap') || issues.has('height_exceeded'));
    const hasNarrow = !hasSevere && issues && (issues.has('narrow_gap') || issues.has('door_blocked'));

    const c = getPaletteColors(item.catalogId, hasSevere, hasNarrow);
    const w = item.w;
    const d = item.d;
    const h = item.h;
    const boxes = [];

    if (item.catalogId && item.catalogId.startsWith('bed')) {
      const matH = Math.min(48, h * 0.52);
      const headD = Math.min(14, d * 0.08);
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, headD / 2, 0, w, d - headD, matH, c, 1));
      boxes.push(
        buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 2 + headD / 2, 0, w, headD, h, {
          top: c.sideA,
          sideA: c.sideB,
          sideB: c.sideB,
          stroke: c.stroke
        }, 1)
      );
    } else if (item.catalogId === 'sofa') {
      const seatH = Math.min(44, h * 0.52);
      const backD = Math.min(22, d * 0.25);
      const armW = Math.min(18, w * 0.1);
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, backD / 2, 0, w - armW * 2, d - backD, seatH, c, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 2 + backD / 2, 0, w, backD, h, c, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, -w / 2 + armW / 2, 0, 0, armW, d, seatH + 18, c, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, w / 2 - armW / 2, 0, 0, armW, d, seatH + 18, c, 1));
    } else if (item.catalogId === 'partition-screen') {
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, 0, 0, w, d, h, c, hasSevere ? 0.72 : 0.48));
    } else if (item.catalogId === 'shower') {
      const baseH = 10;
      const gThick = 4;
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, 0, 0, w, d, baseH, {
        top: '#ffffff', sideA: '#e2e8f0', sideB: '#cbd5e1', stroke: c.stroke
      }, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 2 + gThick / 2, baseH, w, gThick, h - baseH, c, 0.34));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, -w / 2 + gThick / 2, 0, baseH, gThick, d, h - baseH, c, 0.34));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, w / 2 - gThick / 2, 0, baseH, gThick, d, h - baseH, c, 0.34));
    } else if (item.catalogId === 'showerhead') {
      // 地面浅底盘 + 贴墙立柱 + 顶喷臂 + 花洒盘
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, 0, 0, w, d, 3, {
        top: '#ecfeff', sideA: '#cffafe', sideB: '#a5f3fc', stroke: c.stroke
      }, 0.55));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 2 + 5, 3, 5, 5, Math.max(40, h - 10), {
        top: '#94a3b8', sideA: '#64748b', sideB: '#475569', stroke: '#334155'
      }, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 4, Math.max(40, h - 12), 4, d * 0.48, 4, {
        top: '#94a3b8', sideA: '#64748b', sideB: '#475569', stroke: '#334155'
      }, 1));
      const headR = Math.min(26, w * 0.38, d * 0.38);
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d * 0.04, Math.max(36, h - 16), headR, headR, 4, {
        top: '#ffffff', sideA: '#bae6fd', sideB: '#7dd3fc', stroke: c.stroke
      }, 1));
    } else if (item.catalogId === 'toilet') {
      const tankD = Math.min(22, d * 0.32);
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, -d / 2 + tankD / 2, 0, w, tankD, h, c, 1));
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, tankD / 2, 0, w * 0.9, d - tankD, Math.min(43, h * 0.55), c, 1));
    } else {
      boxes.push(buildOrientedBoxFaces(fp.cx, fp.cy, rotRad, 0, 0, 0, w, d, h, c, 1));
    }

    return {
      boxes,
      labelWorld: [fp.cx, fp.cy, h + 12],
      name: item.name,
      hasSevere
    };
  }

  /**
   * 判定四面墙是否为“前墙”（位于相机与室内之间），返回每面墙矩形段（自动为门洞切出缺口）
   */
  function drawRoomWallsAndOpenings(ctx, room, openings, proj, analysis) {
    const { Geometry } = global.RoomLayout;
    const { project, halfW, halfD, camWx, camWy } = proj;
    const openingList = Array.isArray(openings) ? openings : [];

    const isFront = {
      top: camWy < -halfD,
      bottom: camWy > halfD,
      left: camWx < -halfW,
      right: camWx > halfW
    };

    const walls = [
      { id: 'top', len: room.w, front: isFront.top, toWorld: (t, z) => [t, 0, z] },
      { id: 'bottom', len: room.w, front: isFront.bottom, toWorld: (t, z) => [t, room.d, z] },
      { id: 'left', len: room.d, front: isFront.left, toWorld: (t, z) => [0, t, z] },
      { id: 'right', len: room.d, front: isFront.right, toWorld: (t, z) => [room.w, t, z] }
    ];

    function drawWallSegment(wall, t0, t1, z0, z1, fill, stroke, alpha) {
      if (t1 - t0 < 0.5 || z1 - z0 < 0.5) return;
      const p0 = project(...wall.toWorld(t0, z0));
      const p1 = project(...wall.toWorld(t1, z0));
      const p2 = project(...wall.toWorld(t1, z1));
      const p3 = project(...wall.toWorld(t0, z1));
      fillQuad(ctx, [p0, p1, p2, p3], fill, stroke, 1.3, alpha);
    }

    function drawWallPass(targetFront) {
      for (let wi = 0; wi < walls.length; wi++) {
        const wObj = walls[wi];
        if (wObj.front !== targetFront) continue;

        const wallOps = openingList
          .filter((op) => op.wall === wObj.id)
          .map((op) => ({ op, geom: Geometry.getOpeningGeometry(op, room) }))
          .sort((a, b) => a.geom.offset - b.geom.offset);

        const wallH = wObj.front ? Math.min(18, room.h) : room.h;
        const wallFill = wObj.front ? 'rgba(203, 213, 225, 0.45)' : 'rgba(241, 245, 249, 0.92)';
        const wallStroke = wObj.front ? 'rgba(71, 85, 105, 0.45)' : '#64748b';
        const doorH = Math.min(210, room.h);

        let cursor = 0;
        for (let oi = 0; oi < wallOps.length; oi++) {
          const { op, geom } = wallOps[oi];
          if (geom.offset > cursor) {
            drawWallSegment(wObj, cursor, geom.offset, 0, wallH, wallFill, wallStroke, 1);
          }

          if (geom.type === 'window') {
            if (!wObj.front) {
              if (geom.sillH > 0) {
                drawWallSegment(wObj, geom.offset, geom.offset + geom.width, 0, geom.sillH, wallFill, wallStroke, 1);
              }
              if (room.h > geom.topH) {
                drawWallSegment(wObj, geom.offset, geom.offset + geom.width, geom.topH, room.h, wallFill, wallStroke, 1);
              }
              // 半透明天蓝玻璃窗扇与中梃线
              drawWallSegment(
                wObj,
                geom.offset,
                geom.offset + geom.width,
                geom.sillH,
                geom.topH,
                'rgba(186, 230, 253, 0.36)',
                '#0284c7',
                1
              );
              const midT = geom.offset + geom.width / 2;
              const m0 = project(...wObj.toWorld(midT, geom.sillH));
              const m1 = project(...wObj.toWorld(midT, geom.topH));
              ctx.save();
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 1.3;
              ctx.beginPath();
              ctx.moveTo(m0.sx, m0.sy);
              ctx.lineTo(m1.sx, m1.sy);
              ctx.stroke();
              ctx.restore();
            } else {
              drawWallSegment(
                wObj,
                geom.offset,
                geom.offset + geom.width,
                0,
                wallH,
                'rgba(186, 230, 253, 0.45)',
                '#0284c7',
                1
              );
            }
            cursor = Math.max(cursor, geom.offset + geom.width);
            continue;
          }

          // 门洞上方过梁
          if (!wObj.front && room.h > doorH) {
            drawWallSegment(wObj, geom.offset, geom.offset + geom.width, doorH, room.h, wallFill, wallStroke, 1);
          }
          // 立体门框线 + 门扇立面示意
          const isBlocked = analysis.openingIssues && analysis.openingIssues.has(op.id);
          const doorStroke = isBlocked ? '#dc2626' : '#0284c7';
          const j1a = project(...wObj.toWorld(geom.offset, 0));
          const j1b = project(...wObj.toWorld(geom.offset, Math.min(doorH, wallH)));
          const j2a = project(...wObj.toWorld(geom.offset + geom.width, 0));
          const j2b = project(...wObj.toWorld(geom.offset + geom.width, Math.min(doorH, wallH)));
          ctx.save();
          ctx.strokeStyle = doorStroke;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(j1a.sx, j1a.sy);
          ctx.lineTo(j1b.sx, j1b.sy);
          ctx.moveTo(j2a.sx, j2a.sy);
          ctx.lineTo(j2b.sx, j2b.sy);
          if (!wObj.front) {
            ctx.moveTo(j1b.sx, j1b.sy);
            ctx.lineTo(j2b.sx, j2b.sy);
          }
          ctx.stroke();

          // 如果不是仅门洞，在地板及低空画半透明开启门板立面
          if (geom.swing !== 'none') {
            const leafH = wObj.front ? Math.min(18, doorH) : Math.min(doorH, room.h * 0.76);
            let nx = 0;
            let ny = 0;
            if (geom.wall === 'top') ny = geom.swing === 'out' ? -1 : 1;
            else if (geom.wall === 'bottom') ny = geom.swing === 'out' ? 1 : -1;
            else if (geom.wall === 'left') nx = geom.swing === 'out' ? -1 : 1;
            else nx = geom.swing === 'out' ? 1 : -1;

            const tx = geom.hingeX + nx * geom.width;
            const ty = geom.hingeY + ny * geom.width;
            const d0 = project(geom.hingeX, geom.hingeY, 0);
            const d1 = project(tx, ty, 0);
            const d2 = project(tx, ty, leafH);
            const d3 = project(geom.hingeX, geom.hingeY, leafH);
            fillQuad(
              ctx,
              [d0, d1, d2, d3],
              isBlocked ? 'rgba(239, 68, 68, 0.25)' : 'rgba(14, 165, 233, 0.16)',
              doorStroke,
              1.4,
              1
            );
          }
          ctx.restore();

          cursor = Math.max(cursor, geom.offset + geom.width);
        }

        if (cursor < wObj.len) {
          drawWallSegment(wObj, cursor, wObj.len, 0, wallH, wallFill, wallStroke, 1);
        }
      }
    }

    return {
      drawBackWalls: () => drawWallPass(false),
      drawFrontWalls: () => drawWallPass(true)
    };
  }

  function renderFloor(ctx, room, proj) {
    const { project } = proj;
    const f0 = project(0, 0, 0);
    const f1 = project(room.w, 0, 0);
    const f2 = project(room.w, room.d, 0);
    const f3 = project(0, room.d, 0);
    fillQuad(ctx, [f0, f1, f2, f3], '#ffffff', '#1e293b', 2, 1);

    ctx.save();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 50; x < room.w; x += 50) {
      const a = project(x, 0, 0);
      const b = project(x, room.d, 0);
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    for (let y = 50; y < room.d; y += 50) {
      const a = project(0, y, 0);
      const b = project(room.w, y, 0);
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function renderScene(ctx, width, height, room, items, openings, notes, analysis, camera) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    const proj = createProjector(room, camera, width, height);
    renderFloor(ctx, room, proj);

    const wallDrawer = drawRoomWallsAndOpenings(ctx, room, openings, proj, analysis);
    wallDrawer.drawBackWalls();

    // 构建并按深度由远及近排序全部 3D 家具/屏风子盒
    const allPrimitives = [];
    const labelSpecs = [];

    for (let i = 0; i < items.length; i++) {
      const built = buildItemPrimitives(items[i], analysis);
      labelSpecs.push(built);
      for (let b = 0; b < built.boxes.length; b++) {
        const box = built.boxes[b];
        const dist = proj.distToCam(box.centerWorld[0], box.centerWorld[1], box.centerWorld[2]);
        allPrimitives.push({ box, dist });
      }
    }

    allPrimitives.sort((a, b) => b.dist - a.dist);
    for (let i = 0; i < allPrimitives.length; i++) {
      renderBoxPrimitive(ctx, allPrimitives[i].box, proj);
    }

    wallDrawer.drawFrontWalls();

    // 绘制家具顶面悬浮名称
    ctx.save();
    ctx.font = `600 11px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < labelSpecs.length; i++) {
      const spec = labelSpecs[i];
      const p = proj.project(spec.labelWorld[0], spec.labelWorld[1], spec.labelWorld[2]);
      const tw = ctx.measureText(spec.name).width + 12;
      ctx.beginPath();
      ctx.roundRect(p.sx - tw / 2, p.sy - 9, tw, 18, 9);
      ctx.fillStyle = spec.hasSevere ? 'rgba(220, 38, 38, 0.92)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = spec.hasSevere ? '#dc2626' : '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = spec.hasSevere ? '#ffffff' : '#0f172a';
      ctx.fillText(spec.name, p.sx, p.sy + 0.5);
    }
    ctx.restore();

    // 绘制 3D 悬浮文字备注（带地面锚点竖向细引线）
    const noteList = Array.isArray(notes) ? notes : [];
    ctx.save();
    ctx.font = `600 11px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < noteList.length; i++) {
      const n = noteList[i];
      const pBase = proj.project(n.x, n.y, 4);
      const pTop = proj.project(n.x, n.y, 72);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(pBase.sx, pBase.sy);
      ctx.lineTo(pTop.sx, pTop.sy);
      ctx.stroke();

      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(pBase.sx, pBase.sy, 3, 0, Math.PI * 2);
      ctx.fill();

      const tw = Math.max(48, ctx.measureText(n.text).width + 16);
      ctx.beginPath();
      ctx.roundRect(pTop.sx - tw / 2, pTop.sy - 10, tw, 20, 10);
      ctx.fillStyle = '#fffbeb';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillText(n.text, pTop.sx, pTop.sy + 0.5);
    }
    ctx.restore();
  }

  function renderToElement(canvas, room, items, openings, notes, analysis, camera) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width || canvas.clientWidth || 720));
    const h = Math.max(240, Math.round(rect.height || canvas.clientHeight || 500));
    const dpr = Math.min(2, global.devicePixelRatio || 1);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    renderScene(ctx, w, h, room, items, openings, notes, analysis, camera);
    ctx.restore();
  }

  function export3DPng(room, items, openings, notes, analysis, layoutName, camera) {
    const logicalW = 1100;
    const headerH = 82;
    const sceneH = 680;
    const logicalH = headerH + sceneH;
    const dpr = 2;

    const canvas = document.createElement('canvas');
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 3D 场景主体
    ctx.save();
    ctx.translate(0, headerH);
    renderScene(ctx, logicalW, sceneH, room, items, openings, notes, analysis, camera || createCamera());
    ctx.restore();

    // 顶部信息栏
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalW, headerH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(logicalW, headerH);
    ctx.stroke();

    const cleanName = layoutName && String(layoutName).trim()
      ? `简排 · ${String(layoutName).trim()} 3D 立体方案`
      : '简排 · 家装 3D 立体草图';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanName, 36, 30);

    const fmtM = (cm) => (cm / 100).toFixed(2).replace(/\.00$/, '.0');
    ctx.fillStyle = '#475569';
    ctx.font = `500 13.5px ${FONT_FAMILY}`;
    ctx.fillText(
      `房间规格：长 ${fmtM(room.w)}m × 宽 ${fmtM(room.d)}m × 层高 ${fmtM(room.h)}m   |   共 ${items.length} 件家具`,
      36,
      58
    );

    const safeSuffix = layoutName && String(layoutName).trim()
      ? `_${String(layoutName).trim().replace(/[\\/:*?"<>|]/g, '')}`
      : '';
    const filename = `家装3D立体${safeSuffix}_${fmtM(room.w)}x${fmtM(room.d)}m.png`;

    return new Promise((resolve) => {
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
          }
          resolve(filename);
        }, 'image/png');
      } else {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        resolve(filename);
      }
    });
  }

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Viewer3D = {
    clamp,
    createCamera,
    buildItemPrimitives,
    renderToElement,
    export3DPng
  };
})(typeof window !== 'undefined' ? window : globalThis);
