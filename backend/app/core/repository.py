from typing import Any, cast

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession


class TenantRepository[ModelT]:
    """Base repository enforcing company_id tenant isolation on every query."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession, company_id: str) -> None:
        self.session = session
        self.company_id = company_id

    def base_select(self) -> Select[ModelT]:
        model_cls: Any = self.model
        stmt = select(self.model).where(model_cls.company_id == self.company_id)
        return cast(Select[ModelT], stmt)

    async def get_scoped(self, entity_id: str) -> ModelT | None:
        model_cls: Any = self.model
        stmt = self.base_select().where(model_cls.id == entity_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
