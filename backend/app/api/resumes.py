"""Local base-resume upload routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import get_settings
from app.schemas import BaseResumeUploadResponse, UserSettingsPayload
from app.services.base_resume_storage import (
    BaseResumeStorage,
    InvalidResumeError,
    ResumeTooLargeError,
    UnsupportedResumeTypeError,
)
from app.services.settings_repository import settings_repository

router = APIRouter(prefix="/resumes", tags=["resumes"])


def get_base_resume_storage() -> BaseResumeStorage:
    return BaseResumeStorage(get_settings().base_resume_storage_dir)


@router.post(
    "/base",
    response_model=BaseResumeUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_base_resume(
    file: Annotated[UploadFile, File(...)],
    storage: Annotated[BaseResumeStorage, Depends(get_base_resume_storage)],
) -> BaseResumeUploadResponse:
    try:
        stored = await storage.save(file)
    except UnsupportedResumeTypeError as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(error),
        ) from error
    except ResumeTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(error),
        ) from error
    except InvalidResumeError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    current = settings_repository.get()
    settings_repository.replace(
        UserSettingsPayload(**current.model_dump(exclude={"persistence"})).model_copy(
            update={"base_resume_path": str(stored.stored_path)}
        )
    )
    return BaseResumeUploadResponse(
        original_filename=stored.original_filename,
        stored_path=str(stored.stored_path),
        size_bytes=stored.size_bytes,
    )
