import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Layouts = require('../js/layouts.js');

// 1. 旧版 v1 数据无损迁移到草稿区
{
  const v1 = {
    room: { w: 280, d: 220, h: 260 },
    items: [
      { id: 'i1', catalogId: 'shower', name: '淋浴房', w: 90, d: 90, h: 210, x: 0, y: 0, rotation: 0 },
      { id: 'i2', catalogId: 'toilet', name: '马桶', w: 40, d: 70, h: 78, x: 120, y: 0, rotation: 0 }
    ]
  };
  const store = Layouts.migrateFromLegacy(v1);
  assert.equal(store.activeLayoutId, null);
  assert.equal(store.layouts.length, 0);
  assert.equal(store.draft.room.w, 280);
  assert.equal(store.draft.items.length, 2);
}

// 2. 保存厕所布局 -> 新增布局 -> 切回厕所继续编辑 -> 切换不串改引用
{
  const store = Layouts.createEmptyStore();
  const bathRoom = { w: 260, d: 200, h: 260 };
  const bathItems = [
    { id: 'b1', catalogId: 'shower', name: '淋浴房', w: 90, d: 90, h: 210, x: 0, y: 0, rotation: 0 }
  ];
  const bathOpenings = [
    { id: 'o1', name: '卫生间门', wall: 'bottom', offset: 150, width: 75, swing: 'in', hinge: 'start' }
  ];

  // 首次保存为「厕所」
  const saveRes = Layouts.saveCurrentLayout(store, {
    name: '厕所',
    room: bathRoom,
    items: bathItems,
    openings: bathOpenings
  });
  assert.equal(saveRes.created, true);
  assert.equal(saveRes.layout.name, '厕所');
  assert.equal(store.activeLayoutId, saveRes.layout.id);
  const toiletId = saveRes.layout.id;

  // 修改本地数组引用不应污染已保存对象
  bathItems.push({ id: 'mut', catalogId: 'toilet', name: '马桶', w: 40, d: 70, h: 78, x: 100, y: 0, rotation: 0 });
  assert.equal(Layouts.findLayout(store, toiletId).items.length, 1);

  // 点击「+ 新增布局」前把刚加的马桶带入 dirty 回写，然后重置为空白画布
  const newRes = Layouts.createNewLayout(store, bathRoom, bathItems, bathOpenings, true);
  assert.equal(store.activeLayoutId, null);
  assert.equal(newRes.items.length, 0);
  assert.equal(newRes.openings.length, 0);
  assert.equal(Layouts.findLayout(store, toiletId).items.length, 2, '新增前应自动保留当前已保存布局的修改');

  // 在新布局摆放主卧家具并保存为「主卧」
  const bedRoom = { w: 420, d: 360, h: 280 };
  const bedItems = [
    { id: 'm1', catalogId: 'bed-double', name: '双人床', w: 180, d: 200, h: 100, x: 0, y: 0, rotation: 0 }
  ];
  const bedSave = Layouts.saveCurrentLayout(store, {
    name: '主卧',
    room: bedRoom,
    items: bedItems,
    openings: []
  });
  assert.equal(store.layouts.length, 2);
  assert.equal(bedSave.layout.name, '主卧');

  // 切回「厕所」继续编辑
  const switched = Layouts.switchLayout(store, toiletId, bedRoom, bedItems, [], false);
  assert.equal(switched.layout.name, '厕所');
  assert.equal(switched.room.w, 260);
  assert.equal(switched.items.length, 2);
  assert.equal(switched.openings.length, 1);
  assert.equal(switched.openings[0].name, '卫生间门');

  // 继续在「厕所」加一个屏风并再次原地保存
  switched.items.push({
    id: 'scr1',
    catalogId: 'partition-screen',
    name: '屏风隔断',
    w: 90,
    d: 6,
    h: 200,
    x: 90,
    y: 0,
    rotation: 90
  });
  const updateRes = Layouts.saveCurrentLayout(store, {
    room: switched.room,
    items: switched.items,
    openings: switched.openings
  });
  assert.equal(updateRes.created, false);
  assert.equal(updateRes.layout.items.length, 3);
  assert.equal(Layouts.findLayout(store, toiletId).items.length, 3);
}

// 3. 未保存草稿点击「+ 新增布局」或切换时自动存成「方案 1」防丢失
{
  const store = Layouts.createEmptyStore();
  const draftItems = [
    { id: 'd1', catalogId: 'desk', name: '书桌', w: 140, d: 65, h: 75, x: 0, y: 0, rotation: 0 }
  ];
  const res = Layouts.createNewLayout(store, { w: 320, d: 280, h: 280 }, draftItems, [], true);
  assert.equal(res.autoSavedName, '方案 1');
  assert.equal(store.layouts.length, 1);
  assert.equal(store.layouts[0].name, '方案 1');
}

