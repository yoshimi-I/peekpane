local M = {}
local config = {
  display = 'split',
  split = 'right',
  size = 0.5,
  follow_cursor = true,
  cmd = 'peekpane',
  filetypes = {},
}
local active, timers, requested = {}, {}, {}
local function source(buf)
  return require('peekpane.window').source(buf or vim.api.nvim_get_current_buf())
end
local function args(command, file)
  local result = type(config.cmd) == 'table' and vim.deepcopy(config.cmd) or { config.cmd }
  table.insert(result, command)
  if file then
    table.insert(result, file)
  end
  return result
end
local function run(argv, input, callback)
  vim.system(argv, { stdin = input, text = true }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then
        if not (result.stderr or ''):find('Preview is not open', 1, true) then
          vim.notify('peekpane: ' .. (result.stderr or 'command failed'), vim.log.levels.ERROR)
        else
          for b, f in pairs(active) do
            if vim.tbl_contains(argv, f) then
              require('peekpane.window').close(b)
              if timers[b] then
                timers[b]:stop()
              end
              active[b] = nil
              requested[b] = nil
            end
          end
        end
      end
      if callback then
        callback(result.code == 0)
      end
    end)
  end)
end
function M.is_open(buf)
  return active[source(buf)] ~= nil
end
function M.open(direction)
  local buf = source()
  local win = vim.api.nvim_get_current_win()
  if config.display == 'window' then
    local ok = pcall(require, 'image')
    if not ok then
      vim.notify('peekpane: window display requires image.nvim', vim.log.levels.ERROR)
      return
    end
  end
  local file = vim.api.nvim_buf_get_name(buf)
  if file == '' or vim.fn.filereadable(file) ~= 1 then
    vim.notify('peekpane: save the buffer before opening', vim.log.levels.WARN)
    return
  end
  requested[buf] = file
  local argv = args('open', file)
  vim.list_extend(argv, {
    '--display',
    config.display,
    '--split',
    direction or config.split,
    '--size',
    tostring(config.size),
  })
  for _, key in ipairs({ 'focus_key', 'zoom_key' }) do
    if config[key] ~= nil then
      vim.list_extend(argv, { '--' .. key:gsub('_', '-'), tostring(config[key]) })
    end
  end
  local override = config.filetypes[vim.bo[buf].filetype]
  if override then
    vim.list_extend(argv, { '--type', override })
  end
  if config.css then
    vim.list_extend(argv, { '--css', vim.fn.expand(config.css) })
  end
  run(argv, nil, function(ok)
    if ok and requested[buf] == file and vim.api.nvim_buf_is_valid(buf) then
      active[buf] = file
      M.push(buf)
      if config.display == 'window' then
        local result =
          vim.system(vim.list_extend(args('ls'), { '--json' }), { text = true }):wait(2000)
        if result.code == 0 then
          for _, session in ipairs(vim.json.decode(result.stdout)) do
            if session.file == vim.uv.fs_realpath(file) then
              require('peekpane.window').open(buf, vim.fn.fnamemodify(session.page, ':h'), win)
              break
            end
          end
        end
      end
    elseif ok then
      run(args('close', file))
    end
  end)
end
function M.push(buf)
  buf = source(buf)
  if not active[buf] or not vim.api.nvim_buf_is_valid(buf) then
    return
  end
  local argv = args('push', active[buf])
  if config.follow_cursor and buf == vim.api.nvim_get_current_buf() then
    vim.list_extend(argv, { '--line', tostring(vim.api.nvim_win_get_cursor(0)[1]) })
  end
  local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), '\n')
  if vim.bo[buf].endofline then
    content = content .. '\n'
  end
  run(argv, content)
end
function M.close(buf)
  buf = source(buf)
  if timers[buf] then
    timers[buf]:stop()
    timers[buf]:close()
    timers[buf] = nil
  end
  require('peekpane.window').close(buf)
  local file = active[buf] or requested[buf]
  active[buf], requested[buf] = nil, nil
  if file then
    vim.system(args('close', file)):wait(3000)
  end
end
function M.scroll(line)
  local file = active[source()]
  if file then
    local argv = args('scroll', file)
    table.insert(argv, tostring(line or vim.api.nvim_win_get_cursor(0)[1]))
    run(argv)
  end
end
function M.focus()
  if config.display == 'window' then
    require('peekpane.window').toggle(source())
    return
  end
  run(args('focus', active[vim.api.nvim_get_current_buf()]))
end
function M.zoom()
  if config.display == 'window' then
    return
  end
  run(args('zoom', active[vim.api.nvim_get_current_buf()]))
end
function M.setup(opts)
  config = vim.tbl_deep_extend('force', config, opts or {})
  local group = vim.api.nvim_create_augroup('peekpane', { clear = true })
  vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI', 'CursorMoved', 'CursorMovedI' }, {
    group = group,
    callback = function(event)
      if not active[event.buf] then
        return
      end
      if event.event:match('Cursor') and not config.follow_cursor then
        return
      end
      if not timers[event.buf] then
        timers[event.buf] = vim.uv.new_timer()
      end
      timers[event.buf]:start(
        150,
        0,
        vim.schedule_wrap(function()
          M.push(event.buf)
        end)
      )
    end,
  })
  vim.api.nvim_create_autocmd({ 'BufDelete', 'BufWipeout' }, {
    group = group,
    callback = function(e)
      M.close(e.buf)
    end,
  })
  vim.api.nvim_create_autocmd('VimLeavePre', {
    group = group,
    callback = function()
      for _, file in pairs(requested) do
        vim.system(args('close', file)):wait(2000)
      end
    end,
  })
end
function M.command(parts)
  local command, direction = parts[1] or 'open', parts[2]
  if vim.tbl_contains({ 'left', 'right', 'up', 'down' }, command) then
    direction = command
    command = 'open'
  end
  if command == 'close' or (command == 'toggle' and M.is_open()) then
    if command == 'toggle' and config.display == 'window' then
      require('peekpane.window').toggle(source())
    else
      M.close()
    end
  elseif command == 'open' or command == 'toggle' then
    M.open(direction)
  else
    vim.notify('peekpane: invalid command', vim.log.levels.ERROR)
  end
end
return M
