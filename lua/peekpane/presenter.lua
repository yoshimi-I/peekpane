-- Keep the visible frame until its replacement has finished image.nvim's async transform.
local M = {}
function M.new(api, dir, id)
  local p = { generation = 0, sequence = 0 }
  local function retire(item)
    if not item then
      return
    end
    if item.image then
      item.image:clear()
    end
    vim.uv.fs_unlink(item.path)
  end
  local start
  start = function()
    if p.closed or p.pending or not p.wanted then
      return
    end
    local item = p.wanted
    p.wanted, p.pending = nil, item
    local options = vim.tbl_extend('force', item.options, { id = id .. '-' .. item.sequence })
    local ok, image = pcall(api.from_file, item.path, options)
    if not ok or not image then
      p.pending = nil
      retire(item)
      start()
      return
    end
    item.image = image
    local generation = p.generation
    local deadline = vim.uv.hrtime() + 5000000000
    local function ready()
      if p.closed or generation ~= p.generation or p.pending ~= item then
        return
      end
      if image.is_rendered then
        local previous = p.visible
        p.visible, p.current, p.pending = item, image, nil
        retire(previous)
        start()
      elseif vim.uv.hrtime() > deadline then
        p.pending = nil
        retire(item)
        start()
      else
        vim.defer_fn(ready, 16)
      end
    end
    local rendered = pcall(image.render, image)
    if not rendered then
      p.pending = nil
      retire(item)
      start()
      return
    end
    ready()
  end
  function p:submit(path, options)
    if self.closed then
      return false
    end
    self.sequence = self.sequence + 1
    local copy = string.format('%s/present-%s-%d.png', dir, id, self.sequence)
    if not vim.uv.fs_copyfile(path, copy) then
      return false
    end
    vim.fn.setfperm(copy, 'rw-------')
    retire(self.wanted)
    self.wanted = { path = copy, sequence = self.sequence, options = options }
    start()
    return true
  end
  function p:hide()
    self.generation = self.generation + 1
    retire(self.pending)
    retire(self.wanted)
    retire(self.visible)
    self.pending, self.wanted, self.visible, self.current = nil, nil, nil, nil
  end
  function p:close()
    self.closed = true
    self:hide()
  end
  return p
end
return M
