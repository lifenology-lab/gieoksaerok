# 기억새록

Frontend 실행 방법
cd frontend
npm install
npm run dev

daily-mode 인물 인식 기능을 사용하려면 @vladmandic/face-api 모델 파일을
frontend/public/models/face-api 폴더에 넣어야 합니다.
필요한 파일 목록은 frontend/public/models/face-api/README.md 참고.
Backend 실행 방법

Windows + Git Bash 기준:

cd backend
source venv/Scripts/activate
python manage.py runserver

macOS / Linux 기준:

cd backend
source venv/bin/activate
python manage.py runserver

가상환경을 새로 만들어야 하는 경우,

Windows 기준:

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

macOS / Linux:

cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

BackendDB 초기화 및 Migration

모델을 새로 만들거나 수정한 경우:
python manage.py makemigrations

생성된 migration을 실제 DB에 반영:
python manage.py migrate

사람 등록 DB 테이블을 처음 만들 때도 아래 명령을 실행해야 합니다:
python manage.py migrate
