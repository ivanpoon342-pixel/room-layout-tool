/**
 * 零依赖网页端第一人称 VR 漫游渲染器
 * 特性：3D 近平面裁剪、1.65m 站姿/1.15m 坐姿高度、360° 环顾与走动、真实门洞切口、交互式小地图瞬移、高清 PNG 导出
 */
(function (global) {
  'use strict';

  const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const NEAR_CLIP_CM = 12;
  const WALL_MARGIN_CM = 18;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /**
   * 构造默认 VR 站位：优先站于第一处门口内侧朝向房间中央；否则站于下墙靠中朝室内
   */
  function createDefaultVRCamera(room, items, openings) {
    const cx = room.w / 2;
    const cy = room.d / 2;
    const list = Array.isArray(openings) ? openings : [];
    let x = cx;
    let y = Math.max(WALL_MARGIN_CM, room.d - 42);

    if (list.length > 0) {
      const op = list[0];
      const wallLen = op.wall === 'top' || op.wall === 'bottom' ? room.w : room.d;
      const w = Math.max(30, Math.min(op.width || 80, wallLen));
      const off = clamp(op.offset || 0, 0, Math.max(0, wallLen - w));
      const mid = off + w / 2;
      const inset = Math.min(48, Math.max(WALL_MARGIN_CM, Math.min(room.w, room.d) * 0.25));

      if (op.wall === 'top') {
        x = clamp(mid, WALL_MARGIN_CM, room.w - WALL_MARGIN_CM);
        y = inset;
      } else if (op.wall === 'bottom') {
        x = clamp(mid, WALL_MARGIN_CM, room.w - WALL_MARGIN_CM);
        y = Math.max(WALL_MARGIN_CM, room.d - inset);
      } else if (op.wall === 'left') {
        x = inset;
        y = clamp(mid, WALL_MARGIN_CM, room.d - WALL_MARGIN_CM);
      } else {
        x = Math.max(WALL_MARGIN_CM, room.w - inset);
        y = clamp(mid, WALL_MARGIN_CM, room.d - WALL_MARGIN_CM);
      }
    }

    const yaw = Math.atan2(cx - x, -(cy - y));
    return {
      x: Math.round(x),
      y: Math.round(y),
      eyeZ: 165,
      yaw,
      pitch: -0.06
    };
  }

  /**
   * 按当前 yaw 朝向前后左右平移，安全限位在墙体内侧
   */
  function moveVRCamera(cam, forwardCm, rightCm, room) {
    const fwdX = Math.sin(cam.yaw);
    const fwdY = -Math.cos(cam.yaw);
    const rightX = Math.cos(cam.yaw);
    const rightY = Math.sin(cam.yaw);

    const minX = Math.min(WALL_MARGIN_CM, room.w / 2);
    const maxX = Math.max(minX, room.w - minX);
    const minY = Math.min(WALL_MARGIN_CM, room.d / 2);
    const maxY = Math.max(minY, room.d - minY);

    return {
      ...cam,
      x: clamp(cam.x + fwdX * forwardCm + rightX * rightCm, minX, maxX),
      y: clamp(cam.y + fwdY * forwardCm + rightY * rightCm, minY, maxY)
    };
  }

  /**
   * 将房间世界坐标 (cm) 转至第一人称相机空间 (cx 右, cy 上, cz 前)
   */
  function worldToCamera(wx, wy, wz, cam) {
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    const dz = wz - cam.eyeZ;

    const cosY = Math.cos(cam.yaw);
    const sinY = Math.sin(cam.yaw);
    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);

    const cx = dx * cosY + dy * sinY;
    const horizFwd = dx * sinY - dy * cosY;
    const cy = -horizFwd * sinP + dz * cosP;
    const cz = horizFwd * cosP + dz * sinP;

    return { cx, cy, cz };
  }

  /**
   * Sutherland-Hodgman 3D 近平面 (cz >= nearCm) 多边形裁剪，防止近景穿越相机翻转畸变
   */
  function clipPolygonNear(poly, nearCm) {
    const near = nearCm === undefined ? NEAR_CLIP_CM : nearCm;
    if (!Array.isArray(poly) || poly.length < 3) return [];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const currIn = curr.cz >= near;
      const prevIn = prev.cz >= near;

      if (currIn !== prevIn) {
        const denom = curr.cz - prev.cz;
        const t = Math.abs(denom) < 1e-6 ? 0.5 : (near - prev.cz) / denom;
        out.push({
          cx: prev.cx + (curr.cx - prev.cx) * t,
          cy: prev.cy + (curr.cy - prev.cy) * t,
          cz: near
        });
      }
      if (currIn) {
        out.push(curr);
      }
    }
    return out.length >= 3 ? out : [];
  }

  function projectCamPoint(pt, halfW, halfH, focalPx) {
    const z = Math.max(NEAR_CLIP_CM, pt.cz);
    return {
      sx: halfW + (pt.cx / z) * focalPx,
      sy: halfH - (pt.cy / z) * focalPx
    };
  }

  function drawClippedQuad(ctx, worldVerts, cam, halfW, halfH, focalPx, fill, stroke, lineWidth, alpha) {
    const camPoly = worldVerts.map((v) => worldToCamera(v[0], v[1], v[2], cam));
    const clipped = clipPolygonNear(camPoly, NEAR_CLIP_CM);
    if (clipped.length < 3) return;

    const pts = clipped.map((p) => projectCamPoint(p, halfW, halfH, focalPx));
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackground(ctx, width, height, cam) {
    const horizonRatio = clamp(0.5 + Math.tan(cam.pitch) * 0.64, 0.1, 0.9);
    const horizonY = height * horizonRatio;
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(10, horizonY));
    sky.addColorStop(0, '#dbeafe');
    sky.addColorStop(1, '#f8fafc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizonY);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, horizonY, width, Math.max(0, height - horizonY));
  }

  function drawFloorAndCeiling(ctx, room, cam, halfW, halfH, focalPx) {
    const step = 50;
    // 1. 地板格（z = 0）
    for (let x = 0; x < room.w; x += step) {
      const x1 = Math.min(room.w, x + step);
      for (let y = 0; y < room.d; y += step) {
        const y1 = Math.min(room.d, y + step);
        const checker = (Math.floor(x / step) + Math.floor(y / step)) % 2 === 0;
        drawClippedQuad(
          ctx,
          [
            [x, y, 0],
            [x1, y, 0],
            [x1, y1, 0],
            [x, y1, 0]
          ],
          cam,
          halfW,
          halfH,
          focalPx,
          checker ? '#ffffff' : '#f8fafc',
          '#e2e8f0',
          0.9,
          1
        );
      }
    }

    // 2. 天花板（z = room.h）
    const ceilStep = 85;
    for (let x = 0; x < room.w; x += ceilStep) {
      const x1 = Math.min(room.w, x + ceilStep);
      for (let y = 0; y < room.d; y += ceilStep) {
        const y1 = Math.min(room.d, y + ceilStep);
        drawClippedQuad(
          ctx,
          [
            [x, y, room.h],
            [x1, y, room.h],
            [x1, y1, room.h],
            [x, y1, room.h]
          ],
          cam,
          halfW,
          halfH,
          focalPx,
          '#f1f5f9',
          '#e2e8f0',
          0.6,
          0.96
        );
      }
    }
  }

  function drawInteriorWalls(ctx, room, openings, cam, halfW, halfH, focalPx, analysis) {
    const Geometry = global.RoomLayout && global.RoomLayout.Geometry;
    const openingList = Array.isArray(openings) ? openings : [];

    const walls = [
      { id: 'top', len: room.w, visible: cam.y > 0, fill: '#f8fafc', toWorld: (t, z) => [t, 0, z] },
      { id: 'bottom', len: room.w, visible: cam.y < room.d, fill: '#f1f5f9', toWorld: (t, z) => [t, room.d, z] },
      { id: 'left', len: room.d, visible: cam.x > 0, fill: '#f4f7fa', toWorld: (t, z) => [0, t, z] },
      { id: 'right', len: room.d, visible: cam.x < room.w, fill: '#eef2f6', toWorld: (t, z) => [room.w, t, z] }
    ];

    const doorH = Math.min(210, room.h);
    const segStep = 90;

    function drawSubdividedWallQuad(wall, t0, t1, z0, z1, fill, stroke) {
      if (t1 - t0 < 0.5 || z1 - z0 < 0.5) return;
      for (let t = t0; t < t1; t += segStep) {
        const nt = Math.min(t1, t + segStep);
        drawClippedQuad(
          ctx,
          [
            wall.toWorld(t, z0),
            wall.toWorld(nt, z0),
            wall.toWorld(nt, z1),
            wall.toWorld(t, z1)
          ],
          cam,
          halfW,
          halfH,
          focalPx,
          fill,
          stroke,
          1,
          1
        );
      }
      // 踢脚线
      if (z0 === 0 && z1 > 12) {
        drawClippedQuad(
          ctx,
          [
            wall.toWorld(t0, 0),
            wall.toWorld(t1, 0),
            wall.toWorld(t1, 12),
            wall.toWorld(t0, 12)
          ],
          cam,
          halfW,
          halfH,
          focalPx,
          '#cbd5e1',
          '#94a3b8',
          0.8,
          1
        );
      }
    }

    const doorFlaps = [];

    for (let wi = 0; wi < walls.length; wi++) {
      const wall = walls[wi];
      if (!wall.visible) continue;

      const wallOps = Geometry
        ? openingList
            .filter((op) => op.wall === wall.id)
            .map((op) => ({ op, geom: Geometry.getOpeningGeometry(op, room) }))
            .sort((a, b) => a.geom.offset - b.geom.offset)
        : [];

      let cursor = 0;
      for (let oi = 0; oi < wallOps.length; oi++) {
        const { op, geom } = wallOps[oi];
        if (geom.offset > cursor) {
          drawSubdividedWallQuad(wall, cursor, geom.offset, 0, room.h, wall.fill, '#94a3b8');
        }

        if (geom.type === 'window') {
          if (geom.sillH > 0) {
            drawSubdividedWallQuad(wall, geom.offset, geom.offset + geom.width, 0, geom.sillH, wall.fill, '#94a3b8');
          }
          if (room.h > geom.topH) {
            drawSubdividedWallQuad(wall, geom.offset, geom.offset + geom.width, geom.topH, room.h, wall.fill, '#94a3b8');
          }
          // 真实窗洞内的半透明玻璃面与竖向中梃线
          drawClippedQuad(
            ctx,
            [
              wall.toWorld(geom.offset, geom.sillH),
              wall.toWorld(geom.offset + geom.width, geom.sillH),
              wall.toWorld(geom.offset + geom.width, geom.topH),
              wall.toWorld(geom.offset, geom.topH)
            ],
            cam,
            halfW,
            halfH,
            focalPx,
            'rgba(186, 230, 253, 0.24)',
            '#0284c7',
            1.8,
            1
          );
          const midT = geom.offset + geom.width / 2;
          const mA = worldToCamera(...wall.toWorld(midT, geom.sillH), cam);
          const mB = worldToCamera(...wall.toWorld(midT, geom.topH), cam);
          if (mA.cz >= NEAR_CLIP_CM || mB.cz >= NEAR_CLIP_CM) {
            let pa = mA;
            let pb = mB;
            if (pa.cz < NEAR_CLIP_CM) {
              const t = (NEAR_CLIP_CM - pa.cz) / (pb.cz - pa.cz);
              pa = { cx: pa.cx + (pb.cx - pa.cx) * t, cy: pa.cy + (pb.cy - pa.cy) * t, cz: NEAR_CLIP_CM };
            } else if (pb.cz < NEAR_CLIP_CM) {
              const t = (NEAR_CLIP_CM - pb.cz) / (pa.cz - pb.cz);
              pb = { cx: pb.cx + (pa.cx - pb.cx) * t, cy: pb.cy + (pa.cy - pb.cy) * t, cz: NEAR_CLIP_CM };
            }
            const s1 = projectCamPoint(pa, halfW, halfH, focalPx);
            const s2 = projectCamPoint(pb, halfW, halfH, focalPx);
            ctx.save();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(s1.sx, s1.sy);
            ctx.lineTo(s2.sx, s2.sy);
            ctx.stroke();
            ctx.restore();
          }
          cursor = Math.max(cursor, geom.offset + geom.width);
          continue;
        }

        if (room.h > doorH) {
          drawSubdividedWallQuad(wall, geom.offset, geom.offset + geom.width, doorH, room.h, wall.fill, '#94a3b8');
        }

        const isBlocked = analysis && analysis.openingIssues && analysis.openingIssues.has(op.id);
        const frameColor = isBlocked ? '#dc2626' : '#0284c7';
        // 门框左右立柱线条
        const j1a = worldToCamera(...wall.toWorld(geom.offset, 0), cam);
        const j1b = worldToCamera(...wall.toWorld(geom.offset, doorH), cam);
        const j2a = worldToCamera(...wall.toWorld(geom.offset + geom.width, 0), cam);
        const j2b = worldToCamera(...wall.toWorld(geom.offset + geom.width, doorH), cam);

        const drawFrameSeg = (a, b) => {
          if (a.cz < NEAR_CLIP_CM && b.cz < NEAR_CLIP_CM) return;
          let pa = a;
          let pb = b;
          if (pa.cz < NEAR_CLIP_CM) {
            const t = (NEAR_CLIP_CM - pa.cz) / (pb.cz - pa.cz);
            pa = { cx: pa.cx + (pb.cx - pa.cx) * t, cy: pa.cy + (pb.cy - pa.cy) * t, cz: NEAR_CLIP_CM };
          } else if (pb.cz < NEAR_CLIP_CM) {
            const t = (NEAR_CLIP_CM - pb.cz) / (pa.cz - pb.cz);
            pb = { cx: pb.cx + (pa.cx - pb.cx) * t, cy: pb.cy + (pa.cy - pb.cy) * t, cz: NEAR_CLIP_CM };
          }
          const s1 = projectCamPoint(pa, halfW, halfH, focalPx);
          const s2 = projectCamPoint(pb, halfW, halfH, focalPx);
          ctx.save();
          ctx.strokeStyle = frameColor;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(s1.sx, s1.sy);
          ctx.lineTo(s2.sx, s2.sy);
          ctx.stroke();
          ctx.restore();
        };

        drawFrameSeg(j1a, j1b);
        drawFrameSeg(j2a, j2b);
        drawFrameSeg(j1b, j2b);

        if (geom.swing !== 'none') {
          let nx = 0;
          let ny = 0;
          if (geom.wall === 'top') ny = geom.swing === 'out' ? -1 : 1;
          else if (geom.wall === 'bottom') ny = geom.swing === 'out' ? 1 : -1;
          else if (geom.wall === 'left') nx = geom.swing === 'out' ? -1 : 1;
          else nx = geom.swing === 'out' ? 1 : -1;

          const tx = geom.hingeX + nx * geom.width;
          const ty = geom.hingeY + ny * geom.width;
          const verts = [
            [geom.hingeX, geom.hingeY, 0],
            [tx, ty, 0],
            [tx, ty, doorH],
            [geom.hingeX, geom.hingeY, doorH]
          ];
          const midCam = worldToCamera((geom.hingeX + tx) / 2, (geom.hingeY + ty) / 2, doorH / 2, cam);
          doorFlaps.push({
            verts,
            avgCz: midCam.cz,
            fill: isBlocked ? 'rgba(239, 68, 68, 0.25)' : 'rgba(14, 165, 233, 0.16)',
            stroke: frameColor,
            alpha: 1
          });
        }

        cursor = Math.max(cursor, geom.offset + geom.width);
      }

      if (cursor < wall.len) {
        drawSubdividedWallQuad(wall, cursor, wall.len, 0, room.h, wall.fill, '#94a3b8');
      }
    }

    return doorFlaps;
  }

  function fallbackItemPrimitives(item) {
    const rot = (((item.rotation || 0) % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    const w = swapped ? item.d : item.w;
    const d = swapped ? item.w : item.d;
    const x0 = item.x;
    const x1 = item.x + w;
    const y0 = item.y;
    const y1 = item.y + d;
    const z0 = 0;
    const z1 = item.h;
    const colors = { top: '#ffffff', sideA: '#f1f5f9', sideB: '#e2e8f0', stroke: '#475569' };
    return {
      boxes: [
        {
          alpha: 1,
          colors,
          faces: [
            { verts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], normal: [0, 0, 1], shade: 'top' },
            { verts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], normal: [0, -1, 0], shade: 'sideA' },
            { verts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], normal: [0, 1, 0], shade: 'sideA' },
            { verts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], normal: [-1, 0, 0], shade: 'sideB' },
            { verts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], normal: [1, 0, 0], shade: 'sideB' }
          ]
        }
      ],
      labelWorld: [item.x + w / 2, item.y + d / 2, item.h + 12],
      name: item.name,
      hasSevere: false
    };
  }

  function getMiniMapBounds(canvasW, canvasH, room) {
    const maxW = 132;
    const maxH = 104;
    const pad = 10;
    const scale = Math.min((maxW - pad * 2) / room.w, (maxH - pad * 2) / room.d);
    const rw = room.w * scale;
    const rd = room.d * scale;
    const boxW = Math.max(82, rw + pad * 2);
    const boxH = Math.max(68, rd + pad * 2);
    const boxX = canvasW - boxW - 14;
    const boxY = 14;
    const originX = boxX + (boxW - rw) / 2;
    const originY = boxY + (boxH - rd) / 2;
    return { boxX, boxY, boxW, boxH, originX, originY, scale, rw, rd };
  }

  /**
   * 命中右上角迷你小地图检测，返回对应房间坐标 { x, y } 或 null
   */
  function hitTestMiniMap(canvasX, canvasY, canvasW, canvasH, room) {
    const mm = getMiniMapBounds(canvasW, canvasH, room);
    if (
      canvasX < mm.boxX ||
      canvasX > mm.boxX + mm.boxW ||
      canvasY < mm.boxY ||
      canvasY > mm.boxY + mm.boxH
    ) {
      return null;
    }
    const minM = Math.min(WALL_MARGIN_CM, room.w / 2, room.d / 2);
    const rx = clamp((canvasX - mm.originX) / mm.scale, minM, Math.max(minM, room.w - minM));
    const ry = clamp((canvasY - mm.originY) / mm.scale, minM, Math.max(minM, room.d - minM));
    return { x: Math.round(rx), y: Math.round(ry) };
  }

  function drawMiniMap(ctx, canvasW, canvasH, room, items, openings, cam) {
    const Geometry = global.RoomLayout && global.RoomLayout.Geometry;
    const mm = getMiniMapBounds(canvasW, canvasH, room);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mm.boxX, mm.boxY, mm.boxW, mm.boxH, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 房间框
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.fillRect(mm.originX, mm.originY, mm.rw, mm.rd);
    ctx.strokeRect(mm.originX, mm.originY, mm.rw, mm.rd);

    // 家具缩略块
    if (Geometry) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const fp = Geometry.getFootprint(it);
        if (it.catalogId === 'interior-wall') {
          ctx.fillStyle = 'rgba(51, 65, 85, 0.78)';
          ctx.strokeStyle = '#1e293b';
        } else if (it.catalogId === 'stairs-straight' || it.catalogId === 'stairs-l') {
          ctx.fillStyle = 'rgba(217, 119, 6, 0.28)';
          ctx.strokeStyle = '#b45309';
        } else {
          ctx.fillStyle = 'rgba(15, 118, 110, 0.22)';
          ctx.strokeStyle = 'rgba(15, 118, 110, 0.65)';
        }
        ctx.lineWidth = 0.8;
        ctx.fillRect(
          mm.originX + fp.x * mm.scale,
          mm.originY + fp.y * mm.scale,
          fp.w * mm.scale,
          fp.d * mm.scale
        );
        ctx.strokeRect(
          mm.originX + fp.x * mm.scale,
          mm.originY + fp.y * mm.scale,
          fp.w * mm.scale,
          fp.d * mm.scale
        );
      }

      const opList = Array.isArray(openings) ? openings : [];
      for (let i = 0; i < opList.length; i++) {
        const geom = Geometry.getOpeningGeometry(opList[i], room);
        ctx.strokeStyle = geom.type === 'window' ? '#38bdf8' : '#0284c7';
        ctx.lineWidth = geom.type === 'window' ? 3 : 2.4;
        ctx.beginPath();
        ctx.moveTo(mm.originX + geom.x1 * mm.scale, mm.originY + geom.y1 * mm.scale);
        ctx.lineTo(mm.originX + geom.x2 * mm.scale, mm.originY + geom.y2 * mm.scale);
        ctx.stroke();
      }
    }

    // 相机位置与视线扇形锥
    const px = mm.originX + cam.x * mm.scale;
    const py = mm.originY + cam.y * mm.scale;
    const coneLen = 20;
    const aCenter = Math.atan2(-Math.cos(cam.yaw), Math.sin(cam.yaw));
    ctx.fillStyle = 'rgba(15, 118, 110, 0.28)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, coneLen, aCenter - 0.58, aCenter + 0.58);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f766e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function renderVRScene(ctx, width, height, room, items, openings, notes, analysis, cam, showMiniMap) {
    const Viewer3D = global.RoomLayout && global.RoomLayout.Viewer3D;
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const focalPx = width * 0.64;

    drawBackground(ctx, width, height, cam);
    drawFloorAndCeiling(ctx, room, cam, halfW, halfH, focalPx);
    const doorFlaps = drawInteriorWalls(ctx, room, openings, cam, halfW, halfH, focalPx, analysis);

    // 收集所有室内家具面与门板面，按近裁剪后平均深度由远到近排序
    const faceQueue = [];

    for (let i = 0; i < doorFlaps.length; i++) {
      const df = doorFlaps[i];
      if (df.avgCz < NEAR_CLIP_CM - 120) continue;
      faceQueue.push({
        verts: df.verts,
        avgCz: df.avgCz,
        fill: df.fill,
        stroke: df.stroke,
        lineWidth: 1.5,
        alpha: df.alpha
      });
    }

    const labelSpecs = [];
    for (let i = 0; i < items.length; i++) {
      const built =
        Viewer3D && Viewer3D.buildItemPrimitives
          ? Viewer3D.buildItemPrimitives(items[i], analysis)
          : fallbackItemPrimitives(items[i]);
      labelSpecs.push(built);

      for (let b = 0; b < built.boxes.length; b++) {
        const box = built.boxes[b];
        const isTransparent = box.alpha < 0.99;
        for (let fi = 0; fi < box.faces.length; fi++) {
          const f = box.faces[fi];
          let fx = 0;
          let fy = 0;
          let fz = 0;
          for (let k = 0; k < f.verts.length; k++) {
            fx += f.verts[k][0];
            fy += f.verts[k][1];
            fz += f.verts[k][2];
          }
          fx /= f.verts.length;
          fy /= f.verts.length;
          fz /= f.verts.length;

          const dot = (cam.x - fx) * f.normal[0] + (cam.y - fy) * f.normal[1] + (cam.eyeZ - fz) * f.normal[2];
          if (!isTransparent && dot <= 0) continue;

          const centerCam = worldToCamera(fx, fy, fz, cam);
          faceQueue.push({
            verts: f.verts,
            avgCz: centerCam.cz,
            fill: box.colors[f.shade] || box.colors.top,
            stroke: box.colors.stroke,
            lineWidth: 1.1,
            alpha: box.alpha
          });
        }
      }
    }

    faceQueue.sort((a, b) => b.avgCz - a.avgCz);
    for (let i = 0; i < faceQueue.length; i++) {
      const fq = faceQueue[i];
      drawClippedQuad(ctx, fq.verts, cam, halfW, halfH, focalPx, fq.fill, fq.stroke, fq.lineWidth, fq.alpha);
    }

    // 绘制眼前视野内家具名称悬浮标签
    ctx.save();
    ctx.font = `600 11px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < labelSpecs.length; i++) {
      const spec = labelSpecs[i];
      const labelZ = Math.min(spec.labelWorld[2], Math.max(120, room.h - 22));
      const pCam = worldToCamera(spec.labelWorld[0], spec.labelWorld[1], labelZ, cam);
      if (pCam.cz < 28) continue;
      const p = projectCamPoint(pCam, halfW, halfH, focalPx);
      if (p.sx < -40 || p.sx > width + 40 || p.sy < -20 || p.sy > height + 20) continue;
      const tw = ctx.measureText(spec.name).width + 12;
      ctx.beginPath();
      ctx.roundRect(p.sx - tw / 2, p.sy - 9, tw, 18, 9);
      ctx.fillStyle = spec.hasSevere ? 'rgba(220, 38, 38, 0.92)' : 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
      ctx.strokeStyle = spec.hasSevere ? '#dc2626' : '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = spec.hasSevere ? '#ffffff' : '#0f172a';
      ctx.fillText(spec.name, p.sx, p.sy + 0.5);
    }
    ctx.restore();

    // 绘制室内空间文字备注
    const noteList = Array.isArray(notes) ? notes : [];
    ctx.save();
    ctx.font = `600 11.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < noteList.length; i++) {
      const n = noteList[i];
      const pTopCam = worldToCamera(n.x, n.y, 92, cam);
      if (pTopCam.cz < 24) continue;
      const pTop = projectCamPoint(pTopCam, halfW, halfH, focalPx);
      const pBaseCam = worldToCamera(n.x, n.y, 4, cam);
      if (pBaseCam.cz >= NEAR_CLIP_CM) {
        const pBase = projectCamPoint(pBaseCam, halfW, halfH, focalPx);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pBase.sx, pBase.sy);
        ctx.lineTo(pTop.sx, pTop.sy);
        ctx.stroke();
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(pBase.sx, pBase.sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const tw = Math.max(50, ctx.measureText(n.text).width + 16);
      ctx.beginPath();
      ctx.roundRect(pTop.sx - tw / 2, pTop.sy - 10.5, tw, 21, 10.5);
      ctx.fillStyle = '#fffbeb';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillText(n.text, pTop.sx, pTop.sy + 0.5);
    }
    ctx.restore();

    if (showMiniMap) {
      drawMiniMap(ctx, width, height, room, items, openings, cam);
    }
  }

  function renderToElement(canvas, room, items, openings, notes, analysis, cam) {
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
    renderVRScene(ctx, w, h, room, items, openings, notes, analysis, cam, true);
    ctx.restore();
  }

  function exportVRPng(room, items, openings, notes, analysis, layoutName, cam) {
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

    ctx.save();
    ctx.translate(0, headerH);
    renderVRScene(
      ctx,
      logicalW,
      sceneH,
      room,
      items,
      openings,
      notes,
      analysis,
      cam || createDefaultVRCamera(room, items, openings),
      true
    );
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalW, headerH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(logicalW, headerH);
    ctx.stroke();

    const cleanName =
      layoutName && String(layoutName).trim()
        ? `简排 · ${String(layoutName).trim()} VR 第一人称视角`
        : '简排 · 家装 VR 第一人称漫游视角';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanName, 36, 30);

    const fmtM = (cm) => (cm / 100).toFixed(2).replace(/\.00$/, '.0');
    const activeCam = cam || { eyeZ: 165 };
    ctx.fillStyle = '#475569';
    ctx.font = `500 13.5px ${FONT_FAMILY}`;
    ctx.fillText(
      `房间规格：长 ${fmtM(room.w)}m × 宽 ${fmtM(room.d)}m × 层高 ${fmtM(room.h)}m   |   视点高度 ${fmtM(activeCam.eyeZ)}m   |   共 ${items.length} 件家具`,
      36,
      58
    );

    const safeSuffix =
      layoutName && String(layoutName).trim()
        ? `_${String(layoutName).trim().replace(/[\\/:*?"<>|]/g, '')}`
        : '';
    const filename = `家装VR漫游${safeSuffix}_${fmtM(room.w)}x${fmtM(room.d)}m.png`;

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

  const VRViewer = {
    NEAR_CLIP_CM,
    WALL_MARGIN_CM,
    clamp,
    createDefaultVRCamera,
    moveVRCamera,
    worldToCamera,
    clipPolygonNear,
    hitTestMiniMap,
    renderToElement,
    exportVRPng
  };

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.VRViewer = VRViewer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRViewer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
