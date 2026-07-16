# Contributing

velog2tistory에 관심 가져주셔서 감사합니다! 이슈 등록과 PR 모두 환영합니다. :)

## 목차

- [기여하기 좋은 것들](#기여하기-좋은-것들)
- [이슈 등록](#이슈-등록)
- [개발 환경 세팅](#개발-환경-세팅)
- [PR 절차](#pr-절차)
- [셀렉터 수정 가이드](#셀렉터-수정-가이드)
- [코드 스타일](#코드-스타일)

## 기여하기 좋은 것들

해당 프로젝트는 Tistory 에디터를 브라우저 자동화로 조작하기 때문에, **Tistory UI가 바뀌면 셀렉터가 깨지는 문제가 있습니다.** 가장 도움이 되는 기여는 다음과 같습니다.

- **셀렉터 수정**: 에디터 DOM 변경으로 동작하지 않는 부분 고치기
- **버그 리포트**: 재현 가능한 에러 상황 공유
- **문서 개선**: 설치·트러블슈팅 과정에서 막혔던 지점 보완
- **엣지 케이스 처리**: 특정 마크다운 문법이나 이미지 형식이 깨지는 경우

## 이슈 등록

버그를 발견하면 이슈를 남겨주세요. 아래 정보가 있으면 훨씬 빠르게 대응할 수 있습니다.

- 실행한 명령어 (예: `python 4_publish_tistory.py --limit 1`)
- **전체 에러 로그** (스택 트레이스 포함)
- OS와 Python 버전
- Playwright 버전 (`pip show playwright`)
- 발생 날짜 : Tistory UI 변경 시점을 추적하는 데 중요합니다

셀렉터 관련 이슈라면 실패한 셀렉터와, 가능하다면 Playwright Inspector로 찾은 새 셀렉터를 함께 적어주세요.

## 개발 환경 세팅

```bash
git clone https://github.com/yooncandooit/velog2tistory.git
cd velog2tistory

pip install -r requirements.txt
playwright install chromium

cp config.example.py config.py # 값을 채워주세요
```

`config.py`, `tistory_state.json`, `published.json`은 개인 정보와 로컬 상태를 담고 있어 `.gitignore`에 포함되어 있습니다. **커밋되지 않도록 주의해 주세요**

## PR 절차

1. 저장소를 fork 합니다.
2. 작업 브랜치를 만듭니다. (`git checkout -b fix/markdown-selector`)
3. 변경 후 **실제로 동작하는지 확인**합니다.
   - 발행 로직을 건드렸다면 `--limit 1`로 글 하나만 테스트
   - `--dry-run`은 브라우저를 띄우지 않아 안전하게 대상만 확인할 수 있습니다
4. 커밋하고 push한 뒤 PR을 올립니다.

> cf. `main` 브랜치는 보호되어 있어 PR을 통해서만 병합됩니다.

## 셀렉터 수정 가이드

Tistory 에디터 셀렉터가 깨졌다면 다음 순서로 찾는 것을 권장합니다.

1. `python 4_publish_tistory.py --limit 1` 로 실행하면 브라우저가 열립니다.
2. 실패 지점에서 **Playwright Inspector**의 `Pick locator` 버튼을 누릅니다.
3. 화면에서 해당 요소를 클릭하면 정확한 셀렉터가 생성됩니다.
4. 해당 셀렉터로 코드를 수정합니다.

셀렉터는 가능한 한 **접근성 역할(role) 기반**을 우선해주세요. 클래스명이나 자동 생성 ID보다 UI 변경에 덜 취약합니다.

```python
# 권장
page.get_by_role("button", name="공개 발행").click()

# 비권장 (변경에 취약)
page.click("#publish-btn-2024")
```

### 발행 동작을 수정할 때

본문 입력은 반드시 **실제 키보드 입력**을 사용해야 합니다. `CodeMirror.setValue()` 같은 프로그래밍 주입은 Tistory의 변경 감지를 거치지 않아, 에디터 화면에는 글이 보여도 **발행 시 본문이 비어버립니다.**

## 코드 스타일

- 표준 라이브러리 → 서드파티 → 로컬 순으로 import
- 주석은 **"왜"** 그렇게 했는지를 설명할 때만 작성합니다. 코드를 읽으면 알 수 있는 "무엇"은 생략합니다.
- 새 의존성 추가는 지양합니다. 꼭 필요하다면 PR에 이유를 적어주세요!

---

궁금한 점은 [이슈](https://github.com/yooncandooit/velog2tistory/issues)로 편하게 남겨주세요.