// 4. 重命名与删除切换兜底
{
  const store = Layouts.createEmptyStore();
  const a = Layouts.saveCurrentLayout(store, { name: 'A', room: { w: 300, d: 300, h: 280 }, items: [], openings: [] }).layout;
  store.activeLayoutId = null;
  const b = Layouts.saveCurrentLayout(store, { name: 'B', room: { w: 400, d: 300, h: 280 }, items: [], openings: [] }).layout;

  assert.equal(Layouts.renameLayout(store, a.id, '次卧'), true);
  assert.equal(Layouts.findLayout(store, a.id).name, '次卧');

  const delB = Layouts.deleteLayout(store, b.id);
  assert.equal(delB.switchedTo.id, a.id);
  assert.equal(store.activeLayoutId, a.id);

  const delA = Layouts.deleteLayout(store, a.id);
  assert.equal(delA.switchedTo, null);
  assert.equal(store.activeLayoutId, null);
  assert.equal(store.layouts.length, 0);
}

// 5. 文字备注与家具备注跨布局保存与切换隔离
{
  const store = Layouts.createEmptyStore();
  const roomA = { w: 300, d: 240, h: 280 };
  const itemsA = [
    { id: 's1', catalogId: 'shower', name: '淋浴房', w: 90, d: 90, h: 210, x: 0, y: 0, rotation: 0, note: '外贴防爆膜' }
  ];
  const notesA = [
    { id: 'n1', x: 110, y: 60, text: '预留地漏位置' }
  ];
  const resA = Layouts.saveCurrentLayout(store, { name: '厕所', room: roomA, items: itemsA, openings: [], notes: notesA });
  assert.equal(resA.layout.notes.length, 1);
  assert.equal(resA.layout.items[0].note, '外贴防爆膜');

  const newRes = Layouts.createNewLayout(store, roomA, itemsA, [], false, notesA);
  assert.equal(newRes.notes.length, 0);

  const back = Layouts.switchLayout(store, resA.layout.id, newRes.room, [], [], false, []);
  assert.equal(back.notes.length, 1);
  assert.equal(back.notes[0].text, '预留地漏位置');
  assert.equal(back.items[0].note, '外贴防爆膜');
}

// 6. 窗户标记持久化与向后兼容默认门类型
{
  const openings = Layouts.cloneOpenings([
    { id: 'd1', wall: 'bottom', offset: 20, width: 80 },
    { id: 'w1', type: 'window', name: '卫浴小窗', wall: 'top', offset: 60, width: 60, sillH: 140, openH: 80 }
  ]);
  assert.equal(openings[0].type, 'door');
  assert.equal(openings[0].name, '门口');
  assert.equal(openings[1].type, 'window');
  assert.equal(openings[1].swing, 'none');
  assert.equal(openings[1].sillH, 140);
  assert.equal(openings[1].openH, 80);
}

// 7. 含室内隔墙与楼梯的多布局保存与切换隔离
{
  const store = Layouts.createEmptyStore();
  const duplexRoom = { w: 700, d: 500, h: 280 };
  const duplexItems = [
    { id: 'w1', catalogId: 'interior-wall', name: '室内隔墙', w: 280, d: 12, h: 280, x: 200, y: 0, rotation: 90 },
    { id: 's1', catalogId: 'stairs-straight', name: '直跑楼梯', w: 100, d: 240, h: 280, x: 0, y: 0, rotation: 0 },
    { id: 's2', catalogId: 'stairs-l', name: 'L型楼梯', w: 180, d: 200, h: 280, x: 520, y: 0, rotation: 0 }
  ];
  const saved = Layouts.saveCurrentLayout(store, {
    name: '复式一层',
    room: duplexRoom,
    items: duplexItems,
    openings: []
  });
  assert.equal(saved.layout.items.length, 3);

  const fresh = Layouts.createNewLayout(store, duplexRoom, duplexItems, [], false);
  assert.equal(fresh.items.length, 0);

  const restored = Layouts.switchLayout(store, saved.layout.id, fresh.room, [], [], false);
  assert.equal(restored.items.length, 3);
  assert.equal(restored.items[0].catalogId, 'interior-wall');
  assert.equal(restored.items[1].catalogId, 'stairs-straight');
  assert.equal(restored.items[2].catalogId, 'stairs-l');
}

// 8. 任意位置门口（wall: 'free'）持久化与向后兼容
{
  const store = Layouts.createEmptyStore();
  const room = { w: 600, d: 450, h: 280 };
  const openings = [
    { id: 'd-outer', type: 'door', wall: 'bottom', offset: 100, width: 85, swing: 'in', hinge: 'start' },
    { id: 'd-free', type: 'door', name: '隔墙门', wall: 'free', x: 260, y: 140, orientation: 'v', width: 80, swing: 'out', hinge: 'end' }
  ];
  const saved = Layouts.saveCurrentLayout(store, { name: '两室', room, items: [], openings });
  assert.equal(saved.layout.openings.length, 2);
  assert.equal(saved.layout.openings[1].wall, 'free');
  assert.equal(saved.layout.openings[1].x, 260);
  assert.equal(saved.layout.openings[1].y, 140);
  assert.equal(saved.layout.openings[1].orientation, 'v');
}

console.log('ALL LAYOUT STORE TESTS PASSED (8/8 groups)');
