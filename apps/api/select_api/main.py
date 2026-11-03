from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from . import __version__
from .config import get_settings
from .contracts import registry
from .db import get_engine
from .routes_insight import router as insight_router
from .routes_org import router as org_router
from .routes_settings import router as settings_router
from .routes_work import router as work_router

log = logging.getLogger("select.api")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Select API", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["authorization", "content-type"],
    )
    for router in (org_router, work_router, insight_router, settings_router):
        app.include_router(router)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for err in exc.errors():
            location = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
            fields.append({"field": location, "message": err.get("msg", "invalid")})
        return JSONResponse(status_code=422, content={"detail": "Some fields are invalid.", "fields": fields})

    @app.exception_handler(OperationalError)
    async def database_down(_request: Request, exc: OperationalError) -> JSONResponse:
        log.error("database unavailable: %s", exc)
        return JSONResponse(
            status_code=503, content={"detail": "The database is unavailable. Check that PostgreSQL is running."}
        )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        with get_engine().connect() as conn:
            conn.execute(text("select 1"))
        return {
            "status": "ok",
            "version": __version__,
            "contracts": sorted(registry()),
            "auth_mode": settings.auth_mode,
        }

    return app


app = create_app()
