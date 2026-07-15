# 기억새록

Frontend 실행 방법
cd frontend
npm install
npm run dev
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
