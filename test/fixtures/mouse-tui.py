"""Give the Neovim mouse regression a real PTY without extra Python packages."""
import errno
import os
import pty
import select
import signal
import sys
import time

pid, terminal = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

status = None
eof = False
try:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if not eof and select.select([terminal], [], [], 0.1)[0]:
            try:
                if not os.read(terminal, 65536):
                    eof = True
            except OSError as error:
                if error.errno == errno.EIO:
                    eof = True
                else:
                    raise
        if eof:
            time.sleep(0.01)
        exited, child_status = os.waitpid(pid, os.WNOHANG)
        if exited:
            status = child_status
            break
    if status is None:
        exited, status = os.waitpid(pid, os.WNOHANG)
        if not exited:
            os.kill(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
            print("Neovim mouse fixture timed out", file=sys.stderr)
finally:
    os.close(terminal)
sys.exit(os.waitstatus_to_exitcode(status))
