"""설정 템플릿. 이 파일을 config.py 로 복사한 뒤 값을 채우세요.

    cp config.example.py config.py
"""

# Velog
VELOG_USERNAME = "your_velog_id"                # velog.io/@your_velog_id
VELOG_GRAPHQL = "https://v2.velog.io/graphql"   # 실패 시 https://v3.velog.io/graphql

# Tistory
TISTORY_BLOG = "your_blog"                       # your_blog.tistory.com 의 서브도메인

# 이미지 재호스팅 (jsDelivr가 서빙할 public GitHub 저장소)
GH_USER = "your_github_id"
GH_REPO = "your_image_repo"                      # 반드시 public
GH_BRANCH = "main"

# 로컬 경로
EXPORT_DIR = "velog_export"                       # 추출한 .md 저장 폴더
ASSETS_DIR = "assets"                             # 다운로드한 이미지 폴더

# 발행 옵션
PUBLISH_DELAY_SEC = 5                             # 글 사이 간격(초)
HEADLESS = False                                  # True면 브라우저 창 없이 실행
