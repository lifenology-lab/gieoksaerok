from django.core.management.base import BaseCommand

from accounts.demo_services import delete_expired_demo_sessions


class Command(BaseCommand):
    help = '만료된 데모 체험 세션과 복제 데이터를 정리합니다.'

    def handle(self, *args, **options):
        deleted_count = delete_expired_demo_sessions()
        self.stdout.write(
            self.style.SUCCESS(f'{deleted_count}개의 만료된 데모 세션을 정리했습니다.'),
        )
