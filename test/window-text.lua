-- Optional integration test: real HTML renderer, isolated clipboard, fake terminal image output.
vim.opt.rtp:prepend(vim.fn.getcwd())
local cache = vim.fn.tempname()
vim.env.XDG_CACHE_HOME = cache
vim.env.PEEKPANE_HEADLESS = nil
vim.env.PEEKPANE_SMOKE = '1'
vim.env.NVIM = ''
vim.g.mapleader = ' '
local clipboard = ''
vim.g.clipboard = {
  name = 'isolated-test',
  copy = {
    ['+'] = function(lines)
      clipboard = table.concat(lines, '\n')
    end,
    ['*'] = function() end,
  },
  paste = {
    ['+'] = function()
      return { { clipboard }, 'v' }
    end,
    ['*'] = function()
      return { {}, 'v' }
    end,
  },
}
package.preload.image = function()
  return {
    from_file = function()
      return {
        render = function(self)
          self.is_rendered = true
        end,
        clear = function(self)
          self.is_rendered = false
        end,
      }
    end,
  }
end
vim.cmd('runtime plugin/peekpane.lua')
local p = require('peekpane')
p.setup({ display = 'window', cmd = { 'node', vim.fn.getcwd() .. '/bin/peekpane.js' } })
local file = vim.fn.tempname() .. '.md'
vim.fn.writefile({ '# Copy target', '', 'This is selectable rendered text.' }, file)
vim.cmd.edit(file)
local source, left = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
vim.cmd.vsplit()
local right, chat = vim.api.nvim_get_current_win(), vim.api.nvim_create_buf(false, true)
vim.api.nvim_win_set_buf(right, chat)
vim.api.nvim_set_current_win(left)
p.open()
assert(
  vim.wait(15000, function()
    return vim.bo.filetype == 'peekpane'
  end),
  'preview did not open'
)
vim.api.nvim_feedkeys('vwy', 'xt', false)
assert(
  vim.wait(10000, function()
    return vim.fn.getreg('0') == 'Copy'
  end),
  'rendered DOM text did not reach yank register'
)
assert(vim.fn.getreg('"') == 'Copy', 'unnamed register does not contain rendered text')
assert(clipboard == 'Copy', 'clipboard bridge was not invoked')
assert(vim.api.nvim_win_get_buf(right) == chat, 'conversation changed')
p.command({ 'toggle' })
assert(vim.api.nvim_get_current_buf() == source, 'source was not restored')
p.command({ 'toggle' })
assert(vim.bo.filetype == 'peekpane', 'preview was not restored')
p.close()
vim.wait(500)
vim.fn.delete(file)
vim.fn.delete(cache, 'rf')
print(
  'PASS: same-window HTML text selection and yank into real Neovim registers; conversation preserved'
)
vim.cmd('qa!')
