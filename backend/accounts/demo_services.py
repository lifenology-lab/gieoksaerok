from copy import deepcopy
from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from patient_assistant.models import PatientQuestionEvent
from people.models import (
    Conversation,
    LongTermMemory,
    Memory,
    MemoryAlbumItem,
    Person,
    PersonSummary,
    Promise,
)
from records.models import ConfusionEvent, MealContextEvent, MealRecord

from .models import DemoExperienceSession


User = get_user_model()


def _copy_json(value):
    return deepcopy(value) if value is not None else value


def _remap_source_ids(source_ids, id_map):
    return [str(id_map.get(str(source_id), source_id)) for source_id in source_ids or []]


def _create_demo_user(template_user):
    session_user = User(
        username=f'demo-{uuid4().hex[:20]}',
        name=template_user.name,
        first_name=template_user.first_name,
        last_name=template_user.last_name,
        is_active=True,
    )
    session_user.set_unusable_password()
    session_user.save()
    return session_user


def _clone_people(template_user, session_user):
    person_map = {}

    for person in Person.objects.filter(user=template_user):
        cloned_person = Person.objects.create(
            user=session_user,
            name=person.name,
            relationship=person.relationship,
            face_descriptor=_copy_json(person.face_descriptor),
        )
        person_map[str(person.id)] = cloned_person

    return person_map


def _clone_conversations(template_user, session_user, person_map):
    conversation_map = {}

    for conversation in Conversation.objects.filter(user=template_user):
        cloned_person = person_map.get(str(conversation.person_id))
        if not cloned_person:
            continue

        cloned_conversation = Conversation.objects.create(
            user=session_user,
            person=cloned_person,
            transcript=conversation.transcript,
            speaker_segments=_copy_json(conversation.speaker_segments),
            status=conversation.status,
            recorded_at=conversation.recorded_at,
        )
        conversation_map[str(conversation.id)] = cloned_conversation

    return conversation_map


def _clone_memories(template_user, session_user, person_map, conversation_map):
    memory_map = {}

    for memory in Memory.objects.filter(user=template_user):
        cloned_person = person_map.get(str(memory.person_id))
        cloned_conversation = conversation_map.get(str(memory.conversation_id))
        if not cloned_person or not cloned_conversation:
            continue

        cloned_memory = Memory.objects.create(
            user=session_user,
            person=cloned_person,
            conversation=cloned_conversation,
            recap=_copy_json(memory.recap),
            memory_at=memory.memory_at,
            verified_at=memory.verified_at,
        )
        memory_map[str(memory.id)] = cloned_memory

    return memory_map


def _clone_people_context(
    template_user,
    session_user,
    person_map,
    conversation_map,
    memory_map,
):
    long_term_memory_map = {}
    promise_map = {}

    for record in LongTermMemory.objects.filter(user=template_user):
        cloned_person = person_map.get(str(record.person_id))
        if not cloned_person:
            continue

        cloned_record = LongTermMemory.objects.create(
            user=session_user,
            person=cloned_person,
            conversation=conversation_map.get(str(record.conversation_id)),
            category=record.category,
            title=record.title,
            description=record.description,
            event_date=record.event_date,
            status=record.status,
            confidence=record.confidence,
            source_text=record.source_text,
            verified_at=record.verified_at,
        )
        long_term_memory_map[str(record.id)] = cloned_record

    for promise in Promise.objects.filter(user=template_user):
        cloned_person = person_map.get(str(promise.person_id))
        if not cloned_person:
            continue

        cloned_promise = Promise.objects.create(
            user=session_user,
            person=cloned_person,
            conversation=conversation_map.get(str(promise.conversation_id)),
            memory=memory_map.get(str(promise.memory_id)),
            title=promise.title,
            description=promise.description,
            scheduled_at=promise.scheduled_at,
            scheduled_date=promise.scheduled_date,
            time_label=promise.time_label,
            timezone=promise.timezone,
            raw_text=promise.raw_text,
            status=promise.status,
            confidence=promise.confidence,
        )
        promise_map[str(promise.id)] = cloned_promise

    for summary in PersonSummary.objects.filter(user=template_user):
        cloned_person = person_map.get(str(summary.person_id))
        if not cloned_person:
            continue

        PersonSummary.objects.create(
            user=session_user,
            person=cloned_person,
            conversation=conversation_map.get(str(summary.conversation_id)),
            card=_copy_json(summary.card),
            source_memory_ids=_remap_source_ids(summary.source_memory_ids, memory_map),
            source_long_term_memory_ids=_remap_source_ids(
                summary.source_long_term_memory_ids,
                long_term_memory_map,
            ),
            source_promise_ids=_remap_source_ids(summary.source_promise_ids, promise_map),
            status=summary.status,
            generated_at=summary.generated_at,
        )


