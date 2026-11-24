import argparse
import json
import logging
import sys

from app.core.clock import get_app_now
from app.core.database import get_sync_session_factory
from app.db.seed import seed_database
from app.modules.rules_report.service import generate_rules_report


def rules_report_main() -> None:
    """Strictly read-only CLI printing JSON rules report to stdout."""
    logging.disable(logging.CRITICAL)
    app_now = get_app_now()
    session_factory = get_sync_session_factory()
    with session_factory() as session:
        report = generate_rules_report(session, app_now)
    sys.stdout.write(json.dumps(report, indent=2) + "\n")


def seed_db_main() -> None:
    """CLI to seed the database idempotently or cleanly reset with --reset."""
    parser = argparse.ArgumentParser(description="Seed TracTiq database from seed.json")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Truncate existing domain data and re-seed from seed.json",
    )
    args = parser.parse_args()
    session_factory = get_sync_session_factory()
    with session_factory() as session:
        seed_database(session, reset=args.reset)
    print("Seed completed successfully." + (" (reset mode)" if args.reset else ""), file=sys.stderr)
