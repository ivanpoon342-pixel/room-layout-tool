import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
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

console.log('ALL VR VIEWER TESTS PASSED (4/4 groups)');
