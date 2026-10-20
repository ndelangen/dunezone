"""Keep the persistent runtime's advisory lock through supervisor cleanup.

The OS releases flock after a crash or reboot. No PID-based stale-lock deletion
can accidentally remove a newer launcher's lock.
"""
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys


def main():
    directory = Path(sys.argv[1])
    if not directory.is_absolute():
        raise SystemExit('--persist-dir must be absolute')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = directory.resolve() / '.dunezone-runtime.flock'
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('This persistent environment is locked. Stop its launcher before resume or reset.')
    environment = dict(os.environ, LOCAL_DEV_OS_LOCK=str(lock_path))
    # The shell also retains the descriptor, so killing this wrapper cannot
    # release the lock while the supervisor still owns running services.
    child = subprocess.Popen(sys.argv[2:], env=environment, pass_fds=(descriptor,))
    def forward(signum, _frame):
        child.send_signal(signum)
    signal.signal(signal.SIGINT, forward)
    signal.signal(signal.SIGTERM, forward)
    result = child.wait()
    os.close(descriptor)
    raise SystemExit(result if result >= 0 else 128 - result)


if __name__ == '__main__':
    main()
