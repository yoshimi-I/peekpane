local cache = vim.fn.tempname()
vim.env.XDG_CACHE_HOME = cache
vim.env.PEEKPANE_HEADLESS = '1'
vim.opt.rtp:prepend(vim.fn.getcwd())
vim.cmd('runtime plugin/peekpane.lua')
local p = require('peekpane')
-- Force the initial snapshot's process to start after a later edit. Pushes must
-- remain ordered even when process startup times differ on busy CI runners.
local system, first_push, completed_pushes = vim.system, true, 0
vim.system = function(argv, options, callback)
  if argv[3] == 'push' then
    local function launch()
      return system(argv, options, function(result)
        completed_pushes = completed_pushes + 1
        callback(result)
      end)
    end
    if first_push then
      first_push = false
      vim.defer_fn(launch, 200)
      return {}
    end
    return launch()
  end
  return system(argv, options, callback)
end
p.setup({
  cmd = { 'node', vim.fn.getcwd() .. '/bin/peekpane.js' },
  follow_cursor = true,
  display = 'toggle',
})
assert(vim.fn.exists(':Peek') == 2)
assert(vim.fn.exists(':PeekScroll') == 2)
local file = vim.fn.tempname() .. '.md'
vim.fn.writefile({ '# Headless' }, file)
vim.cmd.edit(file)
p.open()
vim.wait(5000, function()
  return p.is_open()
end)
assert(p.is_open(), 'open failed')
vim.api.nvim_buf_set_lines(0, 0, -1, false, { '# Unsaved' })
p.push()
local list = vim
  .system({ 'node', vim.fn.getcwd() .. '/bin/peekpane.js', 'ls', '--json' }, { text = true })
  :wait()
assert(list.code == 0, list.stderr)
local page = vim.json.decode(list.stdout)[1].page
local options = vim.json.decode(
  table.concat(vim.fn.readfile(vim.fn.fnamemodify(page, ':h') .. '/options.json'), '\n')
)
assert(options.display == 'toggle', 'display option was not forwarded to CLI')
assert(
  vim.wait(3000, function()
    local lines = vim.fn.readfile(page)
    return completed_pushes >= 2
      and #vim.fn.glob(vim.fn.fnamemodify(page, ':h') .. '/command-*.json', false, true) == 0
      and table.concat(lines, '\n'):find('Unsaved') ~= nil
  end),
  'unsaved text did not reach preview'
)
p.close()
assert(not p.is_open(), 'close failed')
p.open()
assert(
  vim.wait(5000, function()
    return p.is_open()
  end),
  'reopen failed'
)
vim.cmd('bdelete!')
vim.wait(100)
local closed = vim
  .system({ 'node', vim.fn.getcwd() .. '/bin/peekpane.js', 'ls', '--json' }, { text = true })
  :wait()
assert(#vim.json.decode(closed.stdout) == 0, 'buffer deletion left a preview open')
vim.fn.delete(file)
vim.fn.delete(cache, 'rf')
vim.cmd('qa!')
