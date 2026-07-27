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
