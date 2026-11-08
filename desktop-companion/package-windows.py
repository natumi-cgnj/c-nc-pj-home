#!/usr/bin/env python3
"""Create a conservative Windows ZIP from the already verified portable app.

This normalizes archive metadata; it cannot change permissions on the user's
download file or extraction destination. Do not infer an access-denied cause
from a successful archive check.
"""
import argparse
import datetime
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile


def windows_name(name):
    path = PurePosixPath(name)
    if not name.isascii() or path.is_absolute() or any(part in ('', '.', '..') for part in path.parts):
        raise ValueError('Not a relative ASCII archive path: ' + name)
    reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{p}{i}' for p in ('COM', 'LPT') for i in range(1, 10)}
    for part in path.parts:
        if any(ord(c) < 32 or c in '<>:"\\|?*' for c in part) or part.endswith((' ', '.')) or part.split('.')[0].upper() in reserved:
            raise ValueError('Not a Windows filename: ' + name)
    return name


def package(source, output):
    source, output = source.resolve(), output.resolve()
    required = ['Jane Companion.exe', 'resources/app.asar', 'icudtl.dat', 'resources.pak']
    for name in required:
        if not (source / name).is_file():
            raise ValueError('Incomplete portable app: ' + name)
    if output.is_relative_to(source):
        raise ValueError('The archive must be outside the app directory')
    date = datetime.datetime.now().timetuple()[:6]
    items = []
    for file in sorted(source.rglob('*')):
        if file.is_symlink():
            raise ValueError('Do not package links: ' + str(file))
        if file.is_file():
            relative = file.relative_to(source).as_posix()
            # Only the help document changes its filename. Program bytes stay exact.
            if relative == '使用说明.txt':
                relative = 'README.txt'
            items.append((file, windows_name('Jane_Companion/' + relative)))
    names = [name.casefold() for _, name in items]
    if len(set(names)) != len(names):
        raise ValueError('Windows filename collision')
    folders = {'Jane_Companion/'}
    for _, name in items:
        folders.update(str(parent) + '/' for parent in PurePosixPath(name).parents if str(parent) != '.')
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, pending = tempfile.mkstemp(prefix='jane-windows-', suffix='.zip', dir=output.parent)
    os.close(descriptor)

    def info(name, folder=False):
        entry = zipfile.ZipInfo(name, date)
        entry.create_system = 0  # MS-DOS / Windows, with no inherited Unix modes.
        entry.create_version = 20
        entry.extract_version = 20
        entry.external_attr = 0x10 if folder else 0x20  # Directory / ordinary archive file.
        entry.internal_attr = 0
        entry.compress_type = zipfile.ZIP_STORED if folder else zipfile.ZIP_DEFLATED
        entry._compresslevel = 6
        return entry

    try:
        with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=False) as archive:
            for folder in sorted(folders, key=lambda value: (value.count('/'), value)):
                archive.writestr(info(folder, True), b'')
            for file, name in items:
                with file.open('rb') as src, archive.open(info(name), 'w', force_zip64=False) as dst:
                    shutil.copyfileobj(src, dst, 1024 * 1024)
        with zipfile.ZipFile(pending) as archive:
            assert archive.testzip() is None
            assert not archive.comment
            assert {i.filename for i in archive.infolist()} == folders | {name for _, name in items}
            for entry in archive.infolist():
                windows_name(entry.filename)
                assert entry.create_system == 0 and entry.external_attr == (0x10 if entry.is_dir() else 0x20)
                assert entry.flag_bits == 0 and entry.extract_version <= 20
                assert not entry.extra and not entry.comment
        # Keep the old deliverable until the replacement is complete and verified.
        os.replace(pending, output)
        output.chmod(0o644)
    finally:
        Path(pending).unlink(missing_ok=True)
    return {'file': str(output), 'files': len(items), 'directories': len(folders),
            'size_bytes': output.stat().st_size, 'metadata': 'DOS', 'paths': 'ASCII', 'encrypted': False}


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, nargs='?', default=root / 'out/Jane Companion-win32-x64')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(package(args.source, args.output)))
