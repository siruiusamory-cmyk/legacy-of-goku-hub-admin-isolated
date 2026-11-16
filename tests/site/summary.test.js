import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectSummary} from '../../website/src/lib/summary.js';

test('featured summary uses a complete existing sentence rather than a clipped substring',()=>{
  assert.equal(projectSummary('First complete sentence. More technical details follow.'),'First complete sentence.');
  assert.equal(projectSummary('  An unreleased tool for LoG II (GBA, USA).\nDocumentation is on GitHub.'),'An unreleased tool for LoG II (GBA, USA).');
  assert.equal(projectSummary('A single complete description without terminal punctuation'),'A single complete description without terminal punctuation');
  assert.equal(projectSummary(''),'');
});
