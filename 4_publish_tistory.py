"""저장된 세션으로 Tistory 에디터를 열어 마크다운 글을 발행한다.

이미지는 2단계에서 CDN 링크로 치환되어 있다고 가정한다.
글은 프런트매터 date 기준 오름차순(오래된 글 -> 최근 글)으로 발행한다.
발행에 성공한 글은 published.json에 기록되어 다음 실행 때 자동으로 건너뛴다.

    python 4_publish_tistory.py                        # 아직 발행하지 않은 글만
    python 4_publish_tistory.py --dry-run              # 발행 대상만 미리 확인
    python 4_publish_tistory.py --limit 1              # 첫 글만 테스트
    python 4_publish_tistory.py --confirm              # 글마다 발행 전 확인
    python 4_publish_tistory.py --all                  # 이력 무시하고 전체 발행
"""
import argparse
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import config

STATE_FILE = "tistory_state.json"
HISTORY_FILE = Path("published.json")
NEWPOST_URL = f"https://{config.TISTORY_BLOG}.tistory.com/manage/newpost/"
MARKDOWN_CM = ".CodeMirror.cm-s-tistory-markdown"


def load_history():
    if not HISTORY_FILE.exists():
        return set()
    try:
        return set(json.loads(HISTORY_FILE.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, TypeError):
        print(f"경고: {HISTORY_FILE}를 읽을 수 없어 빈 이력으로 시작합니다.")
        return set()


def save_history(published):
    HISTORY_FILE.write_text(
        json.dumps(sorted(published), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def parse_markdown(text):
    title, date, body = "제목없음", "", text
    if text.startswith("---"):
        _, front, body = text.split("---", 2)
        for line in front.splitlines():
            line = line.strip()
            if line.startswith("title:"):
                title = line.split(":", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("date:"):
                date = line.split(":", 1)[1].strip()
    return title, date, body.strip()


def switch_to_markdown(page):
    """마크다운 모드로 전환. 전환 확인은 네이티브 confirm 다이얼로그라 accept 한다."""
    page.once("dialog", lambda d: d.accept())
    page.get_by_label("기본모드").get_by_role("button", name="기본모드").click()
    page.get_by_role("menuitem", name="마크다운").click()
    page.wait_for_timeout(1000)


def fill_body(page, body):
    """실제 키보드 입력으로 본문을 채운다.

    setValue 같은 프로그래밍 주입은 Tistory의 변경 감지를 건드리지 않아
    발행 시 본문이 비어버린다. 실제 입력이라야 저장 필드까지 동기화된다.
    """
    page.locator(f"{MARKDOWN_CM} .CodeMirror-lines").first.click()
    page.keyboard.insert_text(body)
    page.wait_for_timeout(300)


def body_length(page):
    return page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            return (el && el.CodeMirror) ? el.CodeMirror.getValue().length : 0;
        }""",
        MARKDOWN_CM,
    )


def publish_one(page, title, body, confirm):
    """발행에 성공하면 True, 본문이 비어 건너뛰었으면 False를 반환한다."""
    page.goto(NEWPOST_URL)
    page.wait_for_load_state("networkidle")

    for label in ("취소", "닫기"):
        try:
            page.get_by_role("button", name=label).click(timeout=1500)
        except Exception:
            pass

    switch_to_markdown(page)
    page.get_by_role("textbox", name="제목을 입력하세요").fill(title)
    fill_body(page, body)

    length = body_length(page)
    print(f"  body length: {length}")
    if length < 5:
        print("  skip: body appears empty")
        return False

    if confirm:
        input(f'  publish "{title}"? Enter to continue, Ctrl+C to stop: ')

    page.get_by_role("button", name="완료").click()
    time.sleep(1)
    page.get_by_role("button", name="공개 발행").click()
    time.sleep(3)
    return True


def collect_targets(args, published):
    """발행 대상을 date 오름차순으로 고른다. 이력에 있는 글은 제외한다."""
    files = list(Path(config.EXPORT_DIR).glob("*.md"))
    files.sort(key=lambda p: parse_markdown(p.read_text(encoding="utf-8"))[1])

    if not args.all:
        skipped = [f for f in files if f.stem in published]
        files = [f for f in files if f.stem not in published]
        if skipped:
            print(f"이미 발행된 글 {len(skipped)}개를 건너뜁니다.")

    files = files[args.start:]
    if args.limit:
        files = files[:args.limit]
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--all", action="store_true",
                        help="발행 이력을 무시하고 모든 글을 발행")
    parser.add_argument("--dry-run", action="store_true",
                        help="실제 발행 없이 대상 글만 출력")
    args = parser.parse_args()

    published = load_history()
    targets = collect_targets(args, published)

    if not targets:
        raise SystemExit("발행할 새 글이 없습니다.")

    if args.dry_run:
        print(f"발행 대상 {len(targets)}개:")
        for md in targets:
            title, date, _ = parse_markdown(md.read_text(encoding="utf-8"))
            print(f"  {date[:10]}  {title}")
        return

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=config.HEADLESS)
        context = browser.new_context(storage_state=STATE_FILE)
        page = context.new_page()
        for i, md in enumerate(targets, start=1):
            title, _, body = parse_markdown(md.read_text(encoding="utf-8"))
            print(f"[{i}/{len(targets)}] {title}")
            try:
                if publish_one(page, title, body, args.confirm):
                    published.add(md.stem)
                    save_history(published)
                    print("  published")
            except Exception as e:
                print(f"  failed: {e}")
            time.sleep(config.PUBLISH_DELAY_SEC)
        browser.close()


if __name__ == "__main__":
    main()