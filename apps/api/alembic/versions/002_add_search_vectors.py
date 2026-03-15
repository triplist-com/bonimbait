"""Add search_vector tsvector columns to videos and video_segments tables.

Revision ID: 002_add_search_vectors
Revises: None
Create Date: 2026-03-15

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TSVECTOR

# revision identifiers, used by Alembic.
revision: str = "002_add_search_vectors"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add search_vector column to videos table
    op.add_column(
        "videos",
        sa.Column("search_vector", TSVECTOR(), nullable=True),
    )

    # Add search_vector column to video_segments table
    op.add_column(
        "video_segments",
        sa.Column("search_vector", TSVECTOR(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("video_segments", "search_vector")
    op.drop_column("videos", "search_vector")
