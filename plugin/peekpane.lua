if vim.g.loaded_peekpane then
  return
end
vim.g.loaded_peekpane = true
vim.api.nvim_create_user_command('Peek', function(opts)
  require('peekpane').command(opts.fargs)
end, { nargs = '*' })
vim.api.nvim_create_user_command('PeekScroll', function(opts)
  require('peekpane').scroll(tonumber(opts.args))
end, { nargs = '?' })
vim.api.nvim_create_user_command('PeekFocus', function()
  require('peekpane').focus()
end, {})
vim.api.nvim_create_user_command('PeekZoom', function()
  require('peekpane').zoom()
end, {})
