# 데모 페르소나 시드 자료

이 폴더는 원본 데모 페르소나(최선영 씨)에만 넣는 자료의 원본입니다.
데모 체험을 시작하면 `DemoExperienceSession` 복제 로직이 원본 계정의 인물과
추억 앨범을 체험 계정으로 복제합니다.

> 이 폴더의 추억 이미지와 서술은 전시용 데모를 위해 AI로 만든 가상의 자료입니다.
> 실제 인물의 사진이나 실제 경험을 사용하지 않습니다.

## 파일 구성

- `people/jimin/`: 김지민 씨의 얼굴 인식 등록에 사용할 사진과 face descriptor 자료
- `memory-photos/jimin/`: 김지민 씨와 관련된 12개 추억 사진
- `memory-items.json`: 사진별 보호자 원문 메모와 환자용 한 문장 요약

## 설명 저장 원칙

보호자 원문 메모(`caregiver_note`)는 시드 자료 안에서만 관리합니다. DB에는 저장하지
않고, 환자에게 보여줄 `description`만 `MemoryAlbumItem`에 저장합니다. 따라서 데모
데이터가 복제된 뒤에도 보호자 원문은 노출되지 않습니다.

## 사진 추가 방법

1. `memory-photos/jimin/`에 사진을 추가합니다.
2. `memory-items.json`의 `photo`에 해당 파일의 상대 경로를 적습니다.
3. `description`에는 환자에게 보여줄 짧고 따뜻한 한 문장을 적습니다.
4. `caregiver_note`에는 시드 작성과 검토를 위한 보호자 관점의 상세 설명을 적습니다.

사진 파일명은 촬영 시점을 알 수 있도록 `2026_oct.png`처럼 연도와 월을 포함하는 것을
권장합니다.

## 김지민 인물 등록

`people/jimin/person.json`에는 인물의 이름·관계와 descriptor 파일 경로가 있습니다.
`face-descriptor.example.json`을 `face-descriptor.json`으로 복사한 뒤, 브라우저의
face-api가 추출한 128개 숫자 배열을 `descriptor`에 넣습니다. 두 보호자 사진에서
추출한 descriptor는 평균을 내어 사용할 것을 권장합니다.

개발 서버를 실행한 뒤 `http://localhost:5173/dev/demo-face-descriptor`를 열면 두
보호자 사진의 평균 descriptor를 만들고 `face-descriptor.json` 파일로 내려받을 수
있습니다. 내려받은 파일을 `people/jimin/face-descriptor.json`에 저장합니다.

모든 자료를 채운 뒤에는 아래 명령을 한 번 실행합니다. 명령은 같은 김지민 인물과
같은 추억 사진을 중복 생성하지 않고 갱신합니다.

```powershell
venv\Scripts\python.exe manage.py seed_demo_persona
```
