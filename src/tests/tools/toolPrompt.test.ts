import test from 'node:test'
import assert from 'node:assert/strict'
import {buildToolSystemPrompt, createDefaultToolRouter} from '../../core/tools'

test('buildToolSystemPrompt exposes default tools and safety rules', () => {
  const router = createDefaultToolRouter()
  const prompt = buildToolSystemPrompt(router.list())

  assert.match(prompt, /`read_file`/)
  assert.match(prompt, /`search_files`/)
  assert.match(prompt, /`find_files`/)
  assert.match(prompt, /`list_dir`/)
  assert.match(prompt, /`write_file`/)
  assert.match(prompt, /`edit_file`/)
  assert.match(prompt, /`run_command`/)
  assert.match(prompt, /approval required/)
  assert.match(prompt, /Return strict JSON only when you need tools/)
  assert.match(prompt, /All paths must stay inside the current workspace/)
  assert.match(prompt, /Commands run without shell interpolation/)
})
