import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Geometry = require('../js/geometry.js');

const room = { w: 400, d: 340, h: 280 };

// 1. 旋转外接矩形计算
{
  const bed0 = { id: 'b1', name: '双人床', x: 10, y: 20, w: 180, d: 200, h: 100, rotation: 0 };
  const fp0 = Geometry.getFootprint(bed0);
  assert.equal(fp0.w, 180);
  assert.equal(fp0.d, 200);
  assert.equal(fp0.right, 190);
  assert.equal(fp0.bottom, 220);

  const bed90 = { ...bed0, rotation: 90 };
  const fp90 = Geometry.getFootprint(bed90);
  assert.equal(fp90.w, 200);
  assert.equal(fp90.d, 180);
}

// 2. 贴墙摆放（gap <= 2cm）不误报过窄
{
  const bed = { id: 'b1', name: '双人床', x: 0, y: 0, w: 180, d: 200, h: 100, rotation: 0 };
  const res = Geometry.analyzeLayout(room, [bed]);
  assert.equal(res.warnings.length, 0, '靠左上墙角应无任何预警');
  assert.equal(res.narrowLines.length, 0);

  const bed2cm = { id: 'b2', name: '双人床', x: 2, y: 0, w: 180, d: 200, h: 100, rotation: 0 };
  const res2 = Geometry.analyzeLayout(room, [bed2cm]);
  assert.equal(res2.warnings.length, 0, '2cm 贴墙容差内应不报过窄');
}

// 3. 留窄缝（2cm < gap < 60cm）精准标红预警，且家具间不重复报警
{
  const bed = { id: 'b1', name: '双人床', x: 35, y: 0, w: 180, d: 200, h: 100, rotation: 0 };
  const cabinet = { id: 'c1', name: '大衣柜', x: 255, y: 0, w: 60, d: 200, h: 240, rotation: 0 };
  const res = Geometry.analyzeLayout(room, [bed, cabinet]);

  // 应有两条 narrow_gap：bed距左墙35cm；bed与cabinet间距40cm（去重后1条）
  const narrowWarnings = res.warnings.filter((w) => w.type === 'narrow_gap');
  assert.equal(narrowWarnings.length, 2);
  const gaps = narrowWarnings.map((w) => w.gap).sort((a, b) => a - b);
  assert.deepEqual(gaps, [35, 40]);
  assert.equal(res.narrowLines.length, 2);
}

// 4. 越界与超大尺寸标红预警
{
  const bigSofa = { id: 's1', name: '超大沙发', x: 320, y: 20, w: 120, d: 90, h: 85, rotation: 0 };
  const res = Geometry.analyzeLayout(room, [bigSofa]);
  assert.ok(res.warnings.some((w) => w.type === 'out_of_bounds'));
  assert.ok(res.itemIssues.get('s1').has('out_of_bounds'));
}

// 5. 层高不足预警
{
  const lowRoom = { w: 400, d: 340, h: 220 };
  const tallWardrobe = { id: 'w1', name: '大衣柜', x: 0, y: 0, w: 200, d: 60, h: 240, rotation: 0 };
  const res = Geometry.analyzeLayout(lowRoom, [tallWardrobe]);
  assert.ok(res.warnings.some((w) => w.type === 'height_exceeded'));
  assert.ok(res.itemIssues.get('w1').has('height_exceeded'));
}

// 6. 家具重叠与紧邻不误判
{
  const desk = { id: 'd1', name: '书桌', x: 0, y: 0, w: 140, d: 65, h: 75, rotation: 0 };
  const chairFlush = { id: 'ch1', name: '办公椅', x: 140, y: 0, w: 60, d: 60, h: 95, rotation: 0 };
  const resFlush = Geometry.analyzeLayout(room, [desk, chairFlush]);
  assert.equal(resFlush.warnings.length, 0, '紧贴放置不应算作重叠或过窄');

  const chairOverlap = { id: 'ch2', name: '办公椅', x: 120, y: 10, w: 60, d: 60, h: 95, rotation: 0 };
  const resOverlap = Geometry.analyzeLayout(room, [desk, chairOverlap]);
  assert.ok(resOverlap.warnings.some((w) => w.type === 'overlap'));
}

