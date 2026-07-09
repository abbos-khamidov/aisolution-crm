import uuid
from pathlib import Path
from urllib.parse import quote

import boto3

from app.core.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        endpoint_url = settings.s3_endpoint_url or None
        _client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
    return _client


def upload_file(content: bytes, filename: str, content_type: str) -> str:
    """Uploads to S3-compatible storage (Hetzner Object Storage in prod, any
    S3-compatible endpoint via S3_ENDPOINT_URL). Returns the object's URL.

    CRM_SPEC.md forbids storing binaries in Postgres — only the URL is
    persisted in the `files` table.
    """
    key = f"{uuid.uuid4()}-{filename}"
    endpoint_url = settings.s3_endpoint_url or None
    public_url_base = settings.s3_public_url_base or None
    if (
        endpoint_url is None
        and settings.s3_access_key == "dev-access-key"
        and settings.s3_secret_key == "dev-secret-key"
    ):
        upload_dir = Path(settings.local_upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        (upload_dir / key).write_bytes(content)
        return f"/uploads/{quote(key)}"

    client = _get_client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    if public_url_base:
        return f"{public_url_base.rstrip('/')}/{key}"
    if endpoint_url:
        return f"{endpoint_url.rstrip('/')}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com/{key}"
