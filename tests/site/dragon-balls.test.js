import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starLayouts, starPolygon} from '../../website/src/lib/dragon-balls.js';
test('all seven Dragon Balls follow the official Banpresto arrangement and upright five-point stars', () => {
  for (let number=1;number<=7;number++) {
    assert.equal(starLayouts[number].length,number);
    const vertices=starPolygon(number).split(' ').map(point=>point.split(',').map(Number));
    assert.equal(vertices.length,10);
    assert.equal(vertices[0][0],0);
    assert.ok(vertices[0][1]<0);
    assert.ok(vertices.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
  }
  assert.deepEqual(starLayouts[1],[[50,50]]);
  assert.ok(starLayouts[2][0][0]<50 && starLayouts[2][0][1]<50 && starLayouts[2][1][0]>50 && starLayouts[2][1][1]>50);
  assert.deepEqual([3,4,5,6,7].map(n=>[starLayouts[n].filter(([,y])=>y<40).length,starLayouts[n].filter(([,y])=>y>=40&&y<60).length,starLayouts[n].filter(([,y])=>y>=60).length]),[[1,0,2],[2,0,2],[1,2,2],[2,3,1],[2,3,2]]);
  assert.ok(!starLayouts[5].some(([x,y])=>x===50&&y===50));
  assert.ok(starLayouts[7].some(([x,y])=>x===50&&y===50));
  for (const number of [0,8,1.5,NaN]) assert.throws(()=>starPolygon(number),/1 through 7/);
});
