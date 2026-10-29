vim.opt.rtp:prepend(vim.fn.getcwd())
local result = assert(vim.env.PEEKPANE_MOUSE_RESULT)
local cache = vim.fn.tempname()
local function fail(err)
  vim.fn.writefile({ vim.json.encode({ error = tostring(err) }) }, result)
  vim.fn.delete(cache, 'rf')
  vim.cmd('qa!')
end
local function later(fn)
  vim.defer_fn(function()
    local ok, err = pcall(fn)
    if not ok then
      fail(err)
    end
  end, 100)
end
later(function()
  vim.fn.mkdir(cache, 'p')
  package.preload.image = function()
    return {
      from_file = function()
        error('no frame')
      end,
    }
  end
  local window = require('peekpane.window')
  vim.cmd('vsplit')
  local left, source = vim.api.nvim_get_current_win(), vim.api.nvim_get_current_buf()
  local wins = vim.api.nvim_list_wins()
  local right = wins[1] == left and wins[2] or wins[1]
  local chat = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(right, chat)
  local oldmouse, oldmove = vim.o.mouse, vim.o.mousemoveevent
  window.open(source, cache, left)
  vim.api.nvim_set_current_win(right)
  local p = vim.api.nvim_win_get_position(left)
  vim.api.nvim_input_mouse('left', 'press', '', 0, p[1] + 2, p[2] + 3)
  later(function()
    assert(vim.api.nvim_get_current_win() == left, 'first click did not focus preview')
    vim.api.nvim_input_mouse('left', 'drag', '', 0, p[1] + 2, p[2] + 10)
    vim.api.nvim_input_mouse('left', 'release', '', 0, p[1] + 2, p[2] + 10)
    later(function()
      vim.api.nvim_set_current_win(right)
      vim.api.nvim_input_mouse('wheel', 'down', '', 0, p[1] + 2, p[2] + 3)
      later(function()
        assert(vim.api.nvim_get_current_win() == right, 'wheel stole focus')
        local files = vim.fn.glob(cache .. '/action-*.json', false, true)
        assert(#files == 4, 'expected 4 native mouse events, got ' .. #files)
        local events = {}
        for _, f in ipairs(files) do
          events[#events + 1] = vim.json.decode(table.concat(vim.fn.readfile(f), '\n'))
        end
        assert(
          events[1].type == 'mouseDown'
            and events[2].type == 'mouseMove'
            and events[3].type == 'mouseUp'
            and events[4].type == 'mouseWheel',
          'wrong native event ordering'
        )
        assert(vim.api.nvim_win_get_buf(right) == chat, 'chat changed')
        window.close(source)
        assert(
          vim.o.mouse == oldmouse and vim.o.mousemoveevent == oldmove,
          'mouse options not restored'
        )
        vim.fn.writefile({ vim.json.encode({ ok = true, events = events }) }, result)
        vim.fn.delete(cache, 'rf')
        vim.cmd('qa!')
      end)
    end)
  end)
end)
