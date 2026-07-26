"""Validated local storage for a user's protected base resume."""

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import UploadFile

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
MAX_BASE_RESUME_BYTES = 10 * 1024 * 1024
REQUIRED_DOCX_MEMBERS = {"[Content_Types].xml", "word/document.xml"}


class BaseResumeStorageError(Exception):
    """Base class for safe, user-facing upload failures."""


class UnsupportedResumeTypeError(BaseResumeStorageError):
    """Raised when an upload is not a DOCX file."""


class ResumeTooLargeError(BaseResumeStorageError):
    """Raised when an upload exceeds the configured limit."""


class InvalidResumeError(BaseResumeStorageError):
    """Raised when a file has a DOCX name but invalid contents."""


@dataclass(frozen=True)
class StoredBaseResume:
    original_filename: str
    stored_path: Path
    size_bytes: int


class BaseResumeStorage:
    """Store validated DOCX uploads under unique local directories."""

    def __init__(
        self,
        root: Path,
        max_bytes: int = MAX_BASE_RESUME_BYTES,
    ) -> None:
        self.root = root
        self.max_bytes = max_bytes

    async def save(self, upload: UploadFile) -> StoredBaseResume:
        original_filename = Path(upload.filename or "").name
        if Path(original_filename).suffix.lower() != ".docx":
            raise UnsupportedResumeTypeError("Upload a Microsoft Word DOCX file.")

        safe_filename = self._safe_filename(original_filename)
        upload_directory = self.root / str(uuid4())
        temporary_path = upload_directory / f".{safe_filename}.uploading"
        final_path = upload_directory / safe_filename
        size_bytes = 0

        upload_directory.mkdir(parents=True, exist_ok=False)
        try:
            with temporary_path.open("wb") as destination:
                while chunk := await upload.read(1024 * 1024):
                    size_bytes += len(chunk)
                    if size_bytes > self.max_bytes:
                        raise ResumeTooLargeError(
                            "The base resume must be 10 MB or smaller."
                        )
                    destination.write(chunk)

            if size_bytes == 0:
                raise InvalidResumeError("The uploaded DOCX file is empty.")
            self._validate_docx(temporary_path)
            temporary_path.replace(final_path)
        except BaseResumeStorageError:
            self._remove_failed_upload(upload_directory)
            raise
        except OSError as error:
            self._remove_failed_upload(upload_directory)
            raise InvalidResumeError(
                "The base resume could not be stored locally."
            ) from error

        return StoredBaseResume(
            original_filename=original_filename,
            stored_path=final_path.resolve(),
            size_bytes=size_bytes,
        )

    @staticmethod
    def _safe_filename(filename: str) -> str:
        stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(filename).stem).strip(
            " ._"
        )
        return f"{stem or 'base-resume'}.docx"

    @staticmethod
    def _validate_docx(path: Path) -> None:
        try:
            with ZipFile(path) as archive:
                if not REQUIRED_DOCX_MEMBERS.issubset(archive.namelist()):
                    raise InvalidResumeError(
                        "The selected file is not a valid Word DOCX document."
                    )
                bad_member = archive.testzip()
                if bad_member is not None:
                    raise InvalidResumeError(
                        "The selected DOCX document is corrupted."
                    )
        except BadZipFile as error:
            raise InvalidResumeError(
                "The selected file is not a valid Word DOCX document."
            ) from error

    @staticmethod
    def _remove_failed_upload(upload_directory: Path) -> None:
        if upload_directory.exists():
            shutil.rmtree(upload_directory)
