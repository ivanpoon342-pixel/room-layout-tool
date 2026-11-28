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

// 11. 窗户几何限位与不误报撞门
{
  const win = { id: 'win1', type: 'window', name: '窗户', wall: 'top', offset: 100, width: 150, sillH: 90, openH: 140 };
  const geom = Geometry.getOpeningGeometry(win, room);
  assert.equal(geom.type, 'window');
  assert.equal(geom.swing, 'none');
  assert.equal(geom.swingBox, null);
  assert.equal(geom.sillH, 90);
  assert.equal(geom.topH, 230);

  // 低层高房间应自动压缩窗高使其不越出天花板
  const lowRoom = { w: 400, d: 340, h: 200 };
  const geomLow = Geometry.getOpeningGeometry(win, lowRoom);
  assert.equal(geomLow.topH, 200);

  // 窗户紧贴家具不应触发 door_blocked 报警
  const showerNearWin = { id: 'sh2', name: '淋浴房', x: 100, y: 0, w: 90, d: 90, h: 210, rotation: 0 };
  const resWin = Geometry.analyzeLayout(room, [showerNearWin], [win]);
  assert.ok(!resWin.warnings.some((w) => w.type === 'door_blocked'), '窗户不应触发内开门扇遮挡报警');
}

// 12. 室内隔墙超长/薄墙拖拽缩放与楼梯布局占位校验
{
  const bigRoom = { w: 900, d: 600, h: 280 };
  const wall = { id: 'iw1', name: '室内隔墙', x: 50, y: 120, w: 200, d: 12, h: 280, rotation: 0 };
  const stretched = Geometry.resizeFromHandle(wall, 'e', 750, 126, bigRoom, [], true, 6);
  assert.equal(stretched.w, 700, '室内隔墙应支持拉长超过 600cm');
  assert.equal(stretched.d, 12);

  const thinned = Geometry.resizeFromHandle(wall, 's', 150, 126, bigRoom, [], true, 6);
  assert.equal(thinned.d, 6, '室内隔墙厚度可缩窄至 6cm');

  const wall90 = { id: 'iw2', name: '室内隔墙', x: 200, y: 40, w: 200, d: 12, h: 280, rotation: 90 };
  const stretched90 = Geometry.resizeFromHandle(wall90, 's', 206, 360, bigRoom, [], true, 6);
  assert.equal(stretched90.w, 320, '旋转 90° 的室内隔墙纵向拉伸应更新原长度 w');
  assert.equal(stretched90.d, 12);

  const straightStairs = { id: 'st1', name: '直跑楼梯', x: 0, y: 0, w: 100, d: 240, h: 280, rotation: 0 };
  const lStairs = { id: 'st2', name: 'L型楼梯', x: 300, y: 0, w: 180, d: 200, h: 280, rotation: 0 };
  const resStairs = Geometry.analyzeLayout(bigRoom, [straightStairs, lStairs]);
  assert.equal(resStairs.warnings.length, 0, '靠墙贴合且间距充足的楼梯不应产生误报');
}

// 13. 任意位置门口（外墙吸附、室内隔墙开洞、自由放置与扇区防误报）
{
  const bigRoom = { w: 600, d: 450, h: 280 };
  const vWall = { id: 'iw1', catalogId: 'interior-wall', name: '室内隔墙', x: 250, y: 50, w: 12, d: 240, h: 280, rotation: 0 };

  // 靠近外墙应吸附外墙
  const nearTop = Geometry.snapDoorPosition(200, 6, 80, bigRoom, [vWall], 'h', false);
  assert.equal(nearTop.wall, 'top');

  // 靠近竖直室内隔墙应自动吸附为竖直室内门
  const onWall = Geometry.snapDoorPosition(258, 160, 80, bigRoom, [vWall], 'h', false);
  assert.equal(onWall.wall, 'free');
  assert.equal(onWall.orientation, 'v');
  assert.equal(onWall.x, 256);

  // 室内空旷处可任意放置
  const freePos = Geometry.snapDoorPosition(420, 220, 80, bigRoom, [vWall], 'h', false);
  assert.equal(freePos.wall, 'free');
  assert.equal(freePos.orientation, 'h');
  assert.equal(freePos.y, 220);

  // 开在室内隔墙上的门不应被自身隔墙误报阻挡
  const hostedDoor = { id: 'op-host', type: 'door', name: '隔墙门', wall: 'free', x: 256, y: 120, orientation: 'v', width: 80, swing: 'in', hinge: 'start' };
  const resHost = Geometry.analyzeLayout(bigRoom, [vWall], [hostedDoor]);
  assert.ok(!resHost.warnings.some((w) => w.type === 'door_blocked'), '隔墙上的门不应误报被自身隔墙遮挡');

  // 门扇扫掠区内放入家具应准确预警（含 out 外开侧）
  const chair = { id: 'ch1', name: '餐椅', x: 190, y: 130, w: 50, d: 50, h: 82, rotation: 0 };
  const outDoor = { ...hostedDoor, swing: 'out' };
  const resBlocked = Geometry.analyzeLayout(bigRoom, [vWall, chair], [outDoor]);
  assert.ok(resBlocked.warnings.some((w) => w.type === 'door_blocked'), '自由门扇扫掠区内有家具应准确预警');
}

console.log('ALL GEOMETRY TESTS PASSED (13/13 groups)');
