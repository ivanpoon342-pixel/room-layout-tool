/**
 * 常用家具标准库
 * 所有尺寸单位为厘米 (cm) 整数：w (宽/横向)、d (深/纵向)、h (高)
 * 同时提供 SVG 与 Canvas 2D 俯视建筑平面图绘制函数，局部坐标系均为 [0..w] x [0..d]
 */
(function (global) {
  'use strict';

  const CATEGORIES = [
    { id: 'all', label: '全部' },
    { id: 'structure', label: '结构' },
    { id: 'bedroom', label: '卧室' },
    { id: 'study', label: '书房' },
    { id: 'living', label: '客餐' },
    { id: 'bath', label: '卫浴' }
  ];

  // 绘制通用外框辅助
  function svgBox(w, d, fill, stroke, rx) {
    const r = rx || 2;
    return `<rect x="0.75" y="0.75" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, d - 1.5)}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  function canvasBox(ctx, w, d, fill, stroke, r) {
    const radius = Math.min(r || 2, w / 4, d / 4);
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, Math.max(1, w - 1.5), Math.max(1, d - 1.5), radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // 床类俯视绘制（双枕或单枕 + 床头板 + 被面折线）
  function drawBedSvg(w, d, fill, stroke, pillows) {
    const headH = Math.min(14, d * 0.08);
    const quiltY = Math.min(d * 0.34, headH + 46);
    const pW = pillows === 1 ? Math.min(w * 0.56, 54) : Math.min((w - 24) / 2, 56);
    const pH = Math.min(26, d * 0.14);
    const pY = headH + 6;
    let pillowSvg = '';
    if (pillows === 1) {
      const px = (w - pW) / 2;
      pillowSvg = `<rect x="${px}" y="${pY}" width="${pW}" height="${pH}" rx="4" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`;
    } else {
      const gap = Math.max(6, w * 0.06);
      const totalP = pW * 2 + gap;
      const px1 = (w - totalP) / 2;
      const px2 = px1 + pW + gap;
      pillowSvg =
        `<rect x="${px1}" y="${pY}" width="${pW}" height="${pH}" rx="4" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>` +
        `<rect x="${px2}" y="${pY}" width="${pW}" height="${pH}" rx="4" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`;
    }
    return [
      svgBox(w, d, fill, stroke, 3),
      `<rect x="1.5" y="1.5" width="${Math.max(1, w - 3)}" height="${headH}" rx="1.5" fill="${stroke}" fill-opacity="0.16" stroke="${stroke}" stroke-width="1"/>`,
      pillowSvg,
      `<line x1="2" y1="${quiltY}" x2="${w - 2}" y2="${quiltY}" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>`,
      `<path d="M ${w * 0.18} ${quiltY} L ${w * 0.18} ${quiltY + 14} L ${w * 0.82} ${quiltY + 14} L ${w * 0.82} ${quiltY}" fill="none" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`
    ].join('');
  }

  function drawBedCanvas(ctx, w, d, fill, stroke, pillows) {
    canvasBox(ctx, w, d, fill, stroke, 3);
    const headH = Math.min(14, d * 0.08);
    const quiltY = Math.min(d * 0.34, headH + 46);
    const pW = pillows === 1 ? Math.min(w * 0.56, 54) : Math.min((w - 24) / 2, 56);
    const pH = Math.min(26, d * 0.14);
    const pY = headH + 6;

    ctx.fillStyle = 'rgba(55, 65, 81, 0.14)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(1.5, 1.5, Math.max(1, w - 3), headH);
    ctx.strokeRect(1.5, 1.5, Math.max(1, w - 3), headH);

    ctx.fillStyle = '#ffffff';
    if (pillows === 1) {
      ctx.beginPath();
      ctx.roundRect((w - pW) / 2, pY, pW, pH, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      const gap = Math.max(6, w * 0.06);
      const px1 = (w - (pW * 2 + gap)) / 2;
      ctx.beginPath();
      ctx.roundRect(px1, pY, pW, pH, 4);
      ctx.roundRect(px1 + pW + gap, pY, pW, pH, 4);
      ctx.fill();
      ctx.stroke();
    }

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(2, quiltY);
    ctx.lineTo(w - 2, quiltY);
    ctx.stroke();
    ctx.restore();
  }

  // 衣柜/储物柜
  function drawWardrobeSvg(w, d, fill, stroke) {
    const doors = Math.max(2, Math.round(w / 50));
    const lines = [];
    for (let i = 1; i < doors; i++) {
      const x = (w / doors) * i;
      lines.push(`<line x1="${x}" y1="2" x2="${x}" y2="${d - 2}" stroke="${stroke}" stroke-width="0.9" opacity="0.35"/>`);
    }
    return [
      svgBox(w, d, fill, stroke, 2),
      `<line x1="6" y1="${d * 0.5}" x2="${w - 6}" y2="${d * 0.5}" stroke="${stroke}" stroke-width="1" stroke-dasharray="6 4" opacity="0.55"/>`,
      `<line x1="2" y1="${d - 5}" x2="${w - 2}" y2="${d - 5}" stroke="${stroke}" stroke-width="1.1" opacity="0.7"/>`,
      ...lines
    ].join('');
  }

  function drawWardrobeCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 2);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(6, d * 0.5);
    ctx.lineTo(w - 6, d * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(2, d - 5);
    ctx.lineTo(w - 2, d - 5);
    ctx.stroke();
    ctx.restore();
  }

  // 桌台（书桌/梳妆台）
  function drawDeskSvg(w, d, fill, stroke, withMonitor) {
    const extra = withMonitor
      ? `<rect x="${w * 0.32}" y="${d * 0.16}" width="${w * 0.36}" height="5" rx="1.5" fill="${stroke}" opacity="0.65"/>` +
        `<rect x="${w * 0.36}" y="${d * 0.36}" width="${w * 0.28}" height="${Math.min(16, d * 0.24)}" rx="2" fill="#ffffff" stroke="${stroke}" stroke-width="0.9" opacity="0.7"/>`
      : `<circle cx="${w * 0.5}" cy="${d * 0.42}" r="${Math.min(12, d * 0.22)}" fill="#ffffff" stroke="${stroke}" stroke-width="1" opacity="0.75"/>`;
    return [
      svgBox(w, d, fill, stroke, 2),
      `<rect x="4" y="4" width="${Math.max(1, w - 8)}" height="${Math.max(1, d - 8)}" rx="1" fill="none" stroke="${stroke}" stroke-width="0.7" opacity="0.35"/>`,
      extra
    ].join('');
  }

  function drawDeskCanvas(ctx, w, d, fill, stroke, withMonitor) {
    canvasBox(ctx, w, d, fill, stroke, 2);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.45;
    ctx.strokeRect(4, 4, Math.max(1, w - 8), Math.max(1, d - 8));
    if (withMonitor) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = stroke;
      ctx.fillRect(w * 0.32, d * 0.16, w * 0.36, 5);
    } else {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(w * 0.5, d * 0.42, Math.min(12, d * 0.22), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 沙发
  function drawSofaSvg(w, d, fill, stroke) {
    const arm = Math.min(18, w * 0.1);
    const back = Math.min(20, d * 0.24);
    const seatW = w - arm * 2;
    const seats = 3;
    const div1 = arm + seatW / seats;
    const div2 = arm + (seatW * 2) / seats;
    return [
      svgBox(w, d, fill, stroke, 5),
      `<rect x="1.5" y="1.5" width="${w - 3}" height="${back}" rx="3" fill="${stroke}" fill-opacity="0.14" stroke="${stroke}" stroke-width="1"/>`,
      `<rect x="1.5" y="1.5" width="${arm}" height="${d - 3}" rx="3" fill="${stroke}" fill-opacity="0.12" stroke="${stroke}" stroke-width="1"/>`,
      `<rect x="${w - arm - 1.5}" y="1.5" width="${arm}" height="${d - 3}" rx="3" fill="${stroke}" fill-opacity="0.12" stroke="${stroke}" stroke-width="1"/>`,
      `<line x1="${div1}" y1="${back}" x2="${div1}" y2="${d - 3}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`,
      `<line x1="${div2}" y1="${back}" x2="${div2}" y2="${d - 3}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`
    ].join('');
  }

  function drawSofaCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 5);
    const arm = Math.min(18, w * 0.1);
    const back = Math.min(20, d * 0.24);
    const seatW = w - arm * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(55, 65, 81, 0.12)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(1.5, 1.5, w - 3, back);
    ctx.strokeRect(1.5, 1.5, w - 3, back);
    ctx.fillRect(1.5, 1.5, arm, d - 3);
    ctx.strokeRect(1.5, 1.5, arm, d - 3);
    ctx.fillRect(w - arm - 1.5, 1.5, arm, d - 3);
    ctx.strokeRect(w - arm - 1.5, 1.5, arm, d - 3);
    ctx.globalAlpha = 0.45;
    for (let i = 1; i <= 2; i++) {
      const x = arm + (seatW * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, back);
      ctx.lineTo(x, d - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 椅子（办公椅 / 餐椅）
  function drawChairSvg(w, d, fill, stroke, isOffice) {
    const backH = Math.min(12, d * 0.22);
    if (isOffice) {
      return [
        svgBox(w, d, fill, stroke, 8),
        `<rect x="${w * 0.16}" y="3" width="${w * 0.68}" height="${backH}" rx="4" fill="${stroke}" fill-opacity="0.18" stroke="${stroke}" stroke-width="1"/>`,
        `<circle cx="${w / 2}" cy="${d * 0.56}" r="${Math.min(w, d) * 0.26}" fill="#ffffff" fill-opacity="0.6" stroke="${stroke}" stroke-width="0.9"/>`
      ].join('');
    }
    return [
      svgBox(w, d, fill, stroke, 4),
      `<rect x="3" y="2" width="${w - 6}" height="${backH}" rx="2" fill="${stroke}" fill-opacity="0.18" stroke="${stroke}" stroke-width="1"/>`
    ].join('');
  }

  function drawChairCanvas(ctx, w, d, fill, stroke, isOffice) {
    canvasBox(ctx, w, d, fill, stroke, isOffice ? 8 : 4);
    const backH = Math.min(12, d * 0.22);
    ctx.save();
    ctx.fillStyle = 'rgba(55, 65, 81, 0.18)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    if (isOffice) {
      ctx.fillRect(w * 0.16, 3, w * 0.68, backH);
      ctx.strokeRect(w * 0.16, 3, w * 0.68, backH);
    } else {
      ctx.fillRect(3, 2, w - 6, backH);
      ctx.strokeRect(3, 2, w - 6, backH);
    }
    ctx.restore();
  }

  // 马桶
  function drawToiletSvg(w, d, fill, stroke) {
    const tankD = Math.min(20, d * 0.28);
    const bowlCy = tankD + (d - tankD) * 0.48;
    const rx = Math.max(4, w * 0.36);
    const ry = Math.max(6, (d - tankD) * 0.42);
    return [
      `<rect x="2" y="1" width="${Math.max(1, w - 4)}" height="${tankD}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`,
      `<ellipse cx="${w / 2}" cy="${bowlCy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`,
      `<ellipse cx="${w / 2}" cy="${bowlCy + 2}" rx="${rx * 0.62}" ry="${ry * 0.65}" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`
    ].join('');
  }

  function drawToiletCanvas(ctx, w, d, fill, stroke) {
    const tankD = Math.min(20, d * 0.28);
    const bowlCy = tankD + (d - tankD) * 0.48;
    const rx = Math.max(4, w * 0.36);
    const ry = Math.max(6, (d - tankD) * 0.42);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(2, 1, Math.max(1, w - 4), tankD, 3);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(w / 2, bowlCy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, bowlCy + 2, rx * 0.62, ry * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 浴室柜
  function drawVanitySvg(w, d, fill, stroke) {
    const bw = Math.min(46, w * 0.56);
    const bd = Math.min(30, d * 0.62);
    return [
      svgBox(w, d, fill, stroke, 2),
      `<rect x="${(w - bw) / 2}" y="${(d - bd) / 2 + 2}" width="${bw}" height="${bd}" rx="5" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`,
      `<circle cx="${w / 2}" cy="${(d - bd) / 2 + bd * 0.42 + 2}" r="2.2" fill="${stroke}"/>`,
      `<line x1="${w / 2}" y1="4" x2="${w / 2}" y2="${(d - bd) / 2 + 6}" stroke="${stroke}" stroke-width="1.5"/>`
    ].join('');
  }

  function drawVanityCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 2);
    const bw = Math.min(46, w * 0.56);
    const bd = Math.min(30, d * 0.62);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect((w - bw) / 2, (d - bd) / 2 + 2, bw, bd, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(w / 2, (d - bd) / 2 + bd * 0.42 + 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 淋浴房
  function drawShowerSvg(w, d, fill, stroke) {
    return [
      svgBox(w, d, fill, stroke, 3),
      `<line x1="4" y1="4" x2="${w - 4}" y2="${d - 4}" stroke="${stroke}" stroke-width="0.9" opacity="0.35"/>`,
      `<line x1="${w - 4}" y1="4" x2="4" y2="${d - 4}" stroke="${stroke}" stroke-width="0.9" opacity="0.35"/>`,
      `<circle cx="${w / 2}" cy="${d / 2}" r="4" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`
    ].join('');
  }

  function drawShowerCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 3);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(w - 4, d - 4);
    ctx.moveTo(w - 4, 4);
    ctx.lineTo(4, d - 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, d / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 花洒（顶喷花洒头 + 混水阀横杆 + 支臂 + 地漏）
  function drawShowerheadSvg(w, d, fill, stroke) {
    const cx = w / 2;
    const valveY = Math.min(8, d * 0.14);
    const valveW = Math.min(w * 0.44, 24);
    const headCy = Math.min(d * 0.44, valveY + Math.min(w, d) * 0.34);
    const r = Math.max(5, Math.min(w, d) * 0.22);
    const drainR = Math.max(2.2, Math.min(w, d) * 0.06);
    const dots = [
      [0, 0],
      [-r * 0.45, 0],
      [r * 0.45, 0],
      [0, -r * 0.45],
      [0, r * 0.45],
      [-r * 0.32, -r * 0.32],
      [r * 0.32, -r * 0.32],
      [-r * 0.32, r * 0.32],
      [r * 0.32, r * 0.32]
    ]
      .map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${headCy + dy}" r="0.9" fill="${stroke}" opacity="0.75"/>`)
      .join('');

    return [
      `<rect x="0.75" y="0.75" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, d - 1.5)}" rx="3" fill="${fill}" fill-opacity="0.7" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="4 2"/>`,
      `<rect x="${cx - valveW / 2}" y="2" width="${valveW}" height="4" rx="1.5" fill="${stroke}" opacity="0.75"/>`,
      `<line x1="${cx}" y1="6" x2="${cx}" y2="${headCy - r}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`,
      `<circle cx="${cx}" cy="${headCy}" r="${r}" fill="#ffffff" stroke="${stroke}" stroke-width="1.4"/>`,
      dots,
      `<circle cx="${w - Math.max(7, w * 0.16)}" cy="${d - Math.max(7, d * 0.16)}" r="${drainR}" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.5"/>`
    ].join('');
  }

  function drawShowerheadCanvas(ctx, w, d, fill, stroke) {
    const cx = w / 2;
    const valveY = Math.min(8, d * 0.14);
    const valveW = Math.min(w * 0.44, 24);
    const headCy = Math.min(d * 0.44, valveY + Math.min(w, d) * 0.34);
    const r = Math.max(5, Math.min(w, d) * 0.22);
    const drainR = Math.max(2.2, Math.min(w, d) * 0.06);

    ctx.save();
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, Math.max(1, w - 1.5), Math.max(1, d - 1.5), 3);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = stroke;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(cx - valveW / 2, 2, valveW, 4);

    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx, headCy - r);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, headCy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const offsets = [
      [0, 0], [-r * 0.45, 0], [r * 0.45, 0], [0, -r * 0.45], [0, r * 0.45],
      [-r * 0.32, -r * 0.32], [r * 0.32, -r * 0.32], [-r * 0.32, r * 0.32], [r * 0.32, r * 0.32]
    ];
    ctx.fillStyle = stroke;
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < offsets.length; i++) {
      ctx.beginPath();
      ctx.arc(cx + offsets[i][0], headCy + offsets[i][1], 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w - Math.max(7, w * 0.16), d - Math.max(7, d * 0.16), drainR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 浴缸
  function drawBathtubSvg(w, d, fill, stroke) {
    const pad = Math.min(8, w * 0.06, d * 0.12);
    return [
      svgBox(w, d, fill, stroke, 4),
      `<rect x="${pad}" y="${pad}" width="${Math.max(2, w - pad * 2)}" height="${Math.max(2, d - pad * 2)}" rx="${Math.min(18, d * 0.34)}" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`,
      `<circle cx="${pad + 12}" cy="${d / 2}" r="3" fill="none" stroke="${stroke}" stroke-width="1.1"/>`
    ].join('');
  }

  function drawBathtubCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 4);
    const pad = Math.min(8, w * 0.06, d * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(pad, pad, Math.max(2, w - pad * 2), Math.max(2, d - pad * 2), Math.min(18, d * 0.34));
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pad + 12, d / 2, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 洗衣机
  function drawWasherSvg(w, d, fill, stroke) {
    const r = Math.min(w, d) * 0.32;
    return [
      svgBox(w, d, fill, stroke, 3),
      `<line x1="2" y1="10" x2="${w - 2}" y2="10" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>`,
      `<circle cx="${w / 2}" cy="${d * 0.56}" r="${r}" fill="#ffffff" stroke="${stroke}" stroke-width="1.1"/>`,
      `<circle cx="${w / 2}" cy="${d * 0.56}" r="${r * 0.62}" fill="none" stroke="${stroke}" stroke-width="0.8" stroke-dasharray="3 2"/>`
    ].join('');
  }

  function drawWasherCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 3);
    const r = Math.min(w, d) * 0.32;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(w / 2, d * 0.56, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 平开门扇（90度开启扇形弧线）
  function drawDoorSvg(w, d, fill, stroke) {
    const leafW = Math.max(4, Math.min(6, w * 0.07));
    const rx = Math.max(10, w - 2);
    const ry = Math.max(10, d - 2);
    return [
      `<rect x="0.75" y="0.75" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, d - 1.5)}" fill="${fill}" fill-opacity="0.32" stroke="${stroke}" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.75"/>`,
      `<rect x="1" y="1" width="${leafW}" height="${Math.max(4, d - 2)}" rx="1" fill="${stroke}" fill-opacity="0.82"/>`,
      `<path d="M 1 ${d - 1} A ${rx} ${ry} 0 0 0 ${w - 1} 1" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-dasharray="5 3"/>`,
      `<line x1="1" y1="1" x2="${w - 1}" y2="1" stroke="${stroke}" stroke-width="1.4" opacity="0.55"/>`
    ].join('');
  }

  function drawDoorCanvas(ctx, w, d, fill, stroke) {
    const leafW = Math.max(4, Math.min(6, w * 0.07));
    ctx.save();
    ctx.fillStyle = 'rgba(229, 231, 235, 0.32)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    ctx.fillRect(0.75, 0.75, Math.max(1, w - 1.5), Math.max(1, d - 1.5));
    ctx.strokeRect(0.75, 0.75, Math.max(1, w - 1.5), Math.max(1, d - 1.5));
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    ctx.fillRect(1, 1, leafW, Math.max(4, d - 2));
    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1.3;
    ctx.ellipse(1, 1, Math.max(4, w - 2), Math.max(4, d - 2), 0, 0, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
  }

  // 屏风 / 玻璃隔断
  function drawPartitionSvg(w, d, fill, stroke) {
    const isHorizontal = w >= d;
    const len = isHorizontal ? w : d;
    const thick = isHorizontal ? d : w;
    const slats = Math.max(3, Math.floor(len / 14));
    const marks = [];
    for (let i = 1; i < slats; i++) {
      const pos = (len / slats) * i;
      if (isHorizontal) {
        marks.push(`<line x1="${pos}" y1="1.5" x2="${pos}" y2="${Math.max(2, d - 1.5)}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
      } else {
        marks.push(`<line x1="1.5" y1="${pos}" x2="${Math.max(2, w - 1.5)}" y2="${pos}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
      }
    }
    const midLine = isHorizontal
      ? `<line x1="2" y1="${d / 2}" x2="${Math.max(2, w - 2)}" y2="${d / 2}" stroke="${stroke}" stroke-width="1.2" opacity="0.75"/>`
      : `<line x1="${w / 2}" y1="2" x2="${w / 2}" y2="${Math.max(2, d - 2)}" stroke="${stroke}" stroke-width="1.2" opacity="0.75"/>`;
    return [
      svgBox(w, d, fill, stroke, Math.min(2, thick / 3)),
      midLine,
      ...marks
    ].join('');
  }

  function drawPartitionCanvas(ctx, w, d, fill, stroke) {
    const isHorizontal = w >= d;
    const len = isHorizontal ? w : d;
    const slats = Math.max(3, Math.floor(len / 14));
    canvasBox(ctx, w, d, fill, stroke, 2);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(2, d / 2);
      ctx.lineTo(Math.max(2, w - 2), d / 2);
    } else {
      ctx.moveTo(w / 2, 2);
      ctx.lineTo(w / 2, Math.max(2, d - 2));
    }
    ctx.stroke();

    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 1; i < slats; i++) {
      const pos = (len / slats) * i;
      if (isHorizontal) {
        ctx.moveTo(pos, 1.5);
        ctx.lineTo(pos, Math.max(2, d - 1.5));
      } else {
        ctx.moveTo(1.5, pos);
        ctx.lineTo(Math.max(2, w - 1.5), pos);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // 室内隔墙（实心墙体 + 45° 斜线建筑填充，无 clipPath ID 冲突）
  function drawInteriorWallSvg(w, d, fill, stroke) {
    const step = Math.max(7, Math.min(12, Math.max(w, d) / 14));
    const lines = [];
    for (let c = step; c < w + d - 2; c += step) {
      const x1 = Math.max(1.2, c - (d - 1.2));
      const y1 = c - x1;
      const x2 = Math.min(w - 1.2, c - 1.2);
      const y2 = c - x2;
      if (x2 > x1 + 0.5) {
        lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
      }
    }
    return [
      `<rect x="0.75" y="0.75" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, d - 1.5)}" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`,
      ...lines
    ].join('');
  }

  function drawInteriorWallCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 1);
    const step = Math.max(7, Math.min(12, Math.max(w, d) / 14));
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (let c = step; c < w + d - 2; c += step) {
      const x1 = Math.max(1.2, c - (d - 1.2));
      const y1 = c - x1;
      const x2 = Math.min(w - 1.2, c - 1.2);
      const y2 = c - x2;
      if (x2 > x1 + 0.5) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // 直跑楼梯（踏步线 + 上行方向箭头，d>=w 时由下向上，否则由左向右）
  function drawStraightStairsSvg(w, d, fill, stroke) {
    const alongY = d >= w;
    const longLen = alongY ? d : w;
    const shortLen = alongY ? w : d;
    const maxSteps = longLen < 50 ? 7 : 12;
    const steps = Math.max(5, Math.min(maxSteps, Math.round((longLen / Math.max(8, shortLen)) * 4)));
    const lines = [];

    if (shortLen >= 18) {
      const inset = Math.max(1.8, shortLen * 0.07);
      if (alongY) {
        lines.push(`<line x1="${inset}" y1="1.5" x2="${inset}" y2="${d - 1.5}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
        lines.push(`<line x1="${w - inset}" y1="1.5" x2="${w - inset}" y2="${d - 1.5}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
      } else {
        lines.push(`<line x1="1.5" y1="${inset}" x2="${w - 1.5}" y2="${inset}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
        lines.push(`<line x1="1.5" y1="${d - inset}" x2="${w - 1.5}" y2="${d - inset}" stroke="${stroke}" stroke-width="0.9" opacity="0.45"/>`);
      }
    }

    for (let i = 1; i < steps; i++) {
      const pos = (longLen / steps) * i;
      if (alongY) {
        lines.push(`<line x1="1.5" y1="${pos}" x2="${w - 1.5}" y2="${pos}" stroke="${stroke}" stroke-width="0.9" opacity="0.6"/>`);
      } else {
        lines.push(`<line x1="${pos}" y1="1.5" x2="${pos}" y2="${d - 1.5}" stroke="${stroke}" stroke-width="0.9" opacity="0.6"/>`);
      }
    }

    const rStart = Math.max(1.8, Math.min(3.2, shortLen * 0.05));
    const head = Math.max(3.5, Math.min(7, shortLen * 0.14));
    let arrowSvg = '';
    if (alongY) {
      const cx = w / 2;
      const yStart = d * 0.86;
      const yEnd = d * 0.14;
      arrowSvg =
        `<circle cx="${cx}" cy="${yStart}" r="${rStart}" fill="${stroke}"/>` +
        `<line x1="${cx}" y1="${yStart}" x2="${cx}" y2="${yEnd}" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M ${cx - head} ${yEnd + head} L ${cx} ${yEnd} L ${cx + head} ${yEnd + head}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      const cy = d / 2;
      const xStart = w * 0.14;
      const xEnd = w * 0.86;
      arrowSvg =
        `<circle cx="${xStart}" cy="${cy}" r="${rStart}" fill="${stroke}"/>` +
        `<line x1="${xStart}" y1="${cy}" x2="${xEnd}" y2="${cy}" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M ${xEnd - head} ${cy - head} L ${xEnd} ${cy} L ${xEnd - head} ${cy + head}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    return [svgBox(w, d, fill, stroke, 2), ...lines, arrowSvg].join('');
  }

  function drawStraightStairsCanvas(ctx, w, d, fill, stroke) {
    canvasBox(ctx, w, d, fill, stroke, 2);
    const alongY = d >= w;
    const longLen = alongY ? d : w;
    const shortLen = alongY ? w : d;
    const maxSteps = longLen < 50 ? 7 : 12;
    const steps = Math.max(5, Math.min(maxSteps, Math.round((longLen / Math.max(8, shortLen)) * 4)));

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.9;
    if (shortLen >= 18) {
      const inset = Math.max(1.8, shortLen * 0.07);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      if (alongY) {
        ctx.moveTo(inset, 1.5);
        ctx.lineTo(inset, d - 1.5);
        ctx.moveTo(w - inset, 1.5);
        ctx.lineTo(w - inset, d - 1.5);
      } else {
        ctx.moveTo(1.5, inset);
        ctx.lineTo(w - 1.5, inset);
        ctx.moveTo(1.5, d - inset);
        ctx.lineTo(w - 1.5, d - inset);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 1; i < steps; i++) {
      const pos = (longLen / steps) * i;
      if (alongY) {
        ctx.moveTo(1.5, pos);
        ctx.lineTo(w - 1.5, pos);
      } else {
        ctx.moveTo(pos, 1.5);
        ctx.lineTo(pos, d - 1.5);
      }
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const rStart = Math.max(1.8, Math.min(3.2, shortLen * 0.05));
    const head = Math.max(3.5, Math.min(7, shortLen * 0.14));

    if (alongY) {
      const cx = w / 2;
      const yStart = d * 0.86;
      const yEnd = d * 0.14;
      ctx.beginPath();
      ctx.arc(cx, yStart, rStart, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, yStart);
      ctx.lineTo(cx, yEnd);
      ctx.moveTo(cx - head, yEnd + head);
      ctx.lineTo(cx, yEnd);
      ctx.lineTo(cx + head, yEnd + head);
      ctx.stroke();
    } else {
      const cy = d / 2;
      const xStart = w * 0.14;
      const xEnd = w * 0.86;
      ctx.beginPath();
      ctx.arc(xStart, cy, rStart, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xStart, cy);
      ctx.lineTo(xEnd, cy);
      ctx.moveTo(xEnd - head, cy - head);
      ctx.lineTo(xEnd, cy);
      ctx.lineTo(xEnd - head, cy + head);
      ctx.stroke();
    }
    ctx.restore();
  }

  // L型转角楼梯（下段由下向上进左上平台，右转上行向右）
  function drawLStairsSvg(w, d, fill, stroke) {
    const runW = Math.max(6, Math.min(w, d) * 0.48);
    const n1 = d < 50 ? 3 : 5;
    const n2 = w < 50 ? 3 : 5;
    const lowerLen = Math.max(2, d - 0.75 - runW);
    const upperLen = Math.max(2, w - 0.75 - runW);
    const lines = [];

    lines.push(`<line x1="0.75" y1="${runW}" x2="${runW}" y2="${runW}" stroke="${stroke}" stroke-width="1" opacity="0.65"/>`);
    lines.push(`<line x1="${runW}" y1="0.75" x2="${runW}" y2="${runW}" stroke="${stroke}" stroke-width="1" opacity="0.65"/>`);

    for (let i = 1; i < n1; i++) {
      const y = runW + (lowerLen / n1) * i;
      lines.push(`<line x1="1.2" y1="${y}" x2="${runW - 0.8}" y2="${y}" stroke="${stroke}" stroke-width="0.9" opacity="0.58"/>`);
    }
    for (let j = 1; j < n2; j++) {
      const x = runW + (upperLen / n2) * j;
      lines.push(`<line x1="${x}" y1="1.2" x2="${x}" y2="${runW - 0.8}" stroke="${stroke}" stroke-width="0.9" opacity="0.58"/>`);
    }

    const pad = Math.max(4, Math.min(12, runW * 0.2));
    const ax = runW / 2;
    const ay = runW / 2;
    const startY = Math.max(ay + 4, d - pad);
    const endX = Math.max(ax + 4, w - pad);
    const rStart = Math.max(1.8, Math.min(3, runW * 0.06));
    const head = Math.max(3.2, Math.min(6.5, runW * 0.14));

    const lPath = `M 0.75 0.75 L ${w - 0.75} 0.75 L ${w - 0.75} ${runW} L ${runW} ${runW} L ${runW} ${d - 0.75} L 0.75 ${d - 0.75} Z`;
    return [
      `<rect x="0.75" y="0.75" width="${Math.max(1, w - 1.5)}" height="${Math.max(1, d - 1.5)}" rx="2" fill="none" stroke="${stroke}" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.3"/>`,
      `<path d="${lPath}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`,
      ...lines,
      `<circle cx="${ax}" cy="${startY}" r="${rStart}" fill="${stroke}"/>`,
      `<path d="M ${ax} ${startY} L ${ax} ${ay} L ${endX} ${ay}" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="M ${endX - head} ${ay - head} L ${endX} ${ay} L ${endX - head} ${ay + head}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    ].join('');
  }

  function drawLStairsCanvas(ctx, w, d, fill, stroke) {
    const runW = Math.max(6, Math.min(w, d) * 0.48);
    const n1 = d < 50 ? 3 : 5;
    const n2 = w < 50 ? 3 : 5;
    const lowerLen = Math.max(2, d - 0.75 - runW);
    const upperLen = Math.max(2, w - 0.75 - runW);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(0.75, 0.75, Math.max(1, w - 1.5), Math.max(1, d - 1.5));
    ctx.setLineDash([]);

    ctx.globalAlpha = 1;
    ctx.fillStyle = fill;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0.75, 0.75);
    ctx.lineTo(w - 0.75, 0.75);
    ctx.lineTo(w - 0.75, runW);
    ctx.lineTo(runW, runW);
    ctx.lineTo(runW, d - 0.75);
    ctx.lineTo(0.75, d - 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0.75, runW);
    ctx.lineTo(runW, runW);
    ctx.moveTo(runW, 0.75);
    ctx.lineTo(runW, runW);
    for (let i = 1; i < n1; i++) {
      const y = runW + (lowerLen / n1) * i;
      ctx.moveTo(1.2, y);
      ctx.lineTo(runW - 0.8, y);
    }
    for (let j = 1; j < n2; j++) {
      const x = runW + (upperLen / n2) * j;
      ctx.moveTo(x, 1.2);
      ctx.lineTo(x, runW - 0.8);
    }
    ctx.stroke();

    const pad = Math.max(4, Math.min(12, runW * 0.2));
    const ax = runW / 2;
    const ay = runW / 2;
    const startY = Math.max(ay + 4, d - pad);
    const endX = Math.max(ax + 4, w - pad);
    const rStart = Math.max(1.8, Math.min(3, runW * 0.06));
    const head = Math.max(3.2, Math.min(6.5, runW * 0.14));

    ctx.globalAlpha = 1;
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(ax, startY, rStart, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, startY);
    ctx.lineTo(ax, ay);
    ctx.lineTo(endX, ay);
    ctx.moveTo(endX - head, ay - head);
    ctx.lineTo(endX, ay);
    ctx.lineTo(endX - head, ay + head);
    ctx.stroke();
    ctx.restore();
  }

  // 墙边门口标记（图标栏缩略示意：墙线断点 + 门扇与开启弧）
  function drawWallDoorIconSvg(w, d, fill, stroke) {
    const wallY = Math.max(4, d * 0.2);
    const arcR = Math.min(w * 0.68, d - wallY - 2);
    const sx = (w - arcR) / 2;
    return [
      `<line x1="1" y1="${wallY}" x2="${sx}" y2="${wallY}" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>`,
      `<line x1="${sx + arcR}" y1="${wallY}" x2="${w - 1}" y2="${wallY}" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>`,
      `<line x1="${sx}" y1="${wallY}" x2="${sx}" y2="${wallY + arcR}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`,
      `<path d="M ${sx} ${wallY + arcR} A ${arcR} ${arcR} 0 0 0 ${sx + arcR} ${wallY}" fill="${fill}" fill-opacity="0.45" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="3 2"/>`
    ].join('');
  }

  // 墙边窗户标记（图标栏缩略示意：墙线断口 + 浅蓝玻璃双实线窗框）
  function drawWallWindowIconSvg(w, d, fill, stroke) {
    const midY = d / 2;
    const winW = w * 0.68;
    const sx = (w - winW) / 2;
    const ex = sx + winW;
    const halfT = Math.max(2.6, Math.min(4.2, d * 0.24));
    return [
      `<line x1="1" y1="${midY}" x2="${sx}" y2="${midY}" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>`,
      `<line x1="${ex}" y1="${midY}" x2="${w - 1}" y2="${midY}" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>`,
      `<rect x="${sx}" y="${midY - halfT}" width="${winW}" height="${halfT * 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`,
      `<line x1="${sx}" y1="${midY}" x2="${ex}" y2="${midY}" stroke="${stroke}" stroke-width="1"/>`
    ].join('');
  }

  // 文字备注图标
  function drawNoteIconSvg(w, d, fill, stroke) {
    const bw = Math.max(12, w - 4);
    const bh = Math.max(10, d - 6);
    const x = (w - bw) / 2;
    const y = (d - bh) / 2;
    return [
      `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`,
      `<line x1="${x + 4}" y1="${y + bh * 0.36}" x2="${x + bw - 4}" y2="${y + bh * 0.36}" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/>`,
      `<line x1="${x + 4}" y1="${y + bh * 0.66}" x2="${x + bw * 0.72}" y2="${y + bh * 0.66}" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>`
    ].join('');
  }

  // 通用简约家具（茶几、电视柜、餐桌、冰箱、书柜、床头柜）
  function drawSimpleSvg(w, d, fill, stroke, variant) {
    if (variant === 'fridge') {
      return [
        svgBox(w, d, fill, stroke, 3),
        `<line x1="3" y1="${d - 6}" x2="${w - 3}" y2="${d - 6}" stroke="${stroke}" stroke-width="1.4"/>`,
        `<circle cx="${w * 0.2}" cy="${d * 0.3}" r="2.2" fill="${stroke}" opacity="0.5"/>`
      ].join('');
    }
    if (variant === 'table') {
      return [
        svgBox(w, d, fill, stroke, 3),
        `<rect x="5" y="5" width="${Math.max(1, w - 10)}" height="${Math.max(1, d - 10)}" rx="2" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.4"/>`
      ].join('');
    }
    if (variant === 'tv') {
      return [
        svgBox(w, d, fill, stroke, 2),
        `<rect x="${w * 0.16}" y="${d * 0.25}" width="${w * 0.68}" height="5" rx="1.5" fill="${stroke}" opacity="0.72"/>`
      ].join('');
    }
    return svgBox(w, d, fill, stroke, 2);
  }

  function drawSimpleCanvas(ctx, w, d, fill, stroke, variant) {
    canvasBox(ctx, w, d, fill, stroke, variant === 'table' || variant === 'fridge' ? 3 : 2);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    if (variant === 'fridge') {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(3, d - 6);
      ctx.lineTo(w - 3, d - 6);
      ctx.stroke();
    } else if (variant === 'tv') {
      ctx.globalAlpha = 0.72;
      ctx.fillRect(w * 0.16, d * 0.25, w * 0.68, 5);
    } else if (variant === 'table') {
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(5, 5, Math.max(1, w - 10), Math.max(1, d - 10));
    }
    ctx.restore();
  }

  const FURNITURE_CATALOG = [
    // 结构（墙体、楼梯、门窗、屏风）
    {
      id: 'interior-wall',
      name: '室内隔墙',
      category: 'structure',
      categories: ['structure', 'bedroom', 'study', 'living', 'bath'],
      w: 200, d: 12, h: 280,
      matchRoomHeight: true,
      fill: '#cbd5e1', stroke: '#334155',
      presets: [
        { label: '200×12 (通顶隔墙)', w: 200, d: 12, h: 'room' },
        { label: '150×12 (短隔墙)', w: 150, d: 12, h: 'room' },
        { label: '120×15 (半高矮墙 1.2m)', w: 120, d: 15, h: 120 },
        { label: '300×20 (加厚实体墙)', w: 300, d: 20, h: 'room' }
      ],
      drawSvg: drawInteriorWallSvg,
      drawCanvas: drawInteriorWallCanvas
    },
    {
      id: 'stairs-straight',
      name: '直跑楼梯',
      category: 'structure',
      categories: ['structure', 'living', 'bedroom', 'study'],
      w: 100, d: 240, h: 280,
      matchRoomHeight: true,
      fill: '#fffbeb', stroke: '#b45309',
      presets: [
        { label: '100×240 (标准直梯)', w: 100, d: 240, h: 'room' },
        { label: '90×200 (紧凑直梯)', w: 90, d: 200, h: 'room' },
        { label: '120×280 (宽敞直梯)', w: 120, d: 280, h: 'room' },
        { label: '90×180 (阁楼短梯)', w: 90, d: 180, h: 220 }
      ],
      drawSvg: drawStraightStairsSvg,
      drawCanvas: drawStraightStairsCanvas
    },
    {
      id: 'stairs-l',
      name: 'L型楼梯',
      category: 'structure',
      categories: ['structure', 'living', 'bedroom', 'study'],
      w: 180, d: 200, h: 280,
      matchRoomHeight: true,
      fill: '#fffbeb', stroke: '#b45309',
      presets: [
        { label: '180×200 (标准L梯)', w: 180, d: 200, h: 'room' },
        { label: '160×180 (紧凑L梯)', w: 160, d: 180, h: 'room' },
        { label: '200×240 (宽敞L梯)', w: 200, d: 240, h: 'room' }
      ],
      drawSvg: drawLStairsSvg,
      drawCanvas: drawLStairsCanvas
    },

    // 卧室
    {
      id: 'bed-double',
      name: '双人床',
      category: 'bedroom',
      w: 180, d: 200, h: 100,
      fill: '#eef2ff', stroke: '#4338ca',
      presets: [
        { label: '1.8m床 180×200', w: 180, d: 200, h: 100 },
        { label: '1.5m床 150×200', w: 150, d: 200, h: 100 },
        { label: '2.0m床 200×200', w: 200, d: 200, h: 100 }
      ],
      drawSvg: (w, d, fill, stroke) => drawBedSvg(w, d, fill, stroke, 2),
      drawCanvas: (ctx, w, d, fill, stroke) => drawBedCanvas(ctx, w, d, fill, stroke, 2)
    },
    {
      id: 'bed-queen',
      name: '标准床',
      category: 'bedroom',
      w: 150, d: 200, h: 100,
      fill: '#f0f5ff', stroke: '#3b82f6',
      presets: [
        { label: '150×200', w: 150, d: 200, h: 100 },
        { label: '150×190', w: 150, d: 190, h: 100 },
        { label: '180×200', w: 180, d: 200, h: 100 }
      ],
      drawSvg: (w, d, fill, stroke) => drawBedSvg(w, d, fill, stroke, 2),
      drawCanvas: (ctx, w, d, fill, stroke) => drawBedCanvas(ctx, w, d, fill, stroke, 2)
    },
    {
      id: 'bed-single',
      name: '单人床',
      category: 'bedroom',
      w: 120, d: 200, h: 95,
      fill: '#ecfeff', stroke: '#0891b2',
      presets: [
        { label: '120×200', w: 120, d: 200, h: 95 },
        { label: '100×200', w: 100, d: 200, h: 95 },
        { label: '90×190', w: 90, d: 190, h: 95 }
      ],
      drawSvg: (w, d, fill, stroke) => drawBedSvg(w, d, fill, stroke, 1),
      drawCanvas: (ctx, w, d, fill, stroke) => drawBedCanvas(ctx, w, d, fill, stroke, 1)
    },
    {
      id: 'nightstand',
      name: '床头柜',
      category: 'bedroom',
      w: 50, d: 45, h: 55,
      fill: '#fef3c7', stroke: '#b45309',
      presets: [
        { label: '50×45', w: 50, d: 45, h: 55 },
        { label: '40×40', w: 40, d: 40, h: 50 },
        { label: '60×45', w: 60, d: 45, h: 55 }
      ],
      drawSvg: (w, d, fill, stroke) => drawSimpleSvg(w, d, fill, stroke, 'table'),
      drawCanvas: (ctx, w, d, fill, stroke) => drawSimpleCanvas(ctx, w, d, fill, stroke, 'table')
    },
    {
      id: 'wardrobe',
      name: '大衣柜',
      category: 'bedroom',
      w: 200, d: 60, h: 240,
      fill: '#f5f0e6', stroke: '#785a3a',
      presets: [
        { label: '200×60×240', w: 200, d: 60, h: 240 },
        { label: '160×60×220', w: 160, d: 60, h: 220 },
        { label: '240×60×240', w: 240, d: 60, h: 240 }
      ],
      drawSvg: drawWardrobeSvg,
      drawCanvas: drawWardrobeCanvas
    },
    {
      id: 'vanity-desk',
      name: '梳妆台',
      category: 'bedroom',
      w: 100, d: 45, h: 75,
      fill: '#fdf2f8', stroke: '#be185d',
      presets: [
        { label: '100×45', w: 100, d: 45, h: 75 },
        { label: '80×45', w: 80, d: 45, h: 75 },
        { label: '120×45', w: 120, d: 45, h: 75 }
      ],
      drawSvg: (w, d, fill, stroke) => drawDeskSvg(w, d, fill, stroke, false),
      drawCanvas: (ctx, w, d, fill, stroke) => drawDeskCanvas(ctx, w, d, fill, stroke, false)
    },
    {
      id: 'swing-door',
      name: '平开门扇',
      category: 'bedroom',
      w: 85, d: 85, h: 210,
      fill: '#f3f4f6', stroke: '#4b5563',
      presets: [
        { label: '85×85 (卧室门)', w: 85, d: 85, h: 210 },
        { label: '75×75 (卫浴门)', w: 75, d: 75, h: 210 },
        { label: '95×95 (入户门)', w: 95, d: 95, h: 215 }
      ],
      drawSvg: drawDoorSvg,
      drawCanvas: drawDoorCanvas
    },

    // 书房
    {
      id: 'desk',
      name: '书桌',
      category: 'study',
      w: 140, d: 65, h: 75,
      fill: '#fefce8', stroke: '#a16207',
      presets: [
        { label: '140×65', w: 140, d: 65, h: 75 },
        { label: '120×60', w: 120, d: 60, h: 75 },
        { label: '160×75', w: 160, d: 75, h: 75 }
      ],
      drawSvg: (w, d, fill, stroke) => drawDeskSvg(w, d, fill, stroke, true),
      drawCanvas: (ctx, w, d, fill, stroke) => drawDeskCanvas(ctx, w, d, fill, stroke, true)
    },
    {
      id: 'office-chair',
      name: '办公椅',
      category: 'study',
      w: 60, d: 60, h: 95,
      fill: '#f3f4f6', stroke: '#374151',
      presets: [
        { label: '60×60', w: 60, d: 60, h: 95 },
        { label: '55×55', w: 55, d: 55, h: 95 },
        { label: '68×68', w: 68, d: 68, h: 100 }
      ],
      drawSvg: (w, d, fill, stroke) => drawChairSvg(w, d, fill, stroke, true),
      drawCanvas: (ctx, w, d, fill, stroke) => drawChairCanvas(ctx, w, d, fill, stroke, true)
    },
    {
      id: 'bookcase',
      name: '书柜',
      category: 'study',
      w: 120, d: 35, h: 200,
      fill: '#f5f0e6', stroke: '#854d0e',
      presets: [
        { label: '120×35×200', w: 120, d: 35, h: 200 },
        { label: '80×35×200', w: 80, d: 35, h: 200 },
        { label: '160×40×210', w: 160, d: 40, h: 210 }
      ],
      drawSvg: drawWardrobeSvg,
      drawCanvas: drawWardrobeCanvas
    },

    // 客餐
    {
      id: 'sofa',
      name: '三人沙发',
      category: 'living',
      w: 220, d: 95, h: 85,
      fill: '#ecfdf5', stroke: '#047857',
      presets: [
        { label: '220×95', w: 220, d: 95, h: 85 },
        { label: '180×90', w: 180, d: 90, h: 85 },
        { label: '260×100', w: 260, d: 100, h: 85 }
      ],
      drawSvg: drawSofaSvg,
      drawCanvas: drawSofaCanvas
    },
    {
      id: 'coffee-table',
      name: '茶几',
      category: 'living',
      w: 120, d: 60, h: 45,
      fill: '#fffbeb', stroke: '#92400e',
      presets: [
        { label: '120×60', w: 120, d: 60, h: 45 },
        { label: '100×55', w: 100, d: 55, h: 45 },
        { label: '130×70', w: 130, d: 70, h: 45 }
      ],
      drawSvg: (w, d, fill, stroke) => drawSimpleSvg(w, d, fill, stroke, 'table'),
      drawCanvas: (ctx, w, d, fill, stroke) => drawSimpleCanvas(ctx, w, d, fill, stroke, 'table')
    },
    {
      id: 'tv-stand',
      name: '电视柜',
      category: 'living',
      w: 200, d: 45, h: 50,
      fill: '#f5f5f4', stroke: '#57534e',
      presets: [
        { label: '200×45', w: 200, d: 45, h: 50 },
        { label: '160×40', w: 160, d: 40, h: 50 },
        { label: '240×45', w: 240, d: 45, h: 50 }
      ],
      drawSvg: (w, d, fill, stroke) => drawSimpleSvg(w, d, fill, stroke, 'tv'),
      drawCanvas: (ctx, w, d, fill, stroke) => drawSimpleCanvas(ctx, w, d, fill, stroke, 'tv')
    },
    {
      id: 'dining-table',
      name: '餐桌',
      category: 'living',
      w: 140, d: 80, h: 75,
      fill: '#fff7ed', stroke: '#c2410c',
      presets: [
        { label: '140×80 (4人)', w: 140, d: 80, h: 75 },
        { label: '120×75 (4人)', w: 120, d: 75, h: 75 },
        { label: '160×85 (6人)', w: 160, d: 85, h: 75 }
      ],
      drawSvg: (w, d, fill, stroke) => drawSimpleSvg(w, d, fill, stroke, 'table'),
      drawCanvas: (ctx, w, d, fill, stroke) => drawSimpleCanvas(ctx, w, d, fill, stroke, 'table')
    },
    {
      id: 'dining-chair',
      name: '餐椅',
      category: 'living',
      w: 48, d: 50, h: 82,
      fill: '#ffedd5', stroke: '#9a3412',
      presets: [
        { label: '48×50', w: 48, d: 50, h: 82 },
        { label: '45×45', w: 45, d: 45, h: 80 },
        { label: '52×52', w: 52, d: 52, h: 85 }
      ],
      drawSvg: (w, d, fill, stroke) => drawChairSvg(w, d, fill, stroke, false),
      drawCanvas: (ctx, w, d, fill, stroke) => drawChairCanvas(ctx, w, d, fill, stroke, false)
    },
    {
      id: 'fridge',
      name: '冰箱',
      category: 'living',
      w: 70, d: 70, h: 185,
      fill: '#f1f5f9', stroke: '#475569',
      presets: [
        { label: '70×70 (三门)', w: 70, d: 70, h: 185 },
        { label: '60×65 (双门)', w: 60, d: 65, h: 175 },
        { label: '90×72 (对开)', w: 90, d: 72, h: 185 }
      ],
      drawSvg: (w, d, fill, stroke) => drawSimpleSvg(w, d, fill, stroke, 'fridge'),
      drawCanvas: (ctx, w, d, fill, stroke) => drawSimpleCanvas(ctx, w, d, fill, stroke, 'fridge')
    },

    // 卫浴
    {
      id: 'toilet',
      name: '马桶',
      category: 'bath',
      w: 40, d: 70, h: 78,
      fill: '#f0f9ff', stroke: '#0369a1',
      presets: [
        { label: '40×70', w: 40, d: 70, h: 78 },
        { label: '38×68', w: 38, d: 68, h: 76 },
        { label: '42×72', w: 42, d: 72, h: 80 }
      ],
      drawSvg: drawToiletSvg,
      drawCanvas: drawToiletCanvas
    },
    {
      id: 'bathroom-vanity',
      name: '浴室柜',
      category: 'bath',
      w: 80, d: 50, h: 85,
      fill: '#e0f2fe', stroke: '#0284c7',
      presets: [
        { label: '80×50', w: 80, d: 50, h: 85 },
        { label: '60×48', w: 60, d: 48, h: 85 },
        { label: '100×50', w: 100, d: 50, h: 85 }
      ],
      drawSvg: drawVanitySvg,
      drawCanvas: drawVanityCanvas
    },
    {
      id: 'wall-door',
      name: '门口标记',
      kind: 'opening',
      category: 'bath',
      categories: ['structure', 'bedroom', 'study', 'living', 'bath'],
      w: 80, d: 80, h: 210,
      fill: '#e0f2fe', stroke: '#0284c7',
      presets: [
        { label: '75cm (卫浴门)', w: 75 },
        { label: '85cm (卧室门)', w: 85 },
        { label: '100cm (大门口)', w: 100 }
      ],
      drawSvg: drawWallDoorIconSvg
    },
    {
      id: 'wall-window',
      name: '窗户标记',
      kind: 'window',
      category: 'bedroom',
      categories: ['structure', 'bedroom', 'study', 'living', 'bath'],
      w: 150, d: 24, h: 140,
      fill: '#e0f2fe', stroke: '#0284c7',
      presets: [
        { label: '60cm (卫浴窗)', w: 60 },
        { label: '120cm (小窗)', w: 120 },
        { label: '150cm (标准窗)', w: 150 },
        { label: '200cm (落地大窗)', w: 200 }
      ],
      drawSvg: drawWallWindowIconSvg
    },
    {
      id: 'text-note',
      name: '文字备注',
      kind: 'note',
      category: 'bath',
      categories: ['structure', 'bedroom', 'study', 'living', 'bath'],
      w: 70, d: 44, h: 10,
      fill: '#fffbeb', stroke: '#d97706',
      drawSvg: drawNoteIconSvg
    },
    {
      id: 'partition-screen',
      name: '屏风隔断',
      category: 'bath',
      categories: ['structure', 'bath', 'living', 'bedroom'],
      w: 90, d: 6, h: 200,
      fill: '#e0f2fe', stroke: '#0e7490',
      presets: [
        { label: '90×6 (淋浴玻璃隔断)', w: 90, d: 6, h: 200 },
        { label: '120×8 (客厅屏风)', w: 120, d: 8, h: 210 },
        { label: '60×6 (窄边挡水屏风)', w: 60, d: 6, h: 200 }
      ],
      drawSvg: drawPartitionSvg,
      drawCanvas: drawPartitionCanvas
    },
    {
      id: 'shower',
      name: '淋浴房',
      category: 'bath',
      w: 90, d: 90, h: 210,
      fill: '#e0f7fa', stroke: '#0e7490',
      presets: [
        { label: '90×90', w: 90, d: 90, h: 210 },
        { label: '80×80', w: 80, d: 80, h: 210 },
        { label: '100×100', w: 100, d: 100, h: 210 }
      ],
      drawSvg: drawShowerSvg,
      drawCanvas: drawShowerCanvas
    },
    {
      id: 'showerhead',
      name: '花洒',
      category: 'bath',
      w: 60, d: 60, h: 210,
      fill: '#ecfeff', stroke: '#0891b2',
      presets: [
        { label: '60×60 (标准淋浴位)', w: 60, d: 60, h: 210 },
        { label: '40×40 (紧凑花洒位)', w: 40, d: 40, h: 210 },
        { label: '80×80 (宽敞淋浴位)', w: 80, d: 80, h: 210 }
      ],
      drawSvg: drawShowerheadSvg,
      drawCanvas: drawShowerheadCanvas
    },
    {
      id: 'bathtub',
      name: '浴缸',
      category: 'bath',
      w: 170, d: 75, h: 60,
      fill: '#eff6ff', stroke: '#1d4ed8',
      presets: [
        { label: '170×75', w: 170, d: 75, h: 60 },
        { label: '150×75', w: 150, d: 75, h: 60 },
        { label: '180×80', w: 180, d: 80, h: 60 }
      ],
      drawSvg: drawBathtubSvg,
      drawCanvas: drawBathtubCanvas
    },
    {
      id: 'washer',
      name: '洗衣机',
      category: 'bath',
      w: 60, d: 60, h: 85,
      fill: '#f8fafc', stroke: '#475569',
      presets: [
        { label: '60×60', w: 60, d: 60, h: 85 },
        { label: '60×55 (超薄)', w: 60, d: 55, h: 85 },
        { label: '60×65', w: 60, d: 65, h: 85 }
      ],
      drawSvg: drawWasherSvg,
      drawCanvas: drawWasherCanvas
    }
  ];

  const CATALOG_MAP = {};
  FURNITURE_CATALOG.forEach((item) => {
    CATALOG_MAP[item.id] = item;
  });

  function getById(id) {
    return CATALOG_MAP[id] || null;
  }

  global.RoomLayout = global.RoomLayout || {};
  global.RoomLayout.Catalog = {
    CATEGORIES,
    FURNITURE_CATALOG,
    getById
  };
})(typeof window !== 'undefined' ? window : globalThis);