// 7. 磁吸对齐
{
  const other = { id: 'o1', name: '大衣柜', x: 0, y: 0, w: 200, d: 60, h: 240, rotation: 0 };
  const moving = { id: 'm1', name: '床头柜', x: 205, y: 4, w: 50, d: 45, h: 55, rotation: 0 };
  const snapped = Geometry.snapPosition(moving, 205, 4, room, [other], false);
  assert.equal(snapped.x, 200, '应吸附贴合大衣柜右边');
  assert.equal(snapped.y, 0, '应吸附上墙');

  const unsnapped = Geometry.snapPosition(moving, 205, 4, room, [other], true);
  assert.equal(unsnapped.x, 205);
  assert.equal(unsnapped.y, 4);
}

// 8. 智能找空位放置
{
  const bed = { id: 'b1', name: '双人床', x: 0, y: 0, w: 180, d: 200, h: 100, rotation: 0 };
  const pos = Geometry.findSmartPlacePosition(140, 65, room, [bed]);
  assert.ok(pos.x >= 0 && pos.y >= 0);
  const res = Geometry.analyzeLayout(room, [bed, { id: 'd1', name: '书桌', x: pos.x, y: pos.y, w: 140, d: 65, h: 75, rotation: 0 }]);
  assert.ok(!res.warnings.some((w) => w.type === 'overlap'), '智能找位不应与现有家具重叠');
}

// 9. 墙边门口吸附与扇区碰撞校验
{
  const snapBottom = Geometry.snapOpeningToWall(180, 336, 80, room, false);
  assert.equal(snapBottom.wall, 'bottom');
  assert.equal(snapBottom.offset, 140);

  const snapLeft = Geometry.snapOpeningToWall(4, 150, 80, room, false);
  assert.equal(snapLeft.wall, 'left');
  assert.equal(snapLeft.offset, 110);

  const doorIn = { id: 'op1', name: '卫生间门', wall: 'bottom', offset: 160, width: 80, swing: 'in', hinge: 'start' };
  const blockingShower = { id: 'sh1', name: '淋浴房', x: 165, y: 250, w: 90, d: 90, h: 210, rotation: 0 };
  const resBlocked = Geometry.analyzeLayout(room, [blockingShower], [doorIn]);
  assert.ok(resBlocked.warnings.some((w) => w.type === 'door_blocked'));
  assert.ok(resBlocked.openingIssues.get('op1').has('door_blocked'));

  const doorOut = { ...doorIn, swing: 'out' };
  const resOut = Geometry.analyzeLayout(room, [blockingShower], [doorOut]);
  assert.ok(!resOut.warnings.some((w) => w.type === 'door_blocked'), '外开门不应报室内扇区遮挡');
}

// 10. 拖拽四周控制点直接缩放（含旋转状态与磁吸）
{
  const toilet = { id: 't1', name: '马桶', x: 50, y: 50, w: 40, d: 70, h: 78, rotation: 0 };
  const resizedE = Geometry.resizeFromHandle(toilet, 'e', 110, 80, room, [], true, 15);
  assert.equal(resizedE.x, 50);
  assert.equal(resizedE.y, 50);
  assert.equal(resizedE.w, 60);
  assert.equal(resizedE.d, 70);

  // 向左缩小并吸附左墙 0
  const resizedW = Geometry.resizeFromHandle(toilet, 'w', 4, 80, room, [], false, 15);
  assert.equal(resizedW.x, 0);
  assert.equal(resizedW.w, 90);

  // 旋转 90 度后，拖拽下边缘 's' 应改变原始 w（纵向占据）
  const screen90 = { id: 's90', name: '屏风隔断', x: 100, y: 20, w: 90, d: 6, h: 200, rotation: 90 };
  const resizedS = Geometry.resizeFromHandle(screen90, 's', 103, 150, room, [], true, 3);
  assert.equal(resizedS.x, 100);
  assert.equal(resizedS.y, 20);
  assert.equal(resizedS.w, 130, '旋转90度时纵向拉长应同步更新原始长度 w');
  assert.equal(resizedS.d, 6);
}

console.log('ALL GEOMETRY TESTS PASSED (10/10 groups)');
