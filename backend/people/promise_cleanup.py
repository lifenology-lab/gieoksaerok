from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Promise
from .promise_utils import is_promise_expired


DEFAULT_EXPIRED_PROMISE_RETENTION_DAYS = 30


def get_expired_promise_retention_days(retention_days=None):
    if retention_days is None:
        retention_days = getattr(
            settings,
            'PROMISE_EXPIRED_RETENTION_DAYS',
            DEFAULT_EXPIRED_PROMISE_RETENTION_DAYS,
        )

    return max(int(retention_days), 0)


def expire_stale_promises(user=None, person=None, now=None):
    queryset = Promise.objects.filter(status=Promise.STATUS_ACTIVE)

    if user is not None:
        queryset = queryset.filter(user=user)

    if person is not None:
        queryset = queryset.filter(person=person)

    expired_ids = [
        promise.id
        for promise in queryset
        if is_promise_expired(promise, now=now)
    ]

    if not expired_ids:
        return 0

    return Promise.objects.filter(id__in=expired_ids).update(
        status=Promise.STATUS_EXPIRED,
        updated_at=now or timezone.now(),
    )


def delete_old_expired_promises(retention_days=None, now=None):
    now = now or timezone.now()
    retention_days = get_expired_promise_retention_days(retention_days)
    cutoff = now - timedelta(days=retention_days)

    deleted_count, _ = Promise.objects.filter(
        status=Promise.STATUS_EXPIRED,
        updated_at__lt=cutoff,
    ).delete()

    return deleted_count


def cleanup_expired_promises(retention_days=None, now=None):
    now = now or timezone.now()
    expired_count = expire_stale_promises(now=now)
    deleted_count = delete_old_expired_promises(
        retention_days=retention_days,
        now=now,
    )

    return {
        'expired_count': expired_count,
        'deleted_count': deleted_count,
        'retention_days': get_expired_promise_retention_days(retention_days),
    }
