/**
 * The whole remote side, as one fixed python program.
 *
 * It is passed to `python3 -c` POSIX-quoted and is byte-identical for every request; the variable
 * part (home, name, body, base version, expected path) travels on **stdin** as JSON, so no user
 * text ever reaches an argv position, a shell word or a log line. Nothing is installed or left
 * behind remotely.
 *
 * The document name is never a path: it is one of two fixed names, each mapped here to the
 * relative location Hermes itself uses (`SOUL.md` at the profile home, `USER.md` inside the
 * `memories` directory). The `memories` directory is routinely a symlink into a local store, so
 * that one directory hop is resolved deliberately; the document leaf itself must still be a
 * regular file opened with `O_NOFOLLOW`.
 */
export const REMOTE_DOCUMENT_SCRIPT = `import sys, os, json, stat, errno, hashlib, tempfile

def out(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.exit(0)

def fail(code, detail):
    out({"ok": False, "code": code, "detail": detail})

# name -> path relative to the profile home, exactly as Hermes lays it out.
RELATIVE = {"SOUL.md": "SOUL.md", "USER.md": "memories/USER.md"}
try:
    req = json.loads(sys.stdin.read())
except Exception:
    fail("bad-response", "request was not valid JSON")
op = req.get("op")
home = req.get("home")
name = req.get("name")
maxb = req.get("maxBytes")
if op not in ("read", "save") or not isinstance(home, str) or not isinstance(name, str):
    fail("invalid-request", "malformed request")
if name not in RELATIVE:
    fail("invalid-request", "document name is not editable")
if not isinstance(maxb, int) or isinstance(maxb, bool) or maxb < 1 or maxb > 1048576:
    fail("invalid-request", "byte bound out of range")
parts = home.split("/")
if not home.startswith("/") or home.endswith("/") or "" in parts[1:] or "." in parts or ".." in parts:
    fail("invalid-request", "home is not a clean absolute path")
try:
    hst = os.lstat(home)
except Exception as exc:
    fail("io-failed", "profile home cannot be inspected: " + str(exc))
if stat.S_ISLNK(hst.st_mode):
    fail("unsafe-path", "profile home is a symlink")
if not stat.S_ISDIR(hst.st_mode):
    fail("unsafe-path", "profile home is not a directory")
if os.path.realpath(home) != home:
    fail("unsafe-path", "profile home resolves to another path")

rel = RELATIVE[name]
leaf = rel.split("/")[-1]
sub = rel[: -(len(leaf) + 1)] if "/" in rel else ""
raw_parent = home + ("/" + sub if sub else "")


def resolve_parent():
    # The directory holding the document may legitimately be a symlink (Hermes points 'memories'
    # at a local store), so it is resolved rather than refused. The resolution target must itself
    # be a real directory, and it is never created here: a missing directory is reported as such.
    try:
        os.lstat(raw_parent)
    except FileNotFoundError:
        fail("io-failed", "the directory '" + (sub or ".") + "' does not exist under the profile home; it is not created here")
    except Exception as exc:
        fail("io-failed", "document directory cannot be inspected: " + str(exc))
    real = os.path.realpath(raw_parent)
    try:
        rst = os.lstat(real)
    except FileNotFoundError:
        fail("unsafe-path", "the directory '" + (sub or ".") + "' points at a path that does not exist")
    except Exception as exc:
        fail("io-failed", "document directory cannot be inspected: " + str(exc))
    if stat.S_ISLNK(rst.st_mode) or not stat.S_ISDIR(rst.st_mode):
        fail("unsafe-path", "the document directory does not resolve to a real directory")
    return real


parent = resolve_parent()
path = parent + "/" + leaf

def current():
    # O_NOFOLLOW plus fstat on the descriptor: the file that is inspected is exactly the file that
    # was opened, so a symlink swapped in between a stat and an open cannot be followed.
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return (b"", None, None)
    except OSError as exc:
        if exc.errno in (errno.ELOOP, errno.EMLINK):
            fail("unsafe-path", "document is a symlink")
        fail("io-failed", "document cannot be opened: " + str(exc))
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            fail("unsafe-path", "document is not a regular file")
        if st.st_size > maxb:
            fail("too-large", "document is larger than the allowed bound")
        data = b""
        while len(data) <= maxb:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            data += chunk
    finally:
        os.close(fd)
    if len(data) > maxb:
        fail("too-large", "document is larger than the allowed bound")
    return (data, hashlib.sha256(data).hexdigest(), stat.S_IMODE(st.st_mode))

data, version, mode = current()
if op == "read":
    if version is None:
        out({"ok": True, "status": "absent", "version": None, "mode": None, "path": path})
    try:
        text = data.decode("utf-8")
    except Exception:
        fail("not-utf8", "document is not valid UTF-8")
    out({"ok": True, "status": "present", "body": text, "version": version, "mode": mode, "path": path})

body = req.get("body")
base = req.get("baseVersion")
expected = req.get("expectedPath")
if not isinstance(body, str) or not (base is None or isinstance(base, str)) or not isinstance(expected, str):
    fail("invalid-request", "malformed save request")
# The edit is bound to the file that was read. If the directory symlink was retargeted since the
# read, the save refuses even when both copies are identical or both absent.
if expected != path:
    fail("conflict", "the document now resolves to a different file than the one that was read")
payload = body.encode("utf-8")
if len(payload) > maxb:
    fail("too-large", "new body is larger than the allowed bound")
# Cheap early refusal, so an obviously stale save never creates a temp file at all.
if version != base:
    fail("conflict", "the document changed on the server since it was read")
target_mode = 0o600 if mode is None else mode
try:
    fd, tmp = tempfile.mkstemp(dir=parent, prefix="." + leaf + ".", suffix=".tmp")
except Exception as exc:
    fail("io-failed", "temporary file cannot be created: " + str(exc))

def drop_tmp():
    try:
        os.unlink(tmp)
    except Exception:
        pass

try:
    with os.fdopen(fd, "wb") as fh:
        fh.write(payload)
        fh.flush()
        os.fsync(fh.fileno())
    os.chmod(tmp, target_mode)
except Exception as exc:
    drop_tmp()
    fail("io-failed", "document could not be written: " + str(exc))

# The content is durable on disk; the last look at the target happens here, immediately before the
# replace, and the temp file is removed when it loses. This narrows, but cannot close, the window
# in which an uncooperative writer changes the file or retargets the directory link: no atomicity
# against other writers is claimed.
try:
    if os.path.realpath(raw_parent) != parent:
        drop_tmp()
        fail("conflict", "the document directory was retargeted while the save was in flight")
    fresh_data, fresh_version, fresh_mode = current()
except SystemExit:
    drop_tmp()
    raise
if fresh_version != base:
    drop_tmp()
    fail("conflict", "the document changed on the server while it was being saved")
if fresh_mode is not None and fresh_mode != target_mode:
    target_mode = fresh_mode
    try:
        os.chmod(tmp, target_mode)
    except Exception as exc:
        drop_tmp()
        fail("io-failed", "permissions could not be preserved: " + str(exc))
try:
    os.replace(tmp, path)
except Exception as exc:
    drop_tmp()
    fail("io-failed", "document could not be replaced: " + str(exc))
out({"ok": True, "status": "saved", "version": hashlib.sha256(payload).hexdigest(), "mode": target_mode, "path": path})
`;
