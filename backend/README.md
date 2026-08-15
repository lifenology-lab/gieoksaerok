# 백엔드 실행 방법

```
# 1. .env 파일 생성 (.env.example 참고 | Django-key: https://djecrety.ir/)

# 2. 가상환경 생성
uv venv --python 3.13
source .venv/bin/activate
uv pip install -r requirements.txt

# 3. DB migrate 및 서버 실행
python manage.py migrate
python manage.py runserver
```

## 만료된 약속 정리

```
python manage.py cleanup_expired_promises
```

기본적으로 `PROMISE_EXPIRED_RETENTION_DAYS`일 동안 expired 상태로 보관된 약속을 삭제합니다.
로컬이나 배포 환경에서는 위 명령을 cron, launchd, 배포 플랫폼 scheduler 등에 하루 1회 정도 등록해서 사용하면 됩니다.

## 실제 음성 기반 대화 요약 품질 평가 테스트

macOS 한국어 TTS로 테스트용 환자-인물 대화 음성 파일을 만든 뒤, 실제 OpenAI STT/요약 API를 호출해 인물 인식 카드가 치매 환자에게 읽기 쉬운지 검사합니다. API 비용이 발생하므로 기본 테스트에서는 실행되지 않습니다.

```
RUN_OPENAI_AUDIO_EVAL_TESTS=1 DB_ENGINE=sqlite python manage.py test people.tests.OpenAIAudioConversationQualityEvalTests
```
