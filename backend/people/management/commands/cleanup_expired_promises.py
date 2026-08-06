from django.core.management.base import BaseCommand

from people.promise_cleanup import cleanup_expired_promises


class Command(BaseCommand):
    help = 'Expire stale promises and delete expired promises after retention.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--retention-days',
            type=int,
            default=None,
            help='Days to keep expired promises before deletion.',
        )

    def handle(self, *args, **options):
        result = cleanup_expired_promises(
            retention_days=options.get('retention_days'),
        )
        self.stdout.write(
            self.style.SUCCESS(
                'Expired {expired_count} stale promises and deleted '
                '{deleted_count} expired promises older than {retention_days} days.'
                .format(**result),
            ),
        )