def _clone_memory_album_items(template_user, session_user, person_map):
    for item in MemoryAlbumItem.objects.filter(user=template_user):
        cloned_person = person_map.get(str(item.person_id))
        if not cloned_person:
            continue

        MemoryAlbumItem.objects.create(
            user=session_user,
            person=cloned_person,
            # 원본 사진은 읽기 전용으로 함께 사용한다. 데모 사용자의 삭제는 파일을 지우지 않는다.
            photo=item.photo.name if item.photo else '',
            description=item.description,
            crop_x=item.crop_x,
            crop_y=item.crop_y,
        )


def _clone_record_history(template_user, session_user):
    meal_map = {}

    for meal_record in MealRecord.objects.filter(user=template_user):
        cloned_meal_record = MealRecord.objects.create(
            user=session_user,
            meal_type=meal_record.meal_type,
            eaten_at=meal_record.eaten_at,
            menu=meal_record.menu,
            memo=meal_record.memo,
            # 원본 사진은 읽기 전용으로 함께 사용한다. 데모 사용자의 삭제는 파일을 지우지 않는다.
            scene_image=meal_record.scene_image.name if meal_record.scene_image else None,
            source=meal_record.source,
        )
        meal_map[meal_record.id] = cloned_meal_record

    for event in MealContextEvent.objects.filter(user=template_user):
        MealContextEvent.objects.create(
            user=session_user,
            recent_meal_record=meal_map.get(event.recent_meal_record_id),
            detected_at=event.detected_at,
            is_meal_scene=event.is_meal_scene,
            meal_scene_probability=event.meal_scene_probability,
            context_result=event.context_result,
            user_action=event.user_action,
        )

    for event in ConfusionEvent.objects.filter(user=template_user):
        ConfusionEvent.objects.create(
            user=session_user,
            confusion_type=event.confusion_type,
            occurred_at=event.occurred_at,
        )

    for event in PatientQuestionEvent.objects.filter(user=template_user):
        PatientQuestionEvent.objects.create(
            user=session_user,
            transcript=event.transcript,
            input_method=event.input_method,
            intent_type=event.intent_type,
            response_summary=event.response_summary,
            occurred_at=event.occurred_at,
        )


@transaction.atomic
def create_demo_experience_session(template_user, mode):
    """원본 페르소나의 데이터를 복제한, 브라우저별 데모 사용자를 생성한다."""
    session_user = _create_demo_user(template_user)
    person_map = _clone_people(template_user, session_user)
    conversation_map = _clone_conversations(template_user, session_user, person_map)
    memory_map = _clone_memories(
        template_user,
        session_user,
        person_map,
        conversation_map,
    )
    _clone_people_context(
        template_user,
        session_user,
        person_map,
        conversation_map,
        memory_map,
    )
    _clone_memory_album_items(template_user, session_user, person_map)
    _clone_record_history(template_user, session_user)

    expires_at = timezone.now() + timedelta(
        hours=settings.DEMO_EXPERIENCE_SESSION_HOURS,
    )
    return DemoExperienceSession.objects.create(
        template_user=template_user,
        session_user=session_user,
        mode=mode,
        expires_at=expires_at,
    )


def is_demo_session_user(user):
    if not getattr(user, 'is_authenticated', False):
        return False

    return DemoExperienceSession.objects.filter(session_user=user).exists()


def expire_demo_session_if_needed(user):
    """만료된 데모 세션은 다음 접속부터 사용할 수 없게 처리한다."""
    if not getattr(user, 'is_authenticated', False):
        return False

    demo_session = DemoExperienceSession.objects.filter(session_user=user).first()
    if demo_session is None:
        return False

    if demo_session.is_expired:
        if user.is_active:
            user.is_active = False
            user.save(update_fields=['is_active'])
        return True

    DemoExperienceSession.objects.filter(pk=demo_session.pk).update(
        last_accessed_at=timezone.now(),
    )
    return False


def delete_expired_demo_sessions():
    """만료된 세션 사용자와 그 복제 데이터를 정리한다."""
    expired_sessions = list(
        DemoExperienceSession.objects.select_related('session_user').filter(
            expires_at__lte=timezone.now(),
        ),
    )

    for demo_session in expired_sessions:
        # Django의 모델 삭제는 FileField 원본 파일을 자동 삭제하지 않으므로,
        # 원본 페르소나와 공유하는 데모 사진은 안전하게 유지된다.
        demo_session.session_user.delete()

    return len(expired_sessions)
