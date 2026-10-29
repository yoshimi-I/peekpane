-- Deterministic window lifecycle regressions; no real renderer or user sessions.
vim.opt.rtp:prepend(vim.fn.getcwd())
vim.g.mapleader = ' '
package.preload.image = function()
  return {
    from_file = function()
      error('No image should be loaded in this fixture')
    end,
  }
end
local root = vim.fn.tempname()
vim.fn.mkdir(root, 'p')
local pending, sessions, closed, errors = {}, {}, {}, {}
local pushed = {}
local during_list
local schedule = vim.schedule
vim.schedule = function(fn)
  schedule(function()
    local ok, err = pcall(fn)
    if not ok then
      errors[#errors + 1] = err
    end
  end)
end
vim.system = function(argv, _, callback)
  local command, file = argv[3], argv[4]
  local result = { code = 0, stderr = '', stdout = '' }
  if command == 'open' then
    pending[#pending + 1] = { file = file, callback = callback }
    return {}
  elseif command == 'push' then
    pushed[#pushed + 1] = { file = file }
  elseif command == 'ls' then
    local list = {}
    for _, session in pairs(sessions) do
      list[#list + 1] = session
    end
    result.stdout = vim.json.encode(list)
  elseif command == 'close' then
    closed[#closed + 1] = file
    sessions[file] = nil
  end
  if callback then
    callback(result)
  end
  return {
    wait = function()
      if command == 'ls' and during_list then
        local change = during_list
        during_list = nil
        change()
      end
      return result
    end,
  }
end
local function drain()
  local done = false
  vim.schedule(function()
    done = true
  end)
  assert(
    vim.wait(1000, function()
      return done
    end),
    'scheduled work did not finish'
  )
end
local function finish(index, ok)
  ok = ok ~= false
  local request = assert(pending[index])
  if ok and not sessions[request.file] then
    local dir = root .. '/session-' .. index
    vim.fn.mkdir(dir, 'p')
    sessions[request.file] =
      { file = vim.uv.fs_realpath(request.file), page = dir .. '/index.html' }
  end
  request.callback({ code = ok and 0 or 1, stderr = ok and '' or 'Expected fixture failure' })
  drain()
end
local serial, buffers = 0, {}
local p
local function fixture(lines)
  if p then
    for _, buf in ipairs(buffers) do
      p.close(buf)
    end
  end
  drain()
  vim.cmd('silent! only!')
  vim.cmd('enew!')
  package.loaded.peekpane = nil
  package.loaded['peekpane.window'] = nil
  pending, sessions, closed, errors = {}, {}, {}, {}
  during_list = nil
  p = require('peekpane')
  p.setup({ display = 'window', cmd = { 'node', 'mock-cli' } })
  serial = serial + 1
  local file = root .. '/source-' .. serial .. '.md'
  local text = {}
  for i = 1, lines or 3 do
    text[i] = 'line ' .. i
  end
  vim.fn.writefile(text, file)
  vim.cmd.edit(file)
  local source, left = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
  buffers[#buffers + 1] = source
  vim.wo.number = true
  vim.cmd.vsplit()
  local right = vim.api.nvim_get_current_win()
  vim.api.nvim_set_current_win(left)
  return source, left, right
end
local function no_errors()
  assert(#errors == 0, table.concat(errors, '\n'))
end

-- Binary buffers can contain zip listings or decoded bytes rather than file contents.
for _, extension in ipairs({ 'xlsx', 'pdf', 'png', 'mp4', 'mp3' }) do
  local buf = fixture()
  local file = root .. '/binary.' .. extension
  vim.fn.writefile({ 'placeholder on disk' }, file)
  vim.api.nvim_buf_set_name(buf, file)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, { 'zip archive listing, not workbook bytes' })
  p.setup({ display = 'split' })
  pushed = {}
  p.open()
  finish(1)
  p.push(buf)
  drain()
  assert(#pushed == 0, 'binary buffer content was pushed for ' .. extension)
end

-- Startup must not overwrite a file chosen after the request was made.
local source, left = fixture()
p.open()
local other = vim.api.nvim_create_buf(true, false)
vim.api.nvim_buf_set_lines(other, 0, -1, false, { 'Another document' })
vim.api.nvim_win_set_buf(left, other)
finish(1)
assert(vim.api.nvim_win_get_buf(left) == other, 'pending open replaced a newly selected buffer')
assert(not p.is_open(source), 'cancelled open retained active ownership')
assert(#closed == 1, 'cancelled preview session was not closed')
no_errors()

-- A closed target window is a cancellation, not a scheduled API error.
source, left = fixture()
p.open()
vim.api.nvim_win_close(left, true)
finish(1)
assert(not p.is_open(source), 'closed-target open retained active ownership')
assert(#closed == 1, 'closed-target preview session was not closed')
no_errors()

-- The session-list wait may also process a window change before installation.
source, left = fixture()
p.open()
other = vim.api.nvim_create_buf(true, false)
during_list = function()
  vim.api.nvim_win_set_buf(left, other)
end
finish(1)
assert(
  vim.api.nvim_win_get_buf(left) == other,
  'session-list wait replaced a newly selected buffer'
)
assert(not p.is_open(source) and #closed == 1, 'session-list cancellation retained the session')
no_errors()

-- A stale completion must not close a newer request for the same file.
local right
source, left, right = fixture()
p.open()
vim.api.nvim_win_close(left, true)
vim.api.nvim_set_current_win(right)
p.open()
finish(2)
local before = #closed
finish(1)
assert(#closed == before, 'stale completion closed a newer preview for the same file')
assert(vim.bo.filetype == 'peekpane' and p.is_open(source), 'newer preview was replaced')
no_errors()

-- A successful older session remains provisional until the newer request claims
-- it. If that newer request fails, the otherwise unowned session must close.
source, left, right = fixture()
p.open()
vim.api.nvim_win_close(left, true)
vim.api.nvim_set_current_win(right)
p.open()
finish(1)
assert(#closed == 0, 'older success closed the session before the newer request completed')
finish(2, false)
assert(not p.is_open(source), 'failed handoff retained active ownership')
assert(#closed == 1 and next(sessions) == nil, 'failed handoff orphaned a successful older session')
no_errors()

-- A nested newer request during ls owns the reused same-file backend.
source, left = fixture()
p.open()
during_list = function()
  p.open()
end
finish(1)
assert(
  not p.is_open(source) and #closed == 0,
  'older list completion claimed or closed a newer request'
)
finish(2)
assert(vim.bo.filetype == 'peekpane' and p.is_open(source), 'nested newer request did not open')
no_errors()

-- Exercise the actual command path after the original view's window closes.
source, left, right = fixture()
p.open()
finish(1)
vim.api.nvim_win_close(left, true)
vim.api.nvim_set_current_win(right)
p.command({ 'toggle' })
assert(vim.bo.filetype == 'peekpane', 'toggle could not reopen in the surviving source window')
assert(p.is_open(source), 'rebound preview lost active ownership')
p.command({ 'toggle' })
assert(vim.api.nvim_get_current_buf() == source, 'rebound toggle did not restore source')
assert(vim.wo.number, 'rebound window did not restore its options')
no_errors()

-- Moving the preview to another valid source window restores the old window.
source, left, right = fixture()
p.open()
finish(1)
vim.api.nvim_set_current_win(right)
vim.wo.relativenumber = true
p.command({ 'toggle' })
assert(vim.bo.filetype == 'peekpane', 'preview did not move to the invoking source window')
assert(vim.api.nvim_win_get_buf(left) == source, 'old window retained the preview')
p.command({ 'toggle' })
assert(
  vim.api.nvim_get_current_buf() == source and vim.wo.relativenumber,
  'new window options were lost'
)
no_errors()

-- Source may be shortened in another window or by a reload while hidden.
for _, command in ipairs({ 'toggle', 'close' }) do
  source, left = fixture(50)
  vim.api.nvim_win_set_cursor(left, { 50, 6 })
  p.open()
  finish(1)
  vim.api.nvim_buf_set_lines(source, 0, -1, false, { 'one', 'x' })
  local ok, err = pcall(p.command, { command })
  assert(ok, 'return to shortened source raised: ' .. tostring(err))
  assert(vim.api.nvim_win_get_buf(left) == source, 'shortened source was not restored')
  local cursor = vim.api.nvim_win_get_cursor(left)
  assert(cursor[1] == 2 and cursor[2] <= 1, 'saved cursor was not clamped to existing text')
  no_errors()
end
for _, buf in ipairs(buffers) do
  p.close(buf)
end
drain()
vim.schedule = schedule
vim.fn.delete(root, 'rf')
print(
  'PASS: cancelled async opens, stale completion ownership, window rebinding and shortened sources'
)
vim.cmd('qa!')
