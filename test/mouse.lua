if vim.fn.has('nvim-0.11') == 0 then
  print('SKIP: mouse input requires Neovim 0.11+')
  vim.cmd('qa!')
end
vim.opt.rtp:prepend(vim.fn.getcwd())
local root = vim.fn.tempname()
vim.fn.mkdir(root, 'p')
package.preload.image = function()
  return {
    from_file = function()
      error('No frame expected')
    end,
  }
end
local window = require('peekpane.window')
vim.cmd('vsplit')
local left, source = vim.api.nvim_get_current_win(), vim.api.nvim_get_current_buf()
local right = vim.api.nvim_list_wins()[2]
if right == left then
  right = vim.api.nvim_list_wins()[1]
end
local chat = vim.api.nvim_create_buf(false, true)
vim.api.nvim_win_set_buf(right, chat)
local original_mouse, original_move = vim.o.mouse, vim.o.mousemoveevent
local getmousepos = vim.fn.getmousepos
local mouse = { winid = left, winrow = 2, wincol = 3, line = 1, screenrow = 2, screencol = 3 }
vim.fn.getmousepos = function()
  return mouse
end
window.open(source, root, left)
vim.api.nvim_set_current_win(right)
local function event(key)
  local raw = vim.api.nvim_replace_termcodes(key, true, false, true)
  local discarded = vim._on_key(raw, raw)
  vim.wait(50, function()
    return false
  end)
  return discarded
end
assert(event('<LeftMouse>'), 'first mouse click from another window was not intercepted')
assert(vim.api.nvim_get_current_win() == left, 'click did not focus the preview')
assert(vim.api.nvim_win_get_buf(right) == chat, 'mouse input replaced the conversation')
mouse.wincol, mouse.screencol = 10, 10
event('<LeftDrag>')
event('<LeftRelease>')
vim.api.nvim_set_current_win(right)
event('<ScrollWheelDown>')
assert(vim.api.nvim_get_current_win() == right, 'wheel scrolling stole editor focus')
local requests = vim.fn.glob(root .. '/action-*.json', false, true)
assert(#requests == 4, 'mouse actions were not queued')
local events = {}
for _, file in ipairs(requests) do
  events[#events + 1] = vim.json.decode(table.concat(vim.fn.readfile(file), '\n'))
end
assert(
  events[1].kind == 'mouse' and events[1].type == 'mouseDown',
  'click not routed as native mouse input'
)
assert(events[2].type == 'mouseMove' and events[2].button == 'left', 'drag lost its button')
assert(events[3].type == 'mouseUp', 'release was lost')
assert(events[4].type == 'mouseWheel' and events[4].deltaY < 0, 'wheel direction was reversed')
local viewport = vim.json.decode(table.concat(vim.fn.readfile(root .. '/viewport.json'), '\n'))
assert(
  events[1].x >= 0
    and events[1].x < viewport.width
    and events[1].y >= 0
    and events[1].y < viewport.height,
  'coordinates do not match rendered viewport'
)
mouse.winid = right
assert(not event('<LeftMouse>'), 'ordinary editor mouse input was intercepted')
assert(
  #vim.fn.glob(root .. '/action-*.json', false, true) == 4,
  'chat click was forwarded into preview'
)
window.toggle(source, left)
mouse.winid = left
assert(not event('<ScrollWheelDown>'), 'source mode mouse input was intercepted')
assert(
  vim.o.mouse == original_mouse and vim.o.mousemoveevent == original_move,
  'source toggle did not restore mouse options'
)
window.toggle(source, left)
window.close(source)
assert(
  vim.o.mouse == original_mouse and vim.o.mousemoveevent == original_move,
  'close did not restore mouse options'
)
vim.fn.getmousepos = getmousepos
vim.fn.delete(root, 'rf')
print('PASS: mouse coordinate routing, first-click focus, wheel focus preservation and teardown')
vim.cmd('qa!')
