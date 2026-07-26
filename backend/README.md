# 백엔드 실행 방법

```
# 가상환경 생성
uv venv --python 3.13
source .venv/bin/activate
uv pip install -r requirements.txt

# DB migrate 및 서버 실행
python manage.py migrate
python manage.py runserver
```
