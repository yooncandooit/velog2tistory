# velog2tistory

<p align="center">
  <a href="#라이선스"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.9%2B-blue?logo=python&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-1.44%2B-2EAD33?logo=playwright&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey">
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
  <img alt="Maintenance" src="https://img.shields.io/badge/maintained-yes-brightgreen.svg">
</p>

<b>[Velog](https://velog.io/) 글을 [Tistory](https://www.tistory.com/)로 자동 이전하는 스크립트</b><br/>
본문, 이미지, 최신순 발행까지 그대로 서빙합니다 🏝️

---

## Contents (목차)

- [Overview (개요)](#overview)
- [Pipeline (동작 방식)](#pipeline)
- [Requirements (시작 전 준비)](#requirements)
- [Installation (설치)](#installation)
- [Configuration (config 설정)](#configuration)
- [Usage (사용법)](#usage)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Contributing (기여)](#contributing)
- [Known Limitations (현재까지 발견한 이슈)](#known-limitations)
- [Disclaimer (주의 사항)](#disclaimer)
- [License](#license)

---

## Overview

Velog에서 Tistory로 블로그를 옮길 때, 글을 하나하나 복붙 하는 번거로운 과정을 자동화하기 위해 시작한 OSS 프로젝트입니다.

- **본문**: Velog GraphQL API로 전체 글을 마크다운으로 추출
- **이미지**: Velog 이미지를 GitHub로 옮겨 [jsDelivr](https://www.jsdelivr.com/) CDN으로 서빙
- **발행**: [Playwright](https://playwright.dev/)로 Tistory 에디터를 조작해 마크다운 그대로 발행

> **왜 브라우저 자동화인가?** Tistory Open API는 2024년 2월에 종료되어, 글을 프로그래밍으로 발행하는 공식 통로가 없기 때문에 차선책으로 발행 단계는 사람이 에디터를 쓰는 것을 흉내 내는 방식으로 우회해서 동작합니다.

## Pipeline

```
1. 추출              2. 이미지               3. 발행
Velog GraphQL   ->   다운로드 + GitHub    ->  Playwright로
   *.md 저장          + jsDelivr 링크 치환      Tistory 에디터 발행
```

| 단계             | 스크립트               | 자동화 수준          |
| ---------------- | ---------------------- | -------------------- |
| 추출             | `1_export_velog.py`    | 완전 자동            |
| 이미지 재호스팅  | `2_rehost_images.py`   | 완전 자동            |
| 로그인 세션 저장 | `3_login_tistory.py`   | 최초 1회 수동 로그인 |
| 발행             | `4_publish_tistory.py` | 반자동 (세션 재사용) |

## Requirements

- Python 3.9 이상
- Velog 계정 (본인 글 추출용)
- Tistory 계정
- 이미지 호스팅용 **public** GitHub 저장소

## Installation

```bash
git clone https://github.com/yooncandooit/velog2tistory.git
cd velog2tistory

pip install -r requirements.txt
playwright install chromium
```

## Configuration

`config.example.py`를 복사해 `config.py`를 만들고 값을 채웁니다. (`config.py`는 `.gitignore`에 포함되어 커밋되지 않습니다.)

```bash
cp config.example.py config.py
```

| 항목                                | 설명                                                         |
| ----------------------------------- | ------------------------------------------------------------ |
| `VELOG_USERNAME`                    | Velog 아이디 (`velog.io/@아이디`)                            |
| `TISTORY_BLOG`                      | Tistory 서브도메인 (`서브도메인.tistory.com`)                |
| `GH_USER` / `GH_REPO` / `GH_BRANCH` | 이미지 호스팅용 **public** GitHub 저장소                     |
| `PUBLISH_DELAY_SEC`                 | 글 사이 발행 간격(초). 너무 짧으면 어뷰징으로 오인될 수 있음 |
| `HEADLESS`                          | `True`면 브라우저 창 없이 실행. 처음엔 `False` 권장          |

> **이미지 저장소는 반드시 public이어야 합니다.** jsDelivr와 GitHub raw는 private 저장소의 파일을 서빙하지 않습니다.

## Usage

아래 순서대로 실행합니다.

```bash
# 1) Velog 전체 글 추출 -> velog_export/*.md
python 1_export_velog.py

# 2) 이미지 다운로드 + CDN 링크 치환 + GitHub push
python 2_rehost_images.py

# 3) Tistory 로그인 세션 저장 (최초 1회)
python 3_login_tistory.py

# 4) 발행 전 먼저 하나만 테스트!
python 4_publish_tistory.py --limit 1

# 검증되면 전체 발행 (글마다 확인하며 진행하려면 --confirm 옵션 사용)
python 4_publish_tistory.py --confirm
```

**발행 옵션**

| 옵션        | 설명                           |
| ----------- | ------------------------------ |
| `--limit N` | 앞에서 N개만 발행              |
| `--start N` | N번째 글부터 발행 (0부터 시작) |
| `--confirm` | 글마다 발행 직전에 멈추고 확인 |

글은 **작성일 기준 오름차순**(오래된 글 → 최근 글)으로 발행되어, Tistory에서도 시간 순서가 유지됩니다.

## Troubleshooting & FAQ

<details>
<summary><b>마크다운 문법(<code>#</code>, <code>**</code>)이 그대로 노출돼요</b></summary>

마크다운 모드 전환이 실제로는 안 된 채 발행된 경우입니다. 전환 시 뜨는 네이티브 확인창을 스크립트가 자동 수락하도록 되어 있는데, 에디터 UI가 바뀌면 이 부분이 깨질 수 있습니다. `--limit 1`로 실행해 로그와 화면을 확인하세요.

</details>

<details>
<summary><b>발행하면 본문이 비어 있어요</b></summary>

에디터에 값은 들어갔지만 Tistory의 저장 필드에 동기화되지 않은 경우입니다. 이 프로젝트는 프로그래밍 주입 대신 실제 키보드 입력으로 본문을 채워 이를 방지합니다. 그래도 발생하면 이슈에 등록해주세요.

</details>

<details>
<summary><b>이미지가 404로 안 떠요</b></summary>

이미지 저장소가 <b>private</b>이면 jsDelivr가 서빙하지 못합니다. 저장소를 public으로 바꾸세요. 방금 public으로 전환했다면 CDN 캐시가 갱신될 때까지 몇 분 기다리거나, <code>https://purge.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}</code> 로 캐시를 강제 갱신하세요.

</details>

<details>
<summary><b>셀렉터를 못 찾는다는 에러가 나요</b></summary>

Tistory 에디터 DOM이 바뀌면 셀렉터가 어긋날 수 있습니다. <code>python 4_publish_tistory.py --limit 1</code> 로 실행하면 브라우저가 열린 채 멈추므로, Playwright Inspector의 <b>Pick locator</b>로 실제 셀렉터를 확인해 수정하거나 이슈로 남겨주세요.

</details>

<a id="contributing"></a>
## 🌱 Contributing

### Known Limitations

- 이후에 Tistory 에디터 UI가 변경되면 셀렉터가 깨질 수 있습니다.
- 이미지는 Velog CDN에서 내려받아 GitHub로 재호스팅하며, Tistory 자체 이미지 서버로는 올리지 않습니다.
- 대량 연속 발행은 어뷰징으로 오인될 수 있으니 `PUBLISH_DELAY_SEC`를 충분히 두세요.
- 간헐적으로 본문 전체에 ~~취소선~~이 그어지는 이슈가 있습니다. 다시 취소선 버튼을 누르면 해지됩니다.

버그나 개선점을 발견하면 [이슈](https://github.com/yooncandooit/velog2tistory/issues)를 남겨주세요! 특히 **Tistory 에디터 셀렉터 변경**은 재현 환경(브라우저, 날짜)와 함께 알려주시면 빠르게 대응할 수 있으며, PR도 환영합니다.

## Disclaimer

이 도구는 **본인 계정에서 본인이 작성한 글을 이전/백업**하는 개인 용도로 만들어졌습니다. 브라우저 자동화를 사용하므로, 각 플랫폼의 이용약관 확인과 준수 책임은 사용자에게 있습니다. 본 소프트웨어는 "있는 그대로(as-is)" 제공되며, 사용으로 발생하는 어떤 문제에 대해서도 저작자는 책임지지 않습니다.

## License

[MIT](./LICENSE) © 2026 yooncandooit
