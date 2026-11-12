import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LabelObject } from '../src/types.ts';
import {
  alignObjects, distributeObjects, reorderObjects, duplicateObjects, getVisualBounds
} from '../src/utils/arrange.ts';
import { getBoxOrigin, setBoxOrigin } from '../src/utils.ts';

// Tem 60 x 40 mm. Đối tượng không phải chữ: (x, y) là góc trên-trái, tính từ TÂM tem.
const W = 60;
const H = 40;
const box = (id: string, left: number, top: number, w: number, h: number): LabelObject => ({
  id, type: 'shape', x: left - W / 2, y: top - H / 2, width: w, height: h, content: id, shapeType: 'rect'
});
const leftTop = (o: LabelObject) => {
  const b = getBoxOrigin(o, W, H);
  return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10];
};

test('căn một đối tượng vào phôi tem', () => {
  const objs = [box('a', 10, 10, 20, 10)];
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'left', W, H)[0]), [0, 10]);
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'right', W, H)[0]), [40, 10]);
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'hcenter', W, H)[0]), [20, 10]);
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'top', W, H)[0]), [10, 0]);
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'bottom', W, H)[0]), [10, 30]);
  assert.deepEqual(leftTop(alignObjects(objs, ['a'], 'vmiddle', W, H)[0]), [10, 15]);
});

test('căn nhiều đối tượng theo khung bao của nhóm', () => {
  const objs = [box('a', 5, 5, 10, 10), box('b', 30, 20, 20, 10), box('c', 12, 30, 6, 6)];
  const ids = ['a', 'b'];
  const left = alignObjects(objs, ids, 'left', W, H);
  assert.deepEqual(leftTop(left[0]), [5, 5]);
  assert.deepEqual(leftTop(left[1]), [5, 20]);
  assert.deepEqual(leftTop(left[2]), [12, 30], 'đối tượng không chọn phải giữ nguyên');
  const right = alignObjects(objs, ids, 'right', W, H);
  assert.deepEqual(leftTop(right[0]), [40, 5]);
  assert.deepEqual(leftTop(right[1]), [30, 20]);
  const mid = alignObjects(objs, ids, 'vmiddle', W, H);
  // khung bao dọc: 5 -> 30, tâm 17.5
  assert.deepEqual(leftTop(mid[0]), [5, 12.5]);
  assert.deepEqual(leftTop(mid[1]), [30, 12.5]);
});

test('căn chữ có điểm neo ở giữa vẫn đúng vị trí', () => {
  const text: LabelObject = { id: 't', type: 'text', x: 0, y: 0, width: 20, height: 6, content: 'x', textFlowOrigin: 'center' };
  const out = alignObjects([text], ['t'], 'left', W, H)[0];
  assert.deepEqual(leftTop(out), [0, 17]);
  const back = setBoxOrigin(out, 3, 4, W, H);
  assert.deepEqual([back.x, back.y], [3 - 30 + 10, 4 - 20 + 3]);
});

test('phân bố đều khoảng cách theo chiều ngang', () => {
  const objs = [box('a', 0, 0, 10, 10), box('b', 12, 0, 10, 10), box('c', 50, 0, 10, 10)];
  const out = distributeObjects(objs, ['a', 'b', 'c'], 'horizontal', W, H);
  // tổng rộng 30, khoảng trải 60 -> hở (60-30)/2 = 15 -> b nằm ở 10 + 15 = 25
  assert.deepEqual(leftTop(out[0]), [0, 0]);
  assert.deepEqual(leftTop(out[1]), [25, 0]);
  assert.deepEqual(leftTop(out[2]), [50, 0]);
  // ít hơn 3 đối tượng thì không đổi
  assert.equal(distributeObjects(objs, ['a', 'b'], 'horizontal', W, H), objs);
});

test('phân bố theo chiều dọc không phụ thuộc thứ tự trong mảng', () => {
  const objs = [box('c', 0, 30, 10, 10), box('a', 0, 0, 10, 10), box('b', 0, 5, 10, 10)];
  const out = distributeObjects(objs, ['a', 'b', 'c'], 'vertical', W, H);
  const byId = Object.fromEntries(out.map(o => [o.id, leftTop(o)[1]]));
  assert.deepEqual(byId, { a: 0, b: 15, c: 30 });
});

test('khung bao tính cả góc xoay', () => {
  const o = { ...box('r', 20, 10, 20, 10), angle: 90 };
  const b = getVisualBounds(o, W, H);
  assert.equal(Math.round((b.right - b.left) * 10) / 10, 10);
  assert.equal(Math.round((b.bottom - b.top) * 10) / 10, 20);
  // tâm không đổi
  assert.equal(Math.round(((b.left + b.right) / 2) * 10) / 10, 30);
});

test('thứ tự lớp: đưa lên đầu / xuống cuối', () => {
  const objs = ['a', 'b', 'c', 'd'].map(id => box(id, 0, 0, 5, 5));
  const ids = (list: LabelObject[]) => list.map(o => o.id).join('');
  assert.equal(ids(reorderObjects(objs, ['b'], 'front')), 'acdb');
  assert.equal(ids(reorderObjects(objs, ['c'], 'back')), 'cabd');
  assert.equal(ids(reorderObjects(objs, ['b', 'c'], 'front')), 'adbc');
  assert.equal(ids(reorderObjects(objs, ['b', 'd'], 'back')), 'bdac');
});

test('thứ tự lớp: lên/xuống một bậc', () => {
  const objs = ['a', 'b', 'c', 'd'].map(id => box(id, 0, 0, 5, 5));
  const ids = (list: LabelObject[]) => list.map(o => o.id).join('');
  assert.equal(ids(reorderObjects(objs, ['b'], 'forward')), 'acbd');
  assert.equal(ids(reorderObjects(objs, ['c'], 'backward')), 'acbd');
  assert.equal(ids(reorderObjects(objs, ['d'], 'forward')), 'abcd', 'đã ở trên cùng thì không đổi');
  assert.equal(ids(reorderObjects(objs, ['a'], 'backward')), 'abcd', 'đã ở dưới cùng thì không đổi');
  assert.equal(ids(reorderObjects(objs, ['b', 'c'], 'forward')), 'adbc');
  assert.equal(ids(reorderObjects(objs, ['b', 'c'], 'backward')), 'bcad');
});

test('nhân đôi: lệch vị trí, đặt lên trên, id mới và không dùng chung tham chiếu', () => {
  const objs = [box('a', 5, 5, 10, 10), box('b', 20, 20, 10, 10)];
  let n = 0;
  const { objects, newIds } = duplicateObjects(objs, ['a'], () => `copy-${++n}`);
  assert.equal(objects.length, 3);
  assert.deepEqual(newIds, ['copy-1']);
  assert.deepEqual(leftTop(objects[2]), [7, 7]);
  assert.notEqual(objects[2], objs[0]);
  assert.deepEqual(duplicateObjects(objs, ['zzz'], () => 'x').newIds, []);
});
