vim.opt.rtp:prepend(vim.fn.getcwd())
vim.env.XDG_CACHE_HOME = vim.fn.tempname()
vim.env.PEEKPANE_HEADLESS = '1'
vim.g.mapleader = ' '
package.preload.image = function()
  return {
    from_file = function()
      return { render = function() end, clear = function() end }
    end,
  }
end
vim.cmd('runtime plugin/peekpane.lua')
local p = require('peekpane')
p.setup({ display = 'window', cmd = { 'node', vim.fn.getcwd() .. '/bin/peekpane.js' } })
local file = vim.fn.tempname() .. '.md'
vim.fn.writefile({ '# Same window', '', 'Unsaved content follows.' }, file)
vim.cmd.edit(file)
vim.wo.number = true
local source, left = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
vim.cmd.vsplit()
local right, conversation = vim.api.nvim_get_current_win(), vim.api.nvim_create_buf(false, true)
vim.api.nvim_win_set_buf(right, conversation)
vim.api.nvim_set_current_win(left)
local count = #vim.api.nvim_list_wins()
p.open()
assert(
  vim.wait(5000, function()
    return vim.bo.filetype == 'peekpane'
  end),
  'preview buffer did not open'
)
assert(#vim.api.nvim_list_wins() == count, 'preview created a new split')
assert(vim.api.nvim_get_current_win() == left, 'preview moved to another window')
assert(vim.api.nvim_win_get_buf(right) == conversation, 'conversation window changed')
assert(p.is_open(), 'preview lost source ownership')
assert(not vim.wo.number, 'preview did not hide line numbers')
p.command({ 'toggle' })
assert(vim.api.nvim_get_current_buf() == source, 'toggle did not restore source')
assert(vim.wo.number, 'source line numbers were not restored')
p.command({ 'toggle' })
assert(vim.bo.filetype == 'peekpane', 'second toggle did not restore preview')
p.close()
assert(vim.api.nvim_win_get_buf(left) == source, 'close did not restore source')
assert(vim.api.nvim_win_get_buf(right) == conversation, 'close changed conversation')
p.open()
assert(
  vim.wait(5000, function()
    return vim.bo.filetype == 'peekpane'
  end),
  'reopen failed'
)
local closed = vim.system({ 'node', vim.fn.getcwd() .. '/bin/peekpane.js', 'close', file }):wait()
assert(closed.code == 0)
local errors = 0
local originalNotify = vim.notify
vim.notify = function(_, level)
  if level == vim.log.levels.ERROR then
    errors = errors + 1
  end
end
p.push(source)
assert(
  vim.wait(3000, function()
    return not p.is_open(source)
  end),
  'stale preview was not cleared'
)
assert(vim.api.nvim_win_get_buf(left) == source, 'stale preview did not restore source')
assert(errors == 0, 'stale update produced repeated error notifications')
vim.notify = originalNotify
vim.fn.delete(file)
vim.fn.delete(vim.env.XDG_CACHE_HOME, 'rf')
print('PASS: same-window preview and source toggle without changing conversation')
vim.cmd('qa!')
