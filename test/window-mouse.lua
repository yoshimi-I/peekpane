-- Route Neovim's pointer coordinates into a real offscreen HTML renderer.
vim.opt.rtp:prepend(vim.fn.getcwd())
local cache = vim.fn.tempname()
vim.env.XDG_CACHE_HOME, vim.env.XDG_CONFIG_HOME = cache, cache
vim.env.PEEKPANE_HEADLESS, vim.env.PEEKPANE_SMOKE, vim.env.NVIM = nil, '1', ''
local clipboard = ''
vim.g.clipboard = {
  name = 'isolated-mouse-test',
  copy = {
    ['+'] = function(lines)
      clipboard = table.concat(lines, '\n')
    end,
    ['*'] = function() end,
  },
  paste = {
    ['+'] = function()
      return { { clipboard }, 'v' }
    end,
    ['*'] = function()
      return { {}, 'v' }
    end,
  },
}
package.preload.image = function()
  return {
    from_file = function()
      return {
        render = function(self)
          self.is_rendered = true
        end,
        clear = function(self)
          self.is_rendered = false
        end,
      }
    end,
  }
end
local p = require('peekpane')
p.setup({ display = 'window', cmd = { 'node', vim.fn.getcwd() .. '/bin/peekpane.js' } })
local file = vim.fn.tempname() .. '.html'
vim.fn.writefile(
  vim.split(
    [[<!doctype html><html><head><style>
body{margin:0;height:3000px}#check{position:absolute;left:20px;top:20px;margin:0;width:25px;height:25px}
#copy{position:absolute;left:20px;top:100px;margin:0;font:20px/28px monospace}
</style></head><body><input id="check" type="checkbox" onchange="document.body.dataset.local='checked:'+this.checked">
<p id="copy">Selectable preview text</p></body></html>]],
    '\n',
    { plain = true }
  ),
  file
)
vim.cmd.edit(file)
local source, left = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
vim.cmd.vsplit()
local right, chat = vim.api.nvim_get_current_win(), vim.api.nvim_create_buf(false, true)
vim.api.nvim_win_set_buf(right, chat)
vim.api.nvim_set_current_win(left)
p.open()
assert(
  vim.wait(15000, function()
    return vim.bo.filetype == 'peekpane'
  end),
  'preview did not open'
)
local listing = vim
  .system({ 'node', vim.fn.getcwd() .. '/bin/peekpane.js', 'ls', '--json' }, { text = true })
  :wait()
local dir = vim.fn.fnamemodify(vim.json.decode(listing.stdout)[1].page, ':h')
local function read(name)
  local ok, lines = pcall(vim.fn.readfile, dir .. '/' .. name)
  if ok then
    local decoded, data = pcall(vim.json.decode, table.concat(lines, '\n'))
    if decoded then
      return data
    end
  end
  return {}
end
local original = vim.fn.getmousepos
local position = vim.api.nvim_win_get_position(left)
local function pointer(key, row, col)
  vim.fn.getmousepos = function()
    return {
      winid = left,
      line = 1,
      winrow = row,
      wincol = col,
      screenrow = position[1] + row,
      screencol = position[2] + col,
    }
  end
  local raw = vim.api.nvim_replace_termcodes(key, true, false, true)
  assert(vim._on_key(raw, raw), 'mouse event did not enter the preview')
end
vim.api.nvim_set_current_win(right)
pointer('<LeftMouse>', 2, 4)
pointer('<LeftRelease>', 2, 4)
assert(
  vim.wait(10000, function()
    return read('viewer-snapshot.json').localScript == 'checked:true'
  end),
  'Neovim click did not reach the actual checkbox'
)
assert(vim.api.nvim_get_current_win() == left, 'click did not focus preview')
pointer('<LeftMouse>', 7, 3)
pointer('<LeftDrag>', 7, 20)
pointer('<LeftRelease>', 7, 20)
assert(
  vim.wait(10000, function()
    return (read('frame.json').selectionLength or 0) > 0
  end),
  'Neovim drag did not select DOM text'
)
vim.api.nvim_feedkeys('y', 'xt', false)
assert(
  vim.wait(10000, function()
    return clipboard:find('Selectable', 1, true) ~= nil
  end),
  'mouse selection did not reach Vim clipboard'
)
assert(
  vim.fn.getreg('0'):find('Selectable', 1, true),
  'mouse selection did not reach yank register'
)
vim.api.nvim_set_current_win(right)
pointer('<ScrollWheelDown>', 10, 10)
assert(
  vim.wait(10000, function()
    return (read('frame.json').scrollY or 0) > 0
  end),
  'Neovim wheel did not scroll actual HTML'
)
assert(vim.api.nvim_get_current_win() == right, 'wheel stole conversation focus')
assert(vim.api.nvim_win_get_buf(right) == chat, 'mouse changed conversation')
vim.fn.getmousepos = original
local host = tonumber(table.concat(vim.fn.readfile(dir .. '/viewer.pid')))
p.close(source)
vim.wait(10000, function()
  return vim.uv.kill(host, 0) == nil
end)
vim.fn.delete(file)
vim.fn.delete(cache, 'rf')
print('PASS: Neovim mouse clicks, drag-to-yank and wheel operate the real HTML view')
vim.cmd('qa!')
