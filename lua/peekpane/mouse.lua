-- Intercept pointer input only over visible preview windows. Buffer-local mouse
-- mappings miss the first click when another Neovim window has focus.
local M = {}
local namespace = vim.api.nvim_create_namespace('peekpane-mouse')
local enabled, saved, held
local keys = {}
local function bind(lhs, event)
  keys[vim.api.nvim_replace_termcodes(lhs, true, false, true)] = event
end
for _, modifier in ipairs({ '', 'S-', 'C-', 'A-', 'D-' }) do
  local mods = ({ ['S-'] = 'shift', ['C-'] = 'control', ['A-'] = 'alt', ['D-'] = 'meta' })[modifier]
  for _, button in ipairs({ 'Left', 'Middle', 'Right' }) do
    for count = 1, 3 do
      local prefix = count == 1 and '' or tostring(count) .. '-'
      bind('<' .. modifier .. prefix .. button .. 'Mouse>', {
        type = 'mouseDown',
        button = button:lower(),
        clickCount = count,
        modifier = mods,
      })
    end
    bind(
      '<' .. modifier .. button .. 'Drag>',
      { type = 'mouseMove', button = button:lower(), modifier = mods }
    )
    bind(
      '<' .. modifier .. button .. 'Release>',
      { type = 'mouseUp', button = button:lower(), modifier = mods }
    )
  end
  for name, deltas in pairs({
    Down = { 0, -120 },
    Up = { 0, 120 },
    Left = { 120, 0 },
    Right = { -120, 0 },
  }) do
    bind(
      '<' .. modifier .. 'ScrollWheel' .. name .. '>',
      { type = 'mouseWheel', deltaX = deltas[1], deltaY = deltas[2], modifier = mods }
    )
  end
end
bind('<MouseMove>', { type = 'mouseMove' })
local function visible(view)
  return vim.api.nvim_win_is_valid(view.win) and vim.api.nvim_win_get_buf(view.win) == view.buf
end
function M.refresh(views, dispatch)
  -- Consuming an on_key event requires Neovim 0.11. Older versions retain the
  -- existing keyboard viewer and their normal mouse behavior.
  if vim.fn.has('nvim-0.11') == 0 then
    return
  end
  local any = false
  for _, view in pairs(views) do
    if visible(view) then
      any = true
      break
    end
  end
  if not any then
    if enabled then
      vim.on_key(nil, namespace)
      if vim.o.mouse == saved.installed then
        vim.o.mouse = saved.mouse
      end
      if vim.o.mousemoveevent then
        vim.o.mousemoveevent = saved.move
      end
    end
    enabled, saved, held = false, nil, nil
    return
  end
  if enabled then
    return
  end
  saved = { mouse = vim.o.mouse, move = vim.o.mousemoveevent }
  if not vim.o.mouse:find('a', 1, true) and not vim.o.mouse:find('n', 1, true) then
    vim.o.mouse = vim.o.mouse .. 'n'
  end
  saved.installed = vim.o.mouse
  vim.o.mousemoveevent = true
  enabled = true
  vim.on_key(function(key)
    local event = keys[key]
    if not event then
      return
    end
    local pos = vim.fn.getmousepos()
    local view
    if held and (event.type == 'mouseMove' or event.type == 'mouseUp') then
      if visible(held.view) then
        view = held.view
      else
        held = nil
      end
    end
    if not view then
      for _, candidate in pairs(views) do
        if candidate.win == pos.winid and visible(candidate) then
          view = candidate
          break
        end
      end
    end
    if not view or not view.viewport then
      return
    end
    local bar = vim.wo[view.win].winbar ~= '' and 1 or 0
    local rows, cols = vim.api.nvim_win_get_height(view.win), vim.api.nvim_win_get_width(view.win)
    local row, col = pos.winrow - bar, pos.wincol
    if held and held.view == view then
      local origin = vim.api.nvim_win_get_position(view.win)
      row, col = pos.screenrow - origin[1] - bar, pos.screencol - origin[2]
    elseif row < 1 or row > rows or col < 1 or col > cols or pos.line == 0 then
      return
    end
    local width = math.max(100, math.min(4096, view.viewport.width))
    local height = math.max(100, math.min(4096, view.viewport.height))
    local action = {
      kind = 'mouse',
      type = event.type,
      x = math.max(0, math.min(width - 1, math.floor((col - 0.5) * width / cols))),
      y = math.max(0, math.min(height - 1, math.floor((row - 0.5) * height / rows))),
      button = event.button,
      clickCount = event.clickCount,
      deltaX = event.deltaX,
      deltaY = event.deltaY,
      modifiers = {},
    }
    if event.modifier then
      action.modifiers[#action.modifiers + 1] = event.modifier
    end
    if event.type == 'mouseDown' then
      held = { view = view, button = event.button, count = event.clickCount }
    elseif held and event.type == 'mouseMove' then
      action.button = held.button
      action.modifiers[#action.modifiers + 1] = held.button .. 'ButtonDown'
    elseif event.type == 'mouseUp' then
      action.clickCount = held and held.count or 1
      held = nil
    end
    vim.schedule(function()
      if not visible(view) then
        return
      end
      if action.type == 'mouseDown' then
        vim.api.nvim_set_current_win(view.win)
      end
      dispatch(view, action)
    end)
    return ''
  end, namespace)
end
return M
