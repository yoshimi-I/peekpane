-- Minimal English-only configuration for the real terminal recording.
local settings =
  vim.json.decode(table.concat(vim.fn.readfile(vim.env.PEEKPANE_RECORD_CONFIG), '\n'))
vim.opt.rtp:prepend(settings.repo)
vim.opt.rtp:append(settings.image)
vim.opt.termguicolors = true
vim.opt.number = true
vim.opt.relativenumber = false
vim.opt.swapfile = false
vim.opt.hidden = true
vim.opt.showmode = false
vim.opt.laststatus = 2
vim.opt.cmdheight = 1
vim.opt.signcolumn = 'no'
vim.opt.wrap = true
vim.opt.scrolloff = 3
vim.g.mapleader = ' '
vim.cmd('colorscheme habamax')
vim.api.nvim_set_hl(0, 'Normal', { fg = '#d6deeb', bg = '#1f2430' })
vim.api.nvim_set_hl(0, 'NormalNC', { fg = '#d6deeb', bg = '#1f2430' })
vim.api.nvim_set_hl(0, 'StatusLine', { fg = '#b7e8cf', bg = '#293243', bold = true })
vim.opt.statusline =
  ' peekpane  |  %t %m%=%{&filetype == "peekpane" ? "PREVIEW" : "SOURCE"}  |  Space mp: switch  '
-- Capture register operations without replacing the user's clipboard.
vim.g.clipboard = {
  name = 'demo',
  copy = { ['+'] = function() end, ['*'] = function() end },
  paste = {
    ['+'] = function()
      return { {}, 'v' }
    end,
    ['*'] = function()
      return { {}, 'v' }
    end,
  },
}
require('image').setup({
  backend = 'kitty',
  processor = 'magick_cli',
  max_height_window_percentage = 100,
  tmux_show_only_in_active_window = true,
  integrations = {
    markdown = { enabled = false },
    neorg = { enabled = false },
    typst = { enabled = false },
    html = { enabled = false },
    css = { enabled = false },
  },
})
require('peekpane').setup({
  display = 'window',
  follow_cursor = true,
  cmd = { settings.node, settings.repo .. '/bin/peekpane.js' },
})
vim.cmd('runtime plugin/peekpane.lua')
vim.keymap.set('n', '<leader>mp', '<cmd>Peek toggle<cr>', { silent = true })
