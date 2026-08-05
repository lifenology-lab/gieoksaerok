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
