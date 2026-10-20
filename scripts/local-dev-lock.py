"""Hold the runtime lock through service cleanup; launch only fixed repository entries."""
import argparse
from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import signal
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def outside_worktree(value):
    directory = Path(value)
    if not directory.is_absolute():
        raise SystemExit('--persist-dir must be absolute')
    directory = directory.resolve()
    if directory == ROOT or ROOT in directory.parents:
        raise SystemExit('Keep --persist-dir outside the disposable worktree')
    return directory


@contextmanager
def locked_directory(directory):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = directory.resolve() / '.dunezone-runtime.flock'
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('This persistent environment is locked. Stop its launcher before resume or reset.')
        yield descriptor, lock_path
    finally:
        os.close(descriptor)


def supervise(arguments):
    directory = outside_worktree(arguments.persist_dir)
    forwarded = ['--local', '--data=snapshot', '--persist-dir=' + str(directory)]
    if arguments.snapshot_file:
        forwarded.extend(['--snapshot-file', arguments.snapshot_file])
    if arguments.reset:
        forwarded.append('--reset')
    return directory, ['/bin/bash', str(ROOT / 'scripts/app-dev.sh'), *forwarded]


def publisher_build(arguments):
    state = outside_worktree(arguments.state_directory)
    if state.name != '.dunezone-runtime':
        raise SystemExit('Local publisher build requires a persistent runtime state directory')
    bun = Path(os.environ['LOCAL_DEV_BUN_EXECUTABLE'])
    if not bun.is_absolute() or not bun.is_file():
        raise SystemExit('Local publisher build requires its running Bun executable')
    return ROOT / 'node_modules/.cache/local-review-build', [
        str(bun), '--no-env-file', str(ROOT / 'scripts/local-dev-publisher.ts'), '--build', str(state)
    ]


def wait_for_owned_child(command, descriptor, lock_path):
    environment = dict(os.environ, LOCAL_DEV_OS_LOCK=str(lock_path))
    # The shell retains this descriptor through its EXIT trap and service cleanup.
    child = subprocess.Popen(command, env=environment, pass_fds=(descriptor,))

    def forward(signum, _frame):
        if child.poll() is None:
            child.send_signal(signum)

    signal.signal(signal.SIGINT, forward)
    signal.signal(signal.SIGTERM, forward)
    result = child.wait()
    return result if result >= 0 else 128 - result


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_subparsers(dest='mode', required=True)
    runtime = modes.add_parser('supervise')
    runtime.add_argument('--local', action='store_true', required=True)
    runtime.add_argument('--data', choices=['snapshot'], required=True)
    runtime.add_argument('--persist-dir', required=True)
    runtime.add_argument('--snapshot-file')
    runtime.add_argument('--reset', action='store_true')
    build = modes.add_parser('build')
    build.add_argument('--state-directory', required=True)
    arguments = parser.parse_args()
    directory, command = supervise(arguments) if arguments.mode == 'supervise' else publisher_build(arguments)
    with locked_directory(directory) as (descriptor, lock_path):
        raise SystemExit(wait_for_owned_child(command, descriptor, lock_path))


if __name__ == '__main__':
    main()
