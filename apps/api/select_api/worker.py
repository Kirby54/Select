"""Worker process: claims durable jobs and runs them. Several workers may run side by side."""

from __future__ import annotations

import logging
import os
import signal
import socket
import time
import uuid
from types import FrameType

from . import demo, runner
from .config import get_settings
from .db import _factory
from .jobs import claim, fail, finish
from .models import Job

log = logging.getLogger("select.worker")


def handle(job: Job) -> None:
    session = _factory()()
    try:
        if job.kind == "run_task":
            runner.execute(session, uuid.UUID(job.payload["task_id"]))
        elif job.kind == "demo_week":
            tracked = session.get(Job, job.id)
            assert tracked is not None

            def progress(done: int, total: int, day: int) -> None:
                tracked.progress = {"done": done, "total": total, "day": day}
                session.commit()

            stats = demo.play(session, uuid.UUID(job.payload["user_id"]), progress)
            tracked.progress = {**tracked.progress, "stats": stats}
            session.commit()
        else:
            raise ValueError(f"unknown job kind '{job.kind}'")
    finally:
        session.close()


def run_once(worker_id: str) -> bool:
    session = _factory()()
    try:
        job = claim(session, worker_id)
        if job is None:
            return False
        log.info("job %s %s started (attempt %s)", job.id, job.kind, job.attempts)
        try:
            handle(job)
        except runner.RunRefused as exc:
            log.warning("job %s refused: %s", job.id, exc)
            fail(session, job, str(exc), retry=False)
            return True
        except Exception as exc:
            log.exception("job %s failed", job.id)
            fail(session, job, f"{type(exc).__name__}: {exc}", retry=job.kind != "demo_week")
            return True
        finish(session, job)
        log.info("job %s done", job.id)
        return True
    finally:
        session.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    stopping = False

    def stop(signum: int, _frame: FrameType | None) -> None:
        nonlocal stopping
        log.info("signal %s received, finishing the current job then stopping", signum)
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    log.info("worker %s polling every %ss", worker_id, get_settings().worker_poll_seconds)
    while not stopping:
        try:
            worked = run_once(worker_id)
        except Exception:
            log.exception("worker loop error; retrying shortly")
            worked = False
        if not worked:
            time.sleep(get_settings().worker_poll_seconds)
