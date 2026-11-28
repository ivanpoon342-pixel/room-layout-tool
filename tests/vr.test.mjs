import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../js/geometry.js');
const Viewer3D = require('../js/viewer3d.js');
const VRViewer = require('../js/vr.js');

const room = { w: 400, d: 340, h: 280 };

// 1. 3D 近平面裁剪算法验证
{
  const behind = [
    { cx: -10, cy: 0, cz: -20 },
    { cx: 10, cy: 0, cz: -5 },
    { cx: 10, cy: 10, cz: 5 }
  ];
  assert.equal(VRViewer.clipPolygonNear(behind, 12).length, 0, '完全在近平面后方的多边形应被完整剔除');

  const crossing = [
    { cx: -50, cy: -50, cz: -10 },
    { cx: 50, cy: -50, cz: -10 },
    { cx: 50, cy: 50, cz: 50 },
    { cx: -50, cy: 50, cz: 50 }
  ];
  const clipped = VRViewer.clipPolygonNear(crossing, 12);
  assert.ok(clipped.length >= 4, '跨近平面四边形应被干净裁剪');
  assert.ok(clipped.every((p) => p.cz >= 12 - 1e-6), '裁剪后所有顶点 cz 必须 >= nearCm');
}

// 2. 默认入口站位（门口内侧朝向室内中心）
{
  const camNoDoor = VRViewer.createDefaultVRCamera(room, [], []);
  assert.equal(camNoDoor.eyeZ, 165);
  assert.ok(camNoDoor.x > 0 && camNoDoor.x < room.w);
  assert.ok(camNoDoor.y > 0 && camNoDoor.y < room.d);

  const leftDoor = { id: 'op1', name: '卫生间门', wall: 'left', offset: 120, width: 80, swing: 'in', hinge: 'start' };
  const camAtDoor = VRViewer.createDefaultVRCamera(room, [], [leftDoor]);
  assert.ok(camAtDoor.x < 100, '有左墙门口时应站在左墙门口内侧');
  const centerCamSpace = VRViewer.worldToCamera(room.w / 2, room.d / 2, 165, camAtDoor);
  assert.ok(centerCamSpace.cz > 0, '门口初始视线应朝向房间中央');
}

// 3. 世界坐标转相机坐标方向性检查
{
  const cam = { x: 200, y: 200, eyeZ: 165, yaw: 0, pitch: 0 };
  const front = VRViewer.worldToCamera(200, 100, 165, cam);
  assert.ok(front.cz > 90 && Math.abs(front.cx) < 1e-6, 'yaw=0 时正前方为 -Y 方向');

  const right = VRViewer.worldToCamera(300, 200, 165, cam);
  assert.ok(right.cx > 90 && Math.abs(right.cz) < 1e-6, 'yaw=0 时正右侧为 +X 方向');

  const above = VRViewer.worldToCamera(200, 100, 240, cam);
  assert.ok(above.cy > 70, '更高物体在相机空间 cy > 0');
}

// 4. 走动平移与墙体内侧限位
{
  const cam = { x: 200, y: 200, eyeZ: 165, yaw: 0, pitch: 0 };
  const movedFwd = VRViewer.moveVRCamera(cam, 50, 0, room);
  assert.equal(Math.round(movedFwd.y), 150);

  const clampedWall = VRViewer.moveVRCamera(cam, 500, -500, room);
  assert.equal(clampedWall.x, VRViewer.WALL_MARGIN_CM);
  assert.equal(clampedWall.y, VRViewer.WALL_MARGIN_CM);
}

// 5. 室内隔墙分段实体建模与直跑/L型楼梯逐级升高 3D 建模
{
  const Geometry = globalThis.RoomLayout.Geometry;
  const wall = { id: 'iw1', catalogId: 'interior-wall', name: '室内隔墙', x: 100, y: 0, w: 240, d: 12, h: 280, rotation: 0 };
  const straight = { id: 'st1', catalogId: 'stairs-straight', name: '直跑楼梯', x: 0, y: 0, w: 100, d: 240, h: 280, rotation: 0 };
  const lStair = { id: 'st2', catalogId: 'stairs-l', name: 'L型楼梯', x: 400, y: 0, w: 180, d: 200, h: 280, rotation: 0 };
  const analysis = Geometry.analyzeLayout({ w: 600, d: 400, h: 280 }, [wall, straight, lStair], []);

  const wallBuilt = Viewer3D.buildItemPrimitives(wall, analysis);
  assert.equal(wallBuilt.boxes.length, 3, '240cm 长隔墙应分段为 3 个实体盒以便深度排序');
  assert.ok(wallBuilt.boxes.every((b) => b.alpha === 1), '室内隔墙应为实心不透明');

  const straightBuilt = Viewer3D.buildItemPrimitives(straight, analysis);
  assert.ok(straightBuilt.boxes.length >= 6, '直跑楼梯应生成多级踏步盒');
  const straightTops = straightBuilt.boxes.map((b) => Math.max(...b.faces[0].verts.map((v) => v[2])));
  for (let i = 1; i < straightTops.length; i++) {
    assert.ok(straightTops[i] > straightTops[i - 1], '直跑楼梯各级高度应严格递增');
  }
  assert.ok(Math.abs(straightTops[straightTops.length - 1] - 280) < 1e-6, '直跑楼梯最高级应达到层高');

  const lBuilt = Viewer3D.buildItemPrimitives(lStair, analysis);
  assert.ok(lBuilt.boxes.length >= 7, 'L型楼梯应生成下段+转角平台+上段多级踏步');
  const lTops = lBuilt.boxes.map((b) => Math.max(...b.faces[0].verts.map((v) => v[2])));
  for (let i = 1; i < lTops.length; i++) {
    assert.ok(lTops[i] > lTops[i - 1], 'L型楼梯各级高度应严格递增');
  }
  assert.ok(Math.abs(lTops[lTops.length - 1] - 280) < 1e-6, 'L型楼梯最高级应达到层高');
}

// 6. 室内隔墙门洞切割 3D 实体与仅含自由门口时的 VR 默认站位
{
  const Geometry = globalThis.RoomLayout.Geometry;
  const r = { w: 600, d: 450, h: 280 };
  const wall = { id: 'iw1', catalogId: 'interior-wall', name: '室内隔墙', x: 100, y: 200, w: 300, d: 12, h: 280, rotation: 0 };
  const freeDoor = { id: 'op1', type: 'door', name: '隔墙门', wall: 'free', x: 200, y: 206, orientation: 'h', width: 80, swing: 'in', hinge: 'start', openH: 210 };
  const analysis = Geometry.analyzeLayout(r, [wall], [freeDoor]);

  const built = Viewer3D.buildItemPrimitives(wall, analysis, [freeDoor], r);
  const hasLintel = built.boxes.some((b) => {
    const zs = b.faces[0].verts.map((v) => v[2]);
    const minZ = Math.min(...b.faces[1].verts.map((v) => v[2]));
    return minZ >= 209 && Math.max(...zs) >= 279;
  });
  assert.ok(hasLintel, '室内隔墙在门口上方应保留门楣过梁且下方镂空');

  const camOnlyFree = VRViewer.createDefaultVRCamera(r, [wall], [freeDoor]);
  assert.ok(camOnlyFree.x > 0 && camOnlyFree.x < r.w);
  assert.ok(camOnlyFree.y > 0 && camOnlyFree.y < r.d);
}

console.log('ALL VR VIEWER TESTS PASSED (6/6 groups)');
