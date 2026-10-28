vim.opt.rtp:prepend(vim.fn.getcwd())
local dir = vim.fn.tempname()
vim.fn.mkdir(dir, 'p')
local frames = {}
local cleared = {}
local api = {
  from_file = function(path, options)
    assert(vim.uv.fs_stat(path), 'renderer received a deleted input')
    local image = { path = path, id = options.id, is_rendered = false }
    image.render = function() end
    function image:clear()
      self.is_rendered = false
      cleared[self.id] = true
    end
    frames[#frames + 1] = image
    return image
  end,
}
local p = require('peekpane.presenter').new(api, dir, 'test')
local function submit(n)
  local path = dir .. '/frame-' .. n .. '.png'
  vim.fn.writefile({ 'frame ' .. n }, path)
  p:submit(path, {})
  vim.fn.delete(path)
end
submit(1)
assert(#frames == 1)
frames[1].is_rendered = true
assert(vim.wait(500, function()
  return p.current == frames[1]
end))
submit(2)
assert(frames[1].is_rendered, 'old image cleared before replacement was ready')
for i = 3, 100 do
  submit(i)
end
assert(#frames == 2, 'long hold queued image transforms for every intermediate frame')
assert(vim.uv.fs_stat(frames[2].path), 'in-flight image was deleted')
frames[2].is_rendered = true
assert(vim.wait(500, function()
  return #frames == 3
end))
assert(frames[2].is_rendered, 'second image disappeared during next transform')
assert(cleared[frames[1].id], 'old image was not retired after swap')
assert(
  table.concat(vim.fn.readfile(frames[3].path)) == 'frame 100',
  'latest frame was not selected'
)
frames[3].is_rendered = true
assert(vim.wait(500, function()
  return p.current == frames[3]
end))
p:hide()
assert(not frames[3].is_rendered, 'hiding preview retained an overlay')
assert(#vim.fn.glob(dir .. '/present-*.png', false, true) == 0, 'pinned frames leaked')
p:close()
vim.fn.delete(dir, 'rf')
print('PASS: no blank replacement, bounded long-hold backlog and pinned input lifetime')
vim.cmd('qa!')
