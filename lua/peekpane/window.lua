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
    fillchars = 'eob: ',
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
local function key_action(view, key, count, ctrl)
  view.sequence = (view.sequence or 0) + 1
  local file = string.format('%s/action-%020d-%06d.json', view.dir, vim.uv.hrtime(), view.sequence)
  vim.fn.writefile(
    { vim.json.encode({ key = key, count = count or 1, ctrl = ctrl or false }) },
    file .. '.tmp'
  )
  vim.fn.setfperm(file .. '.tmp', 'rw-------')
  vim.uv.fs_rename(file .. '.tmp', file)
end
local function yank(view)
  local ok, lines = pcall(vim.fn.readfile, view.dir .. '/yank.json')
  if not ok then
    return
  end
  local decoded, data = pcall(vim.json.decode, table.concat(lines, '\n'))
  if decoded and type(data.text) == 'string' then
    vim.fn.setreg('"', data.text)
    vim.fn.setreg('0', data.text)
    vim.fn.setreg('+', data.text)
    vim.api.nvim_echo({ { 'Yanked rendered text', 'Normal' } }, false, {})
  end
end
local function restore_cursor(view, source)
  local row = math.max(1, math.min(view.cursor[1], vim.api.nvim_buf_line_count(source)))
  local line = vim.api.nvim_buf_get_lines(source, row - 1, row, false)[1] or ''
  vim.api.nvim_win_set_cursor(view.win, { row, math.min(view.cursor[2], #line) })
end
local function viewport(view)
  if not vim.api.nvim_win_is_valid(view.win) then
    return
  end
  local pixels
  local loaded, utils = pcall(require, 'image/utils')
  if loaded and utils.term then
    pixels = utils.term.get_size()
  end
  local data = {
    width = vim.api.nvim_win_get_width(view.win) * 9,
    height = vim.api.nvim_win_get_height(view.win) * 18,
    tick = vim.uv.hrtime(),
  }
  if pixels and pixels.cell_width > 0 and pixels.cell_height > 0 then
    data.pixelWidth = math.floor(vim.api.nvim_win_get_width(view.win) * pixels.cell_width)
    data.pixelHeight = math.floor(vim.api.nvim_win_get_height(view.win) * pixels.cell_height)
    data.width = math.floor(data.pixelWidth / (pixels.cell_height / 18))
  end
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
  if not view.presenter then
    view.presenter =
      require('peekpane.presenter').new(require('image'), view.dir, 'peekpane-' .. view.buf)
  end
  if
    view.presenter:submit(frame.path, {
      buffer = view.buf,
      window = view.win,
      x = 0,
      y = 0,
      width = vim.api.nvim_win_get_width(view.win),
      height = vim.api.nvim_win_get_height(view.win),
      inline = false,
    })
  then
    view.path = frame.path
    if not view.loaded then
      vim.bo[view.buf].modifiable = true
      vim.api.nvim_buf_set_lines(view.buf, 0, -1, false, { '' })
      vim.bo[view.buf].modifiable = false
      view.loaded = true
    end
  end
end
function M.toggle(source, win)
  local view = views[source]
  win = win or (view and view.win)
  if not view or not win or not vim.api.nvim_win_is_valid(win) then
    return false
  end
  if win ~= view.win or not vim.api.nvim_win_is_valid(view.win) then
    M.open(source, view.dir, win)
    return true
  end
  if vim.api.nvim_win_get_buf(view.win) == view.buf then
    key_action(view, 'Escape')
    if view.presenter then
      view.presenter:hide()
    end
    view.path = nil
    vim.api.nvim_win_set_buf(view.win, source)
    style(view, false)
    restore_cursor(view, source)
  else
    view.cursor = vim.api.nvim_win_get_cursor(view.win)
    vim.api.nvim_win_set_buf(view.win, view.buf)
    style(view, true)
    viewport(view)
    draw(view)
  end
  return true
end
function M.open(source, dir, win)
  local existing = views[source]
  if existing then
    if existing.win ~= win or not vim.api.nvim_win_is_valid(existing.win) then
      -- Dispose only the presentation state; the CLI session can be reused in
      -- the invoking source window without retaining an invalid window ID.
      M.close(source)
    else
      if vim.api.nvim_win_get_buf(win) ~= existing.buf then
        M.toggle(source, win)
      end
      return
    end
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
    'fillchars',
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
    { 'Loading preview…', 'Space m p: source    j/k: move    v: select    y: yank' }
  )
  vim.bo[view.buf].modifiable = false
  local function toggle()
    M.toggle(source, vim.api.nvim_get_current_win())
  end
  vim.keymap.set('n', '<leader>mp', toggle, { buffer = view.buf, silent = true })
  for _, key in ipairs({ 'i', 'q', '<M-p>' }) do
    vim.keymap.set('n', key, '<Nop>', { buffer = view.buf, silent = true })
  end
  for _, key in ipairs({ 'j', 'k', 'h', 'l', 'w', 'b', 'v', 'y', '0', '$', 'G' }) do
    vim.keymap.set('n', key, function()
      key_action(view, key, vim.v.count1)
    end, { buffer = view.buf, silent = true, nowait = true })
  end
  for key, value in pairs({ ['<Down>'] = 'j', ['<Up>'] = 'k', ['<Esc>'] = 'Escape' }) do
    vim.keymap.set('n', key, function()
      key_action(view, value, vim.v.count1)
    end, { buffer = view.buf, silent = true, nowait = true })
  end
  for key, value in pairs({ ['<C-d>'] = 'd', ['<C-u>'] = 'u' }) do
    vim.keymap.set('n', key, function()
      key_action(view, value, vim.v.count1, true)
    end, { buffer = view.buf, silent = true, nowait = true })
  end
  view.watch = vim.uv.new_fs_event()
  view.watch:start(
    dir,
    {},
    vim.schedule_wrap(function(_, file)
      if file == 'yank.json' then
        yank(view)
      end
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
          if view.presenter then
            view.presenter:hide()
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
  if view.presenter then
    view.presenter:close()
  end
  pcall(vim.api.nvim_del_augroup_by_name, 'peekpane-window-' .. source)
  if
    vim.api.nvim_win_is_valid(view.win)
    and vim.api.nvim_win_get_buf(view.win) == view.buf
    and vim.api.nvim_buf_is_valid(source)
  then
    vim.api.nvim_win_set_buf(view.win, source)
    style(view, false)
    restore_cursor(view, source)
  end
  if vim.api.nvim_buf_is_valid(view.buf) then
    vim.api.nvim_buf_delete(view.buf, { force = true })
  end
end
return M
