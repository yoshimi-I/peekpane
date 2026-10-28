local M = {}
local views = {}
local function style(view, preview)
  local settings = {
    number = false,
    relativenumber = false,
    signcolumn = 'no',
    foldcolumn = '0',
    cursorline = false,
    wrap = false,
  }
  for key, value in pairs(view.options) do
    if preview then
      vim.wo[view.win][key] = settings[key]
    else
      vim.wo[view.win][key] = value
    end
  end
end
function M.source(buf)
  for source, view in pairs(views) do
    if view.buf == buf then
      return source
    end
  end
  return buf
end
local function viewport(view, scroll)
  if not vim.api.nvim_win_is_valid(view.win) then
    return
  end
  local data = {
    width = vim.api.nvim_win_get_width(view.win) * 9,
    height = vim.api.nvim_win_get_height(view.win) * 18,
    scrollBy = scroll,
    tick = vim.uv.hrtime(),
  }
  local file = view.dir .. '/viewport.json'
  vim.fn.writefile({ vim.json.encode(data) }, file .. '.tmp')
  vim.fn.setfperm(file .. '.tmp', 'rw-------')
  vim.uv.fs_rename(file .. '.tmp', file)
end
local function draw(view)
  if not vim.api.nvim_win_is_valid(view.win) or vim.api.nvim_win_get_buf(view.win) ~= view.buf then
    return
  end
  local ok, lines = pcall(vim.fn.readfile, view.dir .. '/frame.json')
  if not ok then
    return
  end
  local decoded, frame = pcall(vim.json.decode, table.concat(lines, '\n'))
  if not decoded or view.path == frame.path then
    return
  end
  if not vim.uv.fs_stat(frame.path) then
    return
  end
  if view.image then
    view.image:clear()
    view.image = nil
  end
  local image = require('image').from_file(frame.path, {
    id = 'peekpane-' .. view.buf,
    buffer = view.buf,
    window = view.win,
    x = 0,
    y = 0,
    width = vim.api.nvim_win_get_width(view.win),
    height = vim.api.nvim_win_get_height(view.win),
    inline = false,
  })
  if image then
    view.image, view.path = image, frame.path
    image:render()
  end
end
function M.toggle(source)
  local view = views[source]
  if not view or not vim.api.nvim_win_is_valid(view.win) then
    return
  end
  if vim.api.nvim_win_get_buf(view.win) == view.buf then
    if view.image then
      view.image:clear()
    end
    view.path = nil
    vim.api.nvim_win_set_buf(view.win, source)
    style(view, false)
    vim.api.nvim_win_set_cursor(view.win, view.cursor)
  else
    view.cursor = vim.api.nvim_win_get_cursor(view.win)
    vim.api.nvim_win_set_buf(view.win, view.buf)
    style(view, true)
    viewport(view)
    draw(view)
  end
end
function M.open(source, dir, win)
  if views[source] then
    if vim.api.nvim_win_get_buf(win) ~= views[source].buf then
      M.toggle(source)
    end
    return
  end
  local view = {
    dir = dir,
    win = win,
    buf = vim.api.nvim_create_buf(false, true),
    cursor = vim.api.nvim_win_get_cursor(win),
  }
  view.options = {}
  for _, key in ipairs({
    'number',
    'relativenumber',
    'signcolumn',
    'foldcolumn',
    'cursorline',
    'wrap',
  }) do
    view.options[key] = vim.wo[win][key]
  end
  views[source] = view
  vim.api.nvim_buf_set_name(view.buf, 'peekpane://' .. source)
  vim.bo[view.buf].buftype = 'nofile'
  vim.bo[view.buf].bufhidden = 'hide'
  vim.bo[view.buf].swapfile = false
  vim.bo[view.buf].filetype = 'peekpane'
  vim.api.nvim_buf_set_lines(
    view.buf,
    0,
    -1,
    false,
    { 'Loading preview…', 'Space m p / q: source    j/k: scroll    Ctrl-d/u: page' }
  )
  vim.bo[view.buf].modifiable = false
  local function toggle()
    M.toggle(source)
  end
  for _, key in ipairs({ 'q', '<Esc>', 'i', '<leader>mp', '<M-p>' }) do
    vim.keymap.set('n', key, toggle, { buffer = view.buf, silent = true })
  end
  for key, delta in pairs({ j = 54, k = -54, ['<Down>'] = 54, ['<Up>'] = -54 }) do
    vim.keymap.set('n', key, function()
      viewport(view, delta)
    end, { buffer = view.buf, silent = true })
  end
  for key, direction in pairs({ ['<C-d>'] = 1, ['<C-u>'] = -1 }) do
    vim.keymap.set('n', key, function()
      viewport(view, direction * vim.api.nvim_win_get_height(win) * 9)
    end, { buffer = view.buf, silent = true })
  end
  view.watch = vim.uv.new_fs_event()
  view.watch:start(
    dir,
    {},
    vim.schedule_wrap(function(_, file)
      if file == 'frame.json' then
        draw(view)
      end
    end)
  )
  vim.api.nvim_create_autocmd('BufLeave', {
    buffer = view.buf,
    callback = function()
      vim.schedule(function()
        if
          not vim.api.nvim_win_is_valid(view.win)
          or vim.api.nvim_win_get_buf(view.win) ~= view.buf
        then
          if view.image then
            view.image:clear()
          end
          view.path = nil
          if vim.api.nvim_win_is_valid(view.win) then
            style(view, false)
          end
        end
      end)
    end,
  })
  vim.api.nvim_create_autocmd('BufWinEnter', {
    buffer = view.buf,
    callback = function()
      if vim.api.nvim_win_is_valid(view.win) and vim.api.nvim_win_get_buf(view.win) == view.buf then
        style(view, true)
        draw(view)
      end
    end,
  })
  vim.api.nvim_create_autocmd('WinResized', {
    callback = function()
      if views[source] then
        viewport(view)
        view.path = nil
      end
    end,
    group = vim.api.nvim_create_augroup('peekpane-window-' .. source, { clear = true }),
  })
  vim.api.nvim_win_set_buf(win, view.buf)
  style(view, true)
  viewport(view)
  draw(view)
end
function M.close(source)
  local view = views[source]
  if not view then
    return
  end
  views[source] = nil
  view.watch:stop()
  view.watch:close()
  if view.image then
    view.image:clear()
  end
  pcall(vim.api.nvim_del_augroup_by_name, 'peekpane-window-' .. source)
  if
    vim.api.nvim_win_is_valid(view.win)
    and vim.api.nvim_win_get_buf(view.win) == view.buf
    and vim.api.nvim_buf_is_valid(source)
  then
    vim.api.nvim_win_set_buf(view.win, source)
    style(view, false)
    vim.api.nvim_win_set_cursor(view.win, view.cursor)
  end
  if vim.api.nvim_buf_is_valid(view.buf) then
    vim.api.nvim_buf_delete(view.buf, { force = true })
  end
end
return M
